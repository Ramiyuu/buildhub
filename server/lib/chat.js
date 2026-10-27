const crypto = require("crypto");
const { query } = require("../db");
const config = require("../config");
const bus = require("./bus");
const { generateReply } = require("./ai");
const { redactSecrets } = require("./chat-safety");
const { getSetting } = require("./settings");
const { isUuid } = require("./http");
const { ipHash, clientIp } = require("./geo");

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const cookieOptions = { httpOnly: true, secure: config.isProd, sameSite: "strict", path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 };
const HUMAN_WORDS = /\b(atendente|humano|pessoa de verdade|falar com (algu[eé]m|uma pessoa|o dono|um consultor)|suporte humano)\b/i;

const HANDOFF_TEXT = "Seu atendimento foi registrado para a equipe BuildHub. A IA fica pausada enquanto um administrador avalia a conversa. Ainda nao ha um prazo de resposta confirmado.";
const QUOTE_TEXT = "Sua solicitacao de orcamento foi registrada para um administrador da BuildHub avaliar. Ele tera acesso ao historico desta conversa. A IA fica pausada; valores e prazos serao confirmados pela equipe.";

// Mensagem como o visitante e o painel enxergam.
const present = (row) => ({ id: Number(row.id), sender: row.sender, body: row.body, author: row.author || null, createdAt: row.created_at });

async function fromCookie(req) {
  const raw = req.cookies?.[config.chat.cookieName];
  if (typeof raw !== "string") return null;
  const [id, token] = raw.split(".");
  if (!isUuid(id) || !token || token.length > 80) return null;
  const { rows } = await query("SELECT * FROM chat_conversations WHERE id = $1 AND status = 'open'", [id]);
  const conv = rows[0];
  if (!conv) return null;
  const a = Buffer.from(sha(token));
  const b = Buffer.from(conv.token_hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? conv : null;
}

async function create(req, res, { name, email }) {
  const token = crypto.randomBytes(24).toString("base64url");
  const { rows } = await query(
    "INSERT INTO chat_conversations (token_hash, visitor_name, visitor_email, country, region_code, ip_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [sha(token), name || null, email || null, req.geo?.country || null, req.geo?.region || null, ipHash(clientIp(req))]
  );
  const conv = rows[0];
  res.cookie(config.chat.cookieName, `${conv.id}.${token}`, cookieOptions);
  return conv;
}

function clearCookie(res) {
  res.clearCookie(config.chat.cookieName, { ...cookieOptions, maxAge: undefined });
}

async function addMessage(conversationId, sender, body, { adminId = null, unread = false } = {}) {
  const preview = body.replace(/\s+/g, " ").slice(0, 120);
  const { rows } = await query(
    "INSERT INTO chat_messages (conversation_id, sender, admin_id, body) VALUES ($1,$2,$3,$4) RETURNING id, sender, body, created_at",
    [conversationId, sender, adminId, body]
  );
  await query(
    "UPDATE chat_conversations SET last_message_at = now(), last_message_preview = $2, unread_admin = unread_admin + $3 WHERE id = $1",
    [conversationId, preview, unread ? 1 : 0]
  );
  return rows[0];
}

async function getSummary(id) {
  const { rows } = await query(
    `SELECT c.id, c.visitor_name, c.visitor_email, c.country, c.region_code, c.mode, c.status, c.handoff_requested, c.unread_admin, c.ai_replies,
            c.last_message_at, c.last_message_preview, c.created_at, c.assigned_admin_id, u.name AS admin_name
       FROM chat_conversations c LEFT JOIN users u ON u.id = c.assigned_admin_id WHERE c.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Publica a mensagem para o visitante e para o painel.
async function publish(conversationId, message, { toVisitor = true } = {}) {
  const summary = await getSummary(conversationId);
  if (toVisitor) bus.emitVisitor(conversationId, "message", present(message));
  bus.emitAdmins("chat:message", { conversationId, message: present(message), conversation: summary });
  return summary;
}

async function requestHandoff(conversationId, reason, summary = "") {
  const { rowCount } = await query(
    "UPDATE chat_conversations SET handoff_requested = true, mode = 'human' WHERE id = $1 AND handoff_requested = false AND mode = 'ai' AND status = 'open'",
    [conversationId]
  );
  if (!rowCount) return false;
  const msg = await addMessage(conversationId, "system", reason === "quote" ? QUOTE_TEXT : HANDOFF_TEXT);
  const conversation = await publish(conversationId, msg);
  bus.emitVisitor(conversationId, "mode", { mode: "human", admin: "Aguardando equipe" });
  bus.emitAdmins("chat:mode", { conversationId, mode: "human" });
  const safeSummary = redactSecrets(summary).slice(0, 1800);
  await bus.notify({
    type: "handoff",
    title: reason === "quote" ? "Orcamento aguardando administrador" : "Atendimento aguardando equipe",
    body: `${conversation?.visitor_name || "Visitante"}: ${safeSummary || reason || "atendimento humano solicitado"}`,
    link: `#/chat/${conversationId}`,
    data: { conversationId, reason, summary: safeSummary }
  });
  return true;
}

const busy = new Set();
const rerun = new Set();

// Gera a resposta da IA. Se um administrador assumir a conversa no meio do caminho, a resposta e descartada.
async function respondWithAi(conversationId) {
  if (busy.has(conversationId)) { rerun.add(conversationId); return; }
  busy.add(conversationId);
  try {
    let conv = await getSummary(conversationId);
    if (!conv || conv.mode !== "ai" || conv.handoff_requested || conv.status !== "open") return;
    const settings = await getSetting("chat");

    if (!settings.aiEnabled) {
      await requestHandoff(conversationId, "IA desligada nas configurações");
      return;
    }
    if (conv.ai_replies >= config.chat.maxAiRepliesPerConversation) {
      await requestHandoff(conversationId, "limite de respostas automáticas atingido");
      return;
    }

    bus.emitVisitor(conversationId, "typing", { on: true });
    const { rows } = await query(
      "SELECT sender, body FROM chat_messages WHERE conversation_id = $1 AND sender IN ('visitor','ai','admin') ORDER BY id DESC LIMIT $2",
      [conversationId, config.chat.historyForAi]
    );
    const history = rows.reverse();

    let reply;
    try {
      reply = await generateReply(history, settings);
    } catch (error) {
      console.error("[chat] IA indisponivel:", error.message);
      bus.notify({ type: "ai_error", title: "A IA não conseguiu responder", body: error.message.slice(0, 180), link: `#/chat/${conversationId}` });
      await requestHandoff(conversationId, "falha da IA");
      return;
    }

    conv = await getSummary(conversationId);
    if (!conv || conv.mode !== "ai" || conv.handoff_requested || conv.status !== "open") return; // admin assumiu enquanto a IA pensava
    if (reply.handoff) {
      await requestHandoff(conversationId, reply.reason || "human", reply.summary);
      return;
    }
    const msg = await addMessage(conversationId, "ai", reply.text);
    await query("UPDATE chat_conversations SET ai_replies = ai_replies + 1 WHERE id = $1", [conversationId]);
    await publish(conversationId, msg);
  } finally {
    bus.emitVisitor(conversationId, "typing", { on: false });
    busy.delete(conversationId);
    if (rerun.delete(conversationId)) respondWithAi(conversationId).catch((e) => console.error("[chat]", e.message));
  }
}

module.exports = { fromCookie, create, clearCookie, addMessage, getSummary, publish, requestHandoff, respondWithAi, present, HUMAN_WORDS };
