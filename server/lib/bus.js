const { query } = require("../db");

// Barramento SSE: visitantes (por conversa) e administradores (painel).
const visitors = new Map(); // conversationId -> Set<res>
const admins = new Set();   // Set<res>
const perIp = new Map();    // ip -> conexoes abertas
const MAX_PER_IP = 4;

function write(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function openStream(req, res, ip) {
  const used = perIp.get(ip) || 0;
  if (used >= MAX_PER_IP) {
    res.status(429).json({ error: "Muitas conexões abertas." });
    return false;
  }
  perIp.set(ip, used + 1);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("retry: 3000\n\n");
  res.on("close", () => {
    const left = (perIp.get(ip) || 1) - 1;
    if (left <= 0) perIp.delete(ip); else perIp.set(ip, left);
  });
  return true;
}

function addVisitor(conversationId, res) {
  if (!visitors.has(conversationId)) visitors.set(conversationId, new Set());
  visitors.get(conversationId).add(res);
  res.on("close", () => {
    const set = visitors.get(conversationId);
    if (!set) return;
    set.delete(res);
    if (!set.size) visitors.delete(conversationId);
  });
}

function addAdmin(res) {
  admins.add(res);
  res.on("close", () => admins.delete(res));
}

function emitAdmins(event, data) {
  for (const res of admins) if (!write(res, event, data)) admins.delete(res);
}

function emitVisitor(conversationId, event, data) {
  const set = visitors.get(conversationId);
  if (!set) return;
  for (const res of set) if (!write(res, event, data)) set.delete(res);
}

// Comentario a cada 25s para o proxy da Railway nao derrubar conexoes ociosas.
setInterval(() => {
  for (const res of admins) try { res.write(":hb\n\n"); } catch { admins.delete(res); }
  for (const set of visitors.values()) for (const res of set) try { res.write(":hb\n\n"); } catch { set.delete(res); }
}, 25000).unref();

const adminOnline = () => admins.size;

// Grava a notificacao e avisa os administradores conectados.
async function notify({ type, title, body = null, link = null, data = null }) {
  try {
    const { rows } = await query(
      "INSERT INTO notifications (type, title, body, link, data) VALUES ($1,$2,$3,$4,$5) RETURNING id, type, title, body, link, data, read_at, created_at",
      [type, title, body, link, data ? JSON.stringify(data) : null]
    );
    emitAdmins("notification", rows[0]);
    return rows[0];
  } catch (error) {
    console.error("[notify] falha:", error.message);
    return null;
  }
}

module.exports = { openStream, addVisitor, addAdmin, emitAdmins, emitVisitor, notify, adminOnline, write };
