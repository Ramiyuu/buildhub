const express = require("express");
const { z } = require("zod");
const { query } = require("../../db");
const { hashPassword, generatePassword, passwordProblem } = require("../../lib/password");
const { HttpError, parse, uuidParam } = require("../../lib/http");
const { audit } = require("../../lib/audit");
const { revokeSessions } = require("../../middleware/auth");

const router = express.Router();

const name = z.string().trim().min(2, "Informe o nome.").max(120);
const email = z.string().trim().toLowerCase().email("Digite um email válido.").max(160);
const role = z.enum(["admin", "staff", "client"], "Perfil inválido.");
const companyId = z.string().uuid().nullable().optional();

const createSchema = z.object({ name, email, role, companyId, password: z.string().max(128).optional() });
const updateSchema = z.object({
  name: name.optional(),
  email: email.optional(),
  role: role.optional(),
  status: z.enum(["active", "blocked"]).optional(),
  companyId
});

const publicRow = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, companyId: u.company_id, companyName: u.company_name || null,
  cpfLast4: u.cpf_last4, lastLoginAt: u.last_login_at, lastLoginCountry: u.last_login_country,
  locked: !!(u.locked_until && new Date(u.locked_until) > new Date()), mustChangePassword: u.must_change_password,
  activeSessions: Number(u.active_sessions || 0), createdAt: u.created_at, isDemo: u.is_demo
});

const SELECT = `SELECT u.*, c.name AS company_name,
    (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS active_sessions
  FROM users u LEFT JOIN companies c ON c.id = u.company_id`;

async function adminCount(excludeId = null) {
  const { rows } = await query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND status = 'active' AND ($1::uuid IS NULL OR id <> $1::uuid)", [excludeId]);
  return rows[0].n;
}

router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 80);
  const where = [];
  const params = [];
  if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(lower(u.name) LIKE $${params.length} OR lower(u.email) LIKE $${params.length})`); }
  if (["admin", "staff", "client"].includes(req.query.role)) { params.push(req.query.role); where.push(`u.role = $${params.length}`); }
  if (["active", "blocked"].includes(req.query.status)) { params.push(req.query.status); where.push(`u.status = $${params.length}`); }
  const { rows } = await query(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY u.created_at DESC LIMIT 300`, params);
  res.json({ users: rows.map(publicRow) });
});

router.post("/", async (req, res) => {
  const data = parse(createSchema, req.body);
  let temp = null;
  let password = data.password;
  if (password) {
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem);
  } else {
    password = temp = generatePassword(16);
  }
  try {
    const { rows } = await query(
      "INSERT INTO users (name, email, password_hash, role, company_id, must_change_password) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [data.name, data.email, await hashPassword(password), data.role, data.companyId || null, true]
    );
    await audit(req, "user.create", "user", rows[0].id, { email: data.email, role: data.role });
    const created = (await query(`${SELECT} WHERE u.id = $1`, [rows[0].id])).rows[0];
    res.status(201).json({ user: publicRow(created), tempPassword: temp });
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "Já existe um usuário com este email.");
    throw error;
  }
});

router.patch("/:id", async (req, res) => {
  const id = uuidParam(req);
  const data = parse(updateSchema, req.body);
  const { rows } = await query("SELECT * FROM users WHERE id = $1", [id]);
  const target = rows[0];
  if (!target) throw new HttpError(404, "Usuário não encontrado.");

  const losingAdmin = target.role === "admin" && ((data.role && data.role !== "admin") || data.status === "blocked");
  if (losingAdmin && (target.id === req.user.id || (await adminCount(id)) === 0)) {
    throw new HttpError(400, target.id === req.user.id ? "Você não pode remover seu próprio acesso de administrador." : "Precisa existir ao menos um administrador ativo.");
  }

  const sets = [];
  const values = [];
  const add = (column, value) => { values.push(value); sets.push(`${column} = $${values.length}`); };
  if (data.name !== undefined) add("name", data.name);
  if (data.email !== undefined) add("email", data.email);
  if (data.role !== undefined) add("role", data.role);
  if (data.status !== undefined) add("status", data.status);
  if (data.companyId !== undefined) add("company_id", data.companyId);
  if (!sets.length) throw new HttpError(400, "Nada para atualizar.");
  values.push(id);
  try {
    await query(`UPDATE users SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values);
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "Já existe um usuário com este email.");
    throw error;
  }
  if (data.status === "blocked" || (data.role && data.role !== target.role)) await revokeSessions(id);
  await audit(req, "user.update", "user", id, data);
  const updated = (await query(`${SELECT} WHERE u.id = $1`, [id])).rows[0];
  res.json({ user: publicRow(updated) });
});

router.post("/:id/reset-password", async (req, res) => {
  const id = uuidParam(req);
  const temp = generatePassword(16);
  const { rowCount } = await query(
    "UPDATE users SET password_hash = $2, must_change_password = true, failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $1",
    [id, await hashPassword(temp)]
  );
  if (!rowCount) throw new HttpError(404, "Usuário não encontrado.");
  await revokeSessions(id, id === req.user.id ? req.session.id : null);
  await audit(req, "user.reset_password", "user", id);
  res.json({ tempPassword: temp });
});

router.post("/:id/unlock", async (req, res) => {
  const id = uuidParam(req);
  await query("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [id]);
  await audit(req, "user.unlock", "user", id);
  res.json({ ok: true });
});

router.post("/:id/revoke-sessions", async (req, res) => {
  const id = uuidParam(req);
  await revokeSessions(id, id === req.user.id ? req.session.id : null);
  await audit(req, "user.revoke_sessions", "user", id);
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const id = uuidParam(req);
  if (id === req.user.id) throw new HttpError(400, "Você não pode excluir a própria conta.");
  const { rows } = await query("SELECT role FROM users WHERE id = $1", [id]);
  if (!rows[0]) throw new HttpError(404, "Usuário não encontrado.");
  if (rows[0].role === "admin" && (await adminCount(id)) === 0) throw new HttpError(400, "Precisa existir ao menos um administrador ativo.");
  await query("DELETE FROM users WHERE id = $1", [id]);
  await audit(req, "user.delete", "user", id);
  res.json({ ok: true });
});

module.exports = router;
