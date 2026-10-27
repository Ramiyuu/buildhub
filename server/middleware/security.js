const helmet = require("helmet");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const config = require("../config");
const events = require("../lib/events");
const { clientIp, isPrivate, lookup, maskIp } = require("../lib/geo");

// ---------------------------------------------------------------- cabecalhos (CSP, HSTS...)
const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "https://fonts.googleapis.com"],
      "style-src-attr": ["'unsafe-inline'"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
      ...(config.isProd ? { "upgrade-insecure-requests": [] } : {})
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
});

// ---------------------------------------------------------------- banimento temporario por IP (em memoria)
const bans = new Map();    // ip -> timestamp de liberacao
const strikes = new Map(); // ip -> { n, t0 }
const MAX_TRACKED = 5000;
const BAN_MS = 30 * 60 * 1000;
const STRIKE_WINDOW_MS = 10 * 60 * 1000;
const STRIKE_LIMIT = 10;
let lastBanNotice = 0;

function trim(map) {
  if (map.size <= MAX_TRACKED) return;
  const oldest = map.keys().next().value;
  map.delete(oldest);
}

function isBanned(ip) {
  const until = bans.get(ip);
  if (!until) return false;
  if (until < Date.now()) { bans.delete(ip); return false; }
  return true;
}

function strike(ip, reason) {
  if (!ip) return;
  const now = Date.now();
  const entry = strikes.get(ip);
  if (!entry || now - entry.t0 > STRIKE_WINDOW_MS) {
    strikes.set(ip, { n: 1, t0: now });
    trim(strikes);
    return;
  }
  entry.n += 1;
  if (entry.n >= STRIKE_LIMIT && !isBanned(ip)) {
    bans.set(ip, now + BAN_MS);
    trim(bans);
    strikes.delete(ip);
    events.record("ip_ban", { ip, detail: reason });
    if (now - lastBanNotice > 60000) {
      lastBanNotice = now;
      require("../lib/bus").notify({ type: "security", title: "IP bloqueado temporariamente", body: `${maskIp(ip)} foi banido por 30 min (${reason}).`, link: "#/seguranca" });
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, until] of bans) if (until < now) bans.delete(ip);
  for (const [ip, entry] of strikes) if (now - entry.t0 > STRIKE_WINDOW_MS) strikes.delete(ip);
}, 60000).unref();

const bannedCount = () => { const now = Date.now(); let n = 0; for (const until of bans.values()) if (until > now) n += 1; return n; };

// ---------------------------------------------------------------- geo-bloqueio + IP do cliente
function identifyClient(req, res, next) {
  if (req.path === "/health") return next();
  const ip = clientIp(req);
  req.clientIp = ip;

  if (isBanned(ip)) {
    res.set({ "Retry-After": "1800", "Cache-Control": "no-store" });
    return res.status(429).type("text/plain").send("Muitas requisicoes. Tente novamente mais tarde.");
  }

  // A localizacao e apenas informativa; nenhum pais ou IP desconhecido e bloqueado.
  req.geo = (!isPrivate(ip) && lookup(req, ip)) || { country: null, region: null, city: null };
  return next();
}

// ---------------------------------------------------------------- limites de requisicao
function limiter({ name, windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.clientIp || req.ip),
    handler: (req, res) => {
      strike(req.clientIp, name);
      events.record("rate_limit", { ip: req.clientIp, country: req.geo?.country, path: req.path, detail: name });
      res.status(429).json({ error: message || "Muitas requisições. Aguarde um pouco e tente de novo." });
    }
  });
}

const limits = {
  global: limiter({ name: "global", windowMs: 60 * 1000, limit: 420 }),
  login: limiter({ name: "login", windowMs: 15 * 60 * 1000, limit: 12, message: "Muitas tentativas de login. Tente novamente em alguns minutos." }),
  register: limiter({ name: "register", windowMs: 60 * 60 * 1000, limit: 6, message: "Muitos cadastros deste endereço. Tente mais tarde." }),
  chatMessage: limiter({ name: "chat", windowMs: 60 * 1000, limit: 14, message: "Você está enviando mensagens rápido demais." }),
  chatDaily: limiter({ name: "chat-dia", windowMs: 24 * 60 * 60 * 1000, limit: 400, message: "Limite diário de mensagens atingido." }),
  track: limiter({ name: "track", windowMs: 60 * 1000, limit: 90 }),
  stream: limiter({ name: "stream", windowMs: 60 * 1000, limit: 30 }),
  admin: limiter({ name: "admin", windowMs: 60 * 1000, limit: 900 })
};

// Bloqueia POST/PUT/PATCH/DELETE vindos de outra origem (camada extra contra CSRF).
function sameOrigin(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const raw = req.get("origin") || req.get("referer");
  if (!raw) return next();
  try {
    if (new URL(raw).host === req.get("host")) return next();
  } catch { /* cai no bloqueio */ }
  strike(req.clientIp, "origem");
  events.record("csrf_block", { ip: req.clientIp, country: req.geo?.country, path: req.path });
  return res.status(403).json({ error: "Origem não permitida." });
}

module.exports = { securityHeaders, identifyClient, limits, sameOrigin, strike, isBanned, bannedCount };
