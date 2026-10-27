const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");
const { query } = require("../db");
const config = require("../config");
const { hashPassword, verifyPassword, dummyVerify, passwordProblem } = require("../lib/password");
const { HttpError, parse } = require("../lib/http");
const { audit } = require("../lib/audit");
const events = require("../lib/events");
const { notify } = require("../lib/bus");
const { createSession, clearSessionCookie, requireAuth, revokeSessions } = require("../middleware/auth");
const { limits, strike } = require("../middleware/security");

const router = express.Router();

const email = z.string().trim().toLowerCase().email("Digite um email válido.").max(160, "Email muito longo.");

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Informe a senha.").max(128, "Senha inválida.")
});

const registerSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo.").max(120, "Nome muito longo."),
  email,
  cpf: z.string().trim().max(20, "CPF inválido."),
  password: z.string().max(128, "Senha muito longa.")
});

const changeSchema = z.object({
  current: z.string().min(1, "Informe a senha atual.").max(128),
  next: z.string().max(128)
});

function validCpf(raw) {
  const cpf = String(raw).replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return null;
  const digit = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]) ? cpf : null;
}

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: !!user.must_change_password || !!user.mustChangePassword });
const homeFor = (role) => (role === "client" ? "/cliente/" : "/admin/");

router.post("/login", limits.login, async (req, res) => {
  const { email: mail, password } = parse(loginSchema, req.body);
  const { rows } = await query("SELECT * FROM users WHERE lower(email) = $1", [mail]);
  const user = rows[0];
  const generic = new HttpError(401, "Email ou senha inválidos, ou acesso temporariamente bloqueado.");

  if (!user) {
    await dummyVerify(password);
    strike(req.clientIp, "login");
    events.record("login_failed", { ip: req.clientIp, country: req.geo?.country, detail: "usuario inexistente" });
    throw generic;
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    events.record("login_locked", { ip: req.clientIp, country: req.geo?.country });
    throw generic;
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok || user.status !== "active") {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= 5;
    await query("UPDATE users SET failed_attempts = $2, locked_until = CASE WHEN $3 THEN now() + interval '15 minutes' ELSE locked_until END WHERE id = $1", [user.id, lock ? 0 : attempts, lock]);
    strike(req.clientIp, "login");
    events.record("login_failed", { ip: req.clientIp, country: req.geo?.country, detail: lock ? "conta bloqueada por 15 min" : user.status !== "active" ? "usuario bloqueado" : "senha incorreta" });
    if (lock && user.role !== "client") notify({ type: "security", title: "Conta bloqueada por tentativas", body: `${user.email} errou a senha 5 vezes. Bloqueio de 15 minutos.`, link: "#/seguranca" });
    throw generic;
  }

  await query("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now(), last_login_country = $2 WHERE id = $1", [user.id, req.geo?.country || null]);
  const csrf = await createSession(req, res, user);
  req.user = { id: user.id, email: user.email };
  await audit(req, "login", "user", user.id);
  res.json({ user: publicUser(user), csrf, redirect: homeFor(user.role) });
});

router.post("/register", limits.register, async (req, res) => {
  const data = parse(registerSchema, req.body);
  const cpf = validCpf(data.cpf);
  if (!cpf) throw new HttpError(400, "Informe um CPF válido.");
  const problem = passwordProblem(data.password);
  if (problem) throw new HttpError(400, problem);

  const cpfHash = crypto.createHmac("sha256", config.sessionSecret).update(`cpf|${cpf}`).digest("hex");
  const hash = await hashPassword(data.password);
  let user;
  try {
    const { rows } = await query(
      "INSERT INTO users (name, email, password_hash, role, cpf_hash, cpf_last4) VALUES ($1,$2,$3,'client',$4,$5) RETURNING *",
      [data.name, data.email, hash, cpfHash, cpf.slice(-4)]
    );
    user = rows[0];
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "Já existe um cadastro com este email ou CPF.");
    throw error;
  }
  const csrf = await createSession(req, res, user);
  req.user = { id: user.id, email: user.email };
  await audit(req, "register", "user", user.id);
  notify({ type: "user_new", title: "Novo cadastro de cliente", body: `${user.name} (${user.email}) criou uma conta.`, link: "#/usuarios" });
  res.status(201).json({ user: publicUser(user), csrf, redirect: "/cliente/" });
});

router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Não autenticado." });
  res.json({ user: publicUser(req.user), csrf: req.session.csrf, country: req.geo?.country || null });
});

router.post("/logout", requireAuth(), async (req, res) => {
  await query("UPDATE sessions SET revoked_at = now() WHERE id = $1", [req.session.id]);
  await audit(req, "logout", "user", req.user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post("/change-password", requireAuth(), async (req, res) => {
  const data = parse(changeSchema, req.body);
  const problem = passwordProblem(data.next);
  if (problem) throw new HttpError(400, problem);
  const { rows } = await query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!(await verifyPassword(data.current, rows[0].password_hash))) {
    strike(req.clientIp, "senha-atual");
    throw new HttpError(400, "A senha atual está incorreta.");
  }
  if (data.current === data.next) throw new HttpError(400, "A nova senha precisa ser diferente da atual.");
  await query("UPDATE users SET password_hash = $2, must_change_password = false, updated_at = now() WHERE id = $1", [req.user.id, await hashPassword(data.next)]);
  await revokeSessions(req.user.id, req.session.id);
  await audit(req, "change_password", "user", req.user.id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.validCpf = validCpf;
