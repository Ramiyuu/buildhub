const { query } = require("../db");

const DEFAULTS = {
  chat: {
    aiEnabled: true,
    greeting: "Olá! Sou a assistente virtual da BuildHub. Posso tirar dúvidas sobre sites, sistemas e landing pages, ou chamar um atendente. Como posso ajudar?",
    extraPrompt: ""
  }
};

const cache = new Map();

async function getSetting(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20000) return hit.value;
  const { rows } = await query("SELECT value FROM settings WHERE key = $1", [key]);
  const value = { ...(DEFAULTS[key] || {}), ...(rows[0]?.value || {}) };
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function setSetting(key, value) {
  await query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [key, JSON.stringify(value)]
  );
  cache.delete(key);
}

module.exports = { getSetting, setSetting };
