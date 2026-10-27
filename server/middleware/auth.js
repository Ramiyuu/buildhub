const crypto = require("crypto");
const { query } = require("../db");
const config = require("../config");
const { clientIp, maskIp } = require("../lib/geo");
const events = require("../lib/events");
const { strike } = require("./security");

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const cookieOptions = { httpOnly: true, secure: config.isProd, sameSite: "strict", path: "/" };
const PASSWORD_ROUTES = ["/api/auth/change-password", "/api/auth/me", "/api/auth/logout"];

async function loadSession(req, res, next) {
  req.user = null;
  req.session = null;
  const token = req.cookies?.[config.session.cookieName];
  if (typeof token === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    const { rows } = await query(
      `SELECT s.id AS sid, s.csrf, s.created_at, s.last_seen_at,
              u.id, u.name, u.email, u.role, u.status, u.company_id, u.must_change_password
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [sha(token)]
    );
    const row = rows[0];
    if (row && row.status === "active") {
      req.user = { id: row.id, name: row.name, email: row.email, role: row.role, companyId: row.company_id, mustChangePassword: row.must_change_password };
      req.session = { id: row.sid, csrf: row.csrf };
      if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60 * 1000) {
        query(
          "UPDATE sessions SET last_seen_at = now(), expires_at = LEAST(now() + ($2 || ' milliseconds')::interval, created_at + ($3 || ' milliseconds')::interval) WHERE id = $1",
          [row.sid, String(config.session.idleMs), String(config.session.absoluteMs)]
        ).catch(() => {});
      }
    }
  }
  next();
}

async function createSession(req, res, user) {
  const token = crypto.randomBytes(32).toString("base64url");
  const csrf = crypto.randomBytes(24).toString("base64url");
  await query(
    "INSERT INTO sessions (user_id, token_hash, csrf, ip_masked, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' milliseconds')::interval)",
    [user.id, sha(token), csrf, maskIp(clientIp(req)), String(req.get("user-agent") || "").slice(0, 200), String(config.session.idleMs)]
  );
  res.cookie(config.session.cookieName, token, { ...cookieOptions, maxAge: config.session.absoluteMs });
  return csrf;
}

function clearSessionCookie(res) {
  res.clearCookie(config.session.cookieName, cookieOptions);
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Exige login, perfil permitido e (em metodos que alteram dados) o token CSRF da sessao.
const requireAuth = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Faça login para continuar." });
  if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: "Você não tem permissão para isso." });
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (!safeEqual(req.get("x-csrf-token") || "", req.session.csrf)) {
      strike(req.clientIp, "csrf");
      events.record("csrf_block", { ip: req.clientIp, country: req.geo?.country, path: req.path });
      return res.status(403).json({ error: "Sessão inválida. Recarregue a página." });
    }
  }
  if (req.user.mustChangePassword && !PASSWORD_ROUTES.includes(req.originalUrl.split("?")[0])) {
    return res.status(403).json({ error: "Defina uma nova senha para continuar.", code: "PASSWORD_CHANGE_REQUIRED" });
  }
  next();
};

// Protege as paginas /admin e /cliente: sem sessao valida, vai para o login.
const pageGuard = (...roles) => (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!req.user || !roles.includes(req.user.role)) return res.redirect(`/login.html?next=${encodeURIComponent(req.baseUrl + "/")}`);
  next();
};

async function revokeSessions(userId, exceptSessionId = null) {
  await query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)", [userId, exceptSessionId]);
}

module.exports = { loadSession, createSession, clearSessionCookie, requireAuth, pageGuard, revokeSessions, sha, cookieOptions };
