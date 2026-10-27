const { query } = require("../db");
const { maskIp } = require("./geo");

// Eventos de seguranca ficam em memoria e vao para o banco em lote a cada 20s.
// Assim, mesmo sob ataque (milhares de requisicoes bloqueadas), o banco recebe poucas escritas.
const buffer = new Map();
const MAX_KEYS = 400;

function record(type, { ip, country, path, detail } = {}) {
  const key = buffer.size >= MAX_KEYS ? `${type}||` : `${type}|${country || ""}|${path || ""}|${detail || ""}`;
  const entry = buffer.get(key);
  if (entry) {
    entry.count += 1;
    entry.ip_masked = ip ? maskIp(ip) : entry.ip_masked;
  } else {
    buffer.set(key, { type, country: country || null, ip_masked: ip ? maskIp(ip) : null, path: path ? String(path).slice(0, 120) : null, detail: detail ? String(detail).slice(0, 200) : null, count: 1 });
  }
}

async function flush() {
  if (!buffer.size) return;
  const rows = [...buffer.values()];
  buffer.clear();
  const values = [];
  const marks = rows.map((row, i) => {
    values.push(row.type, row.country, row.ip_masked, row.path, row.detail, row.count);
    const o = i * 6;
    return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6})`;
  });
  try {
    await query(`INSERT INTO security_events (type, country, ip_masked, path, detail, count) VALUES ${marks.join(",")}`, values);
  } catch (error) {
    console.error("[events] falha ao gravar eventos:", error.message);
  }
}

setInterval(flush, 20000).unref();

module.exports = { record, flush };
