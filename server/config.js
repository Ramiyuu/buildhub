const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// .env.local primeiro (chave da OpenAI), depois .env. loadEnvFile nunca sobrescreve o que já existe.
for (const file of [".env.local", ".env"]) {
  const full = path.join(__dirname, "..", file);
  if (fs.existsSync(full)) {
    try { process.loadEnvFile(full); } catch { /* arquivo mal formatado: ignora */ }
  }
}

const env = process.env;
const isProd = env.NODE_ENV === "production";
const flag = (value, fallback = false) => (value === undefined || value === "" ? fallback : /^(1|true|yes|on)$/i.test(value));

let sessionSecret = env.SESSION_SECRET || "";
if (!sessionSecret || sessionSecret.length < 32) {
  if (isProd) {
    console.error("SESSION_SECRET ausente ou curto demais (minimo 32 caracteres). Defina nas Variables da Railway.");
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(32).toString("hex"); // dev: muda a cada boot (derruba sessoes)
}

const databaseUrl = env.DATABASE_URL || "";
const internalDb = /\.railway\.internal|localhost|127\.0\.0\.1/.test(databaseUrl);

module.exports = {
  isProd,
  port: Number(env.PORT) || 3000,
  databaseUrl,
  databaseSsl: flag(env.DATABASE_SSL, !internalDb),
  databasePoolMax: Math.max(1, Number(env.DATABASE_POOL_MAX) || 10),
  sessionSecret,
  trustProxy: Number.isFinite(Number(env.TRUST_PROXY)) && env.TRUST_PROXY !== "" ? Number(env.TRUST_PROXY) : 1,
  trustCloudflare: flag(env.TRUST_CLOUDFLARE),
  allowCountries: (env.ALLOW_COUNTRIES || "BR").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
  geoUnknown: (env.GEO_UNKNOWN || "block").toLowerCase() === "allow" ? "allow" : "block",
  admin: {
    email: (env.ADMIN_EMAIL || "admin@buildhub.dev").trim().toLowerCase(),
    passwordHash: env.ADMIN_PASSWORD_HASH || "",
    password: env.ADMIN_PASSWORD || ""
  },
  openai: {
    key: env.OPENAI_API_KEY || "",
    model: env.OPENAI_MODEL || "gpt-6-luna",
    effort: env.OPENAI_REASONING_EFFORT || "none",
    baseUrl: (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    mock: flag(env.AI_MOCK)
  },
  seedDemo: flag(env.SEED_DEMO),
  session: {
    cookieName: isProd ? "__Host-bh_sid" : "bh_sid",
    idleMs: 4 * 60 * 60 * 1000,
    absoluteMs: 24 * 60 * 60 * 1000
  },
  chat: {
    cookieName: isProd ? "__Host-bh_chat" : "bh_chat",
    maxMessageLength: 1000,
    maxAiRepliesPerConversation: 40,
    historyForAi: 16
  }
};
