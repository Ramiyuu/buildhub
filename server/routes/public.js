const express = require("express");
const { z } = require("zod");
const { query } = require("../db");
const bus = require("../lib/bus");
const chat = require("../lib/chat");
const { parse, HttpError } = require("../lib/http");
const { getSetting } = require("../lib/settings");
const { visitorHash, parseUserAgent, isBot } = require("../lib/geo");
const { limits } = require("../middleware/security");
const config = require("../config");

const router = express.Router();

// ------------------------------------------------------------------ visitas (anonimas)
const views = [];
const seen = new Map();
const trackSchema = z.object({ path: z.string().min(1).max(200), ref: z.string().max(300).optional() });

async function flushViews() {
  if (!views.length) return;
  const rows = views.splice(0, views.length);
  const values = [];
  const marks = rows.map((r, i) => {
    values.push(r.visitor, r.path, r.referrer, r.country, r.region, r.city, r.device, r.browser);
    const o = i * 8;
    return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8})`;
  });
  try {
    await query(`INSERT INTO page_views (visitor, path, referrer, country, region_code, city, device, browser) VALUES ${marks.join(",")}`, values);
  } catch (error) {
    console.error("[track] falha ao gravar visitas:", error.message);
  }
}
setInterval(flushViews, 8000).unref();

router.post("/track", limits.track, (req, res) => {
  res.status(204).end();
  const ua = req.get("user-agent") || "";
  if (isBot(ua) || req.user) return; // ignora robos e administradores/clientes logados
  let data;
  try { data = trackSchema.parse(req.body); } catch { return; }

  let pathname = data.path.split(/[?#]/)[0];
  if (!pathname.startsWith("/") || /^\/(admin|cliente|api)(\/|$)/.test(pathname)) return;
  pathname = pathname.replace(/\/index\.html$/, "/") || "/";

  const visitor = visitorHash(req.clientIp, ua);
  const key = `${visitor}|${pathname}`;
  const now = Date.now();
  if (now - (seen.get(key) || 0) < 15000) return;
  seen.set(key, now);
  if (seen.size > 5000) for (const [k, t] of seen) if (now - t > 15000) seen.delete(k);

  let host = null;
  try { host = data.ref ? new URL(data.ref).hostname.replace(/^www\./, "") : null; } catch { /* ref invalida */ }
  if (host && host === req.hostname) host = null;

  const { device, browser } = parseUserAgent(ua);
  if (views.length < 3000) {
    views.push({ visitor, path: pathname, referrer: host, country: req.geo?.country || null, region: req.geo?.region || null, city: req.geo?.city || null, device, browser });
  }
  if (views.length >= 100) flushViews();
});

// ------------------------------------------------------------------ chat publico
const messageSchema = z.object({
  body: z.string().trim().min(1, "Digite uma mensagem.").max(config.chat.maxMessageLength, `Mensagem muito longa (máximo ${config.chat.maxMessageLength} caracteres).`),
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(160).optional().or(z.literal("").transform(() => undefined))
});

router.get("/chat/history", async (req, res) => {
  const settings = await getSetting("chat");
  const conv = await chat.fromCookie(req);
  if (!conv) return res.json({ conversationId: null, mode: "ai", messages: [], greeting: settings.greeting });
  const { rows } = await query(
    `SELECT m.id, m.sender, m.body, m.created_at, split_part(u.name, ' ', 1) AS author
       FROM chat_messages m LEFT JOIN users u ON u.id = m.admin_id
      WHERE m.conversation_id = $1 ORDER BY m.id DESC LIMIT 100`,
    [conv.id]
  );
  res.json({ conversationId: conv.id, mode: conv.mode, handoff: conv.handoff_requested, messages: rows.reverse().map(chat.present), greeting: settings.greeting });
});

// No maximo 8 conversas novas por IP por hora: evita encher o painel e gastar a IA com conversas descartaveis.
const newConversations = new Map();
function allowNewConversation(ip) {
  const now = Date.now();
  const entry = newConversations.get(ip);
  if (!entry || now - entry.t0 > 3600000) { newConversations.set(ip, { n: 1, t0: now }); if (newConversations.size > 5000) newConversations.delete(newConversations.keys().next().value); return true; }
  entry.n += 1;
  return entry.n <= 8;
}

router.post("/chat/message", limits.chatMessage, limits.chatDaily, async (req, res) => {
  const data = parse(messageSchema, req.body);
  let conv = await chat.fromCookie(req);
  const isNew = !conv;
  if (isNew) {
    if (!allowNewConversation(req.clientIp)) throw new HttpError(429, "Muitas conversas iniciadas deste endereço. Tente novamente mais tarde.");
    conv = await chat.create(req, res, { name: data.name, email: data.email });
  }

  const wasUnread = conv.unread_admin > 0;
  const message = await chat.addMessage(conv.id, "visitor", data.body, { unread: true });
  await chat.publish(conv.id, message, { toVisitor: false });

  if (isNew) {
    bus.notify({ type: "chat_new", title: "Nova conversa no site", body: `${data.name || "Visitante"}: ${data.body.slice(0, 120)}`, link: `#/chat/${conv.id}` });
  } else if (conv.mode === "human" && !wasUnread) {
    bus.notify({ type: "chat_message", title: "Nova mensagem em conversa assumida", body: `${conv.visitor_name || "Visitante"}: ${data.body.slice(0, 120)}`, link: `#/chat/${conv.id}` });
  }

  res.status(201).json({ conversationId: conv.id, message: chat.present(message), mode: conv.mode });

  if (conv.mode === "ai") {
    if (chat.HUMAN_WORDS.test(data.body)) await chat.requestHandoff(conv.id, "pediu para falar com uma pessoa");
    chat.respondWithAi(conv.id).catch((error) => console.error("[chat]", error.message));
  }
});

router.post("/chat/handoff", limits.chatMessage, async (req, res) => {
  const conv = await chat.fromCookie(req);
  if (!conv) throw new HttpError(404, "Envie uma mensagem antes de chamar um atendente.");
  await chat.requestHandoff(conv.id, "clicou em falar com atendente");
  res.json({ ok: true });
});

router.post("/chat/close", async (req, res) => {
  const conv = await chat.fromCookie(req);
  if (conv) {
    await query("UPDATE chat_conversations SET status = 'closed', closed_at = now() WHERE id = $1", [conv.id]);
    bus.emitAdmins("chat:closed", { conversationId: conv.id });
  }
  chat.clearCookie(res);
  res.json({ ok: true });
});

router.get("/chat/stream", limits.stream, async (req, res) => {
  const conv = await chat.fromCookie(req);
  if (!conv) return res.status(404).json({ error: "Conversa não encontrada." });
  if (!bus.openStream(req, res, req.clientIp)) return;
  bus.addVisitor(conv.id, res);
  bus.write(res, "ready", { mode: conv.mode });
});

module.exports = router;
