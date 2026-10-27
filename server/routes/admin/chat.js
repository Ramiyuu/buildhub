const express = require("express");
const { z } = require("zod");
const { query } = require("../../db");
const bus = require("../../lib/bus");
const chat = require("../../lib/chat");
const { HttpError, parse, uuidParam } = require("../../lib/http");
const { audit } = require("../../lib/audit");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();
const firstName = (name) => String(name || "Atendente").split(" ")[0];

async function load(id) {
  const conv = await chat.getSummary(id);
  if (!conv) throw new HttpError(404, "Conversa não encontrada.");
  return conv;
}

router.get("/conversations", async (req, res) => {
  const status = req.query.status === "closed" ? "closed" : req.query.status === "all" ? null : "open";
  const { rows } = await query(
    `SELECT c.id, c.visitor_name, c.visitor_email, c.country, c.region_code, c.mode, c.status, c.handoff_requested, c.unread_admin, c.ai_replies,
            c.last_message_at, c.last_message_preview, c.created_at, c.is_demo, u.name AS admin_name
       FROM chat_conversations c LEFT JOIN users u ON u.id = c.assigned_admin_id
      WHERE ($1::text IS NULL OR c.status = $1)
      ORDER BY c.handoff_requested DESC, c.last_message_at DESC LIMIT 100`,
    [status]
  );
  res.json({ items: rows });
});

router.get("/conversations/:id", async (req, res) => {
  const id = uuidParam(req);
  const conv = await load(id);
  const { rows } = await query(
    `SELECT m.id, m.sender, m.body, m.created_at, split_part(u.name, ' ', 1) AS author
       FROM chat_messages m LEFT JOIN users u ON u.id = m.admin_id WHERE m.conversation_id = $1 ORDER BY m.id`,
    [id]
  );
  if (conv.unread_admin > 0) {
    await query("UPDATE chat_conversations SET unread_admin = 0 WHERE id = $1", [id]);
    bus.emitAdmins("chat:read", { conversationId: id });
    conv.unread_admin = 0;
  }
  res.json({ conversation: conv, messages: rows.map(chat.present) });
});

// Resposta do administrador: se a IA estava ativa, ela para (a conversa passa para o modo humano).
router.post("/conversations/:id/messages", async (req, res) => {
  const id = uuidParam(req);
  const { body } = parse(z.object({ body: z.string().trim().min(1, "Digite uma mensagem.").max(2000) }), req.body);
  const conv = await load(id);
  if (conv.status !== "open") throw new HttpError(409, "Esta conversa foi encerrada pelo visitante.");

  if (conv.mode !== "human") await takeover(req, id, conv);
  const message = await chat.addMessage(id, "admin", body, { adminId: req.user.id });
  await query("UPDATE chat_conversations SET assigned_admin_id = $2, handoff_requested = false WHERE id = $1", [id, req.user.id]);
  message.author = firstName(req.user.name);
  await chat.publish(id, message);
  res.status(201).json({ message: chat.present(message) });
});

async function takeover(req, id, conv) {
  if (conv.mode === "human" && conv.assigned_admin_id === req.user.id) return;
  await query("UPDATE chat_conversations SET mode = 'human', assigned_admin_id = $2, handoff_requested = false WHERE id = $1", [id, req.user.id]);
  const note = await chat.addMessage(id, "system", `${firstName(req.user.name)}, da equipe BuildHub, entrou na conversa.`);
  await chat.publish(id, note);
  bus.emitVisitor(id, "mode", { mode: "human", admin: firstName(req.user.name) });
  bus.emitAdmins("chat:mode", { conversationId: id, mode: "human", adminName: req.user.name });
  await audit(req, "chat.takeover", "conversation", id);
}

router.post("/conversations/:id/takeover", async (req, res) => {
  const id = uuidParam(req);
  const conv = await load(id);
  if (conv.status !== "open") throw new HttpError(409, "Esta conversa foi encerrada.");
  await takeover(req, id, conv);
  res.json({ conversation: await chat.getSummary(id) });
});

router.post("/conversations/:id/release", async (req, res) => {
  const id = uuidParam(req);
  const conv = await load(id);
  if (conv.status !== "open") throw new HttpError(409, "Esta conversa foi encerrada.");
  await query("UPDATE chat_conversations SET mode = 'ai', assigned_admin_id = NULL, handoff_requested = false WHERE id = $1", [id]);
  const note = await chat.addMessage(id, "system", "O atendimento automático voltou a responder. Se precisar, é só pedir para falar com um atendente.");
  await chat.publish(id, note);
  bus.emitVisitor(id, "mode", { mode: "ai" });
  bus.emitAdmins("chat:mode", { conversationId: id, mode: "ai" });
  await audit(req, "chat.release", "conversation", id);
  res.json({ conversation: await chat.getSummary(id) });
});

router.post("/conversations/:id/close", async (req, res) => {
  const id = uuidParam(req);
  await load(id);
  await query("UPDATE chat_conversations SET status = 'closed', closed_at = now(), unread_admin = 0 WHERE id = $1", [id]);
  const note = await chat.addMessage(id, "system", "Atendimento encerrado. Obrigado pelo contato!");
  bus.emitVisitor(id, "message", chat.present(note));
  bus.emitVisitor(id, "closed", {});
  bus.emitAdmins("chat:closed", { conversationId: id });
  await audit(req, "chat.close", "conversation", id);
  res.json({ ok: true });
});

router.post("/conversations/:id/lead", async (req, res) => {
  const id = uuidParam(req);
  const conv = await load(id);
  const data = parse(z.object({
    name: z.string().trim().min(2, "Informe o nome.").max(160),
    email: z.string().trim().toLowerCase().email().max(160).optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional(),
    notes: z.string().trim().max(2000).optional()
  }), req.body);
  const { rows } = await query(
    "INSERT INTO leads (name, email, phone, source, notes, conversation_id) VALUES ($1,$2,$3,'chat',$4,$5) RETURNING *",
    [data.name, data.email || conv.visitor_email || null, data.phone || null, data.notes || null, id]
  );
  await audit(req, "lead.from_chat", "lead", rows[0].id);
  res.status(201).json({ lead: rows[0] });
});

router.delete("/conversations/:id", requireAuth("admin"), async (req, res) => {
  const id = uuidParam(req);
  await query("DELETE FROM chat_conversations WHERE id = $1", [id]);
  await audit(req, "chat.delete", "conversation", id);
  bus.emitAdmins("chat:closed", { conversationId: id });
  res.json({ ok: true });
});

module.exports = router;
