const express = require("express");
const { z } = require("zod");
const { query } = require("../../db");
const { HttpError, parse, uuidParam, buildInsert, buildUpdate } = require("../../lib/http");
const { audit } = require("../../lib/audit");

const router = express.Router();

const text = (max = 200) => z.string().trim().max(max);
// Vazio vira null, mas "campo ausente" continua ausente (para o PATCH nao apagar dados).
const nullable = (schema) => schema.nullish().transform((v) => (v === undefined ? undefined : v || null));
const optText = (max = 200) => nullable(text(max));
const optDate = nullable(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."));
const cents = z.number().int().min(0).max(100000000000);
const uuid = nullable(z.string().uuid());
const stack = z.array(z.string().trim().min(1).max(40)).max(20).optional();

// ------------------------------------------------------------------ helper de CRUD simples
function crud(path, table, schema, { select, order = "created_at DESC", audit: auditName }) {
  const partial = schema.partial();
  router.get(`/${path}`, async (req, res) => {
    const { rows } = await query(`${select} ORDER BY ${order} LIMIT 500`);
    res.json({ items: rows });
  });
  router.post(`/${path}`, async (req, res) => {
    const data = parse(schema, req.body);
    const { text: sql, values } = buildInsert(table, data);
    const { rows } = await query(sql, values).catch(translate);
    await audit(req, `${auditName}.create`, auditName, rows[0].id);
    res.status(201).json({ item: rows[0] });
  });
  router.patch(`/${path}/:id`, async (req, res) => {
    const id = uuidParam(req);
    const data = parse(partial, req.body);
    const { text: sql, values } = buildUpdate(table, id, data);
    const { rows } = await query(sql, values).catch(translate);
    if (!rows[0]) throw new HttpError(404, "Registro não encontrado.");
    await audit(req, `${auditName}.update`, auditName, id, data);
    res.json({ item: rows[0] });
  });
  router.delete(`/${path}/:id`, async (req, res) => {
    const id = uuidParam(req);
    const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1`, [id]).catch(translate);
    if (!rowCount) throw new HttpError(404, "Registro não encontrado.");
    await audit(req, `${auditName}.delete`, auditName, id);
    res.json({ ok: true });
  });
}

function translate(error) {
  if (error.code === "23503" || error.code === "23001") throw new HttpError(409, "Este registro está vinculado a outros dados (projetos, cobranças...) e não pode ser excluído.");
  if (error.code === "23514" || error.code === "22P02") throw new HttpError(400, "Valor inválido.");
  throw error;
}

// ------------------------------------------------------------------ clientes (empresas)
crud("companies", "companies", z.object({
  name: text(160).min(2, "Informe o nome da empresa."),
  cnpj: optText(24), email: optText(160), phone: optText(30), city: optText(80),
  state: nullable(z.string().trim().toUpperCase().length(2)),
  segment: optText(80), status: z.enum(["lead", "ativo", "inativo"]).optional(), notes: optText(2000)
}), {
  auditName: "company", audit: "company", order: "c.name ASC",
  select: `SELECT c.*,
      (SELECT count(*)::int FROM projects p WHERE p.company_id = c.id) AS projects,
      (SELECT count(*)::int FROM projects p WHERE p.company_id = c.id AND p.status NOT IN ('entregue','cancelado')) AS active_projects,
      COALESCE((SELECT sum(amount_cents) FROM invoices i WHERE i.company_id = c.id AND i.status = 'paga'), 0)::bigint AS paid_cents,
      COALESCE((SELECT sum(amount_cents) FROM invoices i WHERE i.company_id = c.id AND i.status = 'pendente'), 0)::bigint AS open_cents,
      COALESCE((SELECT sum(amount_cents) FROM invoices i WHERE i.company_id = c.id AND i.status = 'pendente' AND i.due_date < current_date), 0)::bigint AS overdue_cents
    FROM companies c`
});

// ------------------------------------------------------------------ projetos
crud("projects", "projects", z.object({
  companyId: z.string().uuid("Escolha o cliente."),
  name: text(160).min(2, "Informe o nome do projeto."),
  type: z.enum(["site", "sistema", "landing", "loja", "app", "manutencao"]).optional(),
  status: z.enum(["briefing", "design", "desenvolvimento", "testes", "entregue", "pausado", "cancelado"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  budgetCents: cents.optional(),
  startDate: optDate, dueDate: optDate, deliveredAt: optDate,
  url: optText(300), stack, description: optText(2000)
}), {
  audit: "project", order: "p.created_at DESC",
  select: `SELECT p.*, c.name AS company_name,
      (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS tasks_total,
      (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS tasks_done,
      COALESCE((SELECT sum(amount_cents) FROM invoices i WHERE i.project_id = p.id AND i.status = 'paga'), 0)::bigint AS paid_cents
    FROM projects p JOIN companies c ON c.id = p.company_id`
});

// ------------------------------------------------------------------ sites entregues (portfolio interno)
crud("sites", "portfolio_sites", z.object({
  name: text(160).min(2, "Informe o nome do site."),
  companyId: uuid, clientName: optText(160), url: optText(300),
  category: z.enum(["institucional", "ecommerce", "landing", "sistema", "app"]).optional(),
  tech: stack, deliveredOn: optDate,
  status: z.enum(["online", "manutencao", "offline"]).optional(),
  featured: z.boolean().optional(), maintenanceCents: cents.optional(), notes: optText(1000)
}), {
  audit: "site", order: "s.delivered_on DESC NULLS LAST",
  select: "SELECT s.*, c.name AS company_name FROM portfolio_sites s LEFT JOIN companies c ON c.id = s.company_id"
});

// ------------------------------------------------------------------ leads
crud("leads", "leads", z.object({
  name: text(160).min(2, "Informe o nome do lead."),
  email: optText(160), phone: optText(30), companyName: optText(160),
  source: z.enum(["chat", "site", "indicacao", "instagram", "outro"]).optional(),
  status: z.enum(["novo", "contato", "proposta", "ganho", "perdido"]).optional(),
  valueCents: cents.optional(), notes: optText(2000), conversationId: uuid
}), { audit: "lead", order: "l.updated_at DESC", select: "SELECT l.* FROM leads l" });

// ------------------------------------------------------------------ tarefas
crud("tasks", "tasks", z.object({
  title: text(200).min(2, "Descreva a tarefa."),
  projectId: uuid,
  status: z.enum(["todo", "doing", "done"]).optional(),
  priority: z.enum(["baixa", "media", "alta"]).optional(),
  dueDate: optDate, assigneeId: uuid
}), {
  audit: "task", order: "CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END, t.due_date NULLS LAST",
  select: `SELECT t.*, p.name AS project_name, u.name AS assignee_name
    FROM tasks t LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id`
});

// ------------------------------------------------------------------ despesas
crud("expenses", "expenses", z.object({
  category: z.enum(["hospedagem", "ferramentas", "folha", "marketing", "impostos", "infraestrutura", "freelancer", "outros"], "Escolha a categoria."),
  description: text(200).min(2, "Descreva a despesa."),
  amountCents: cents.min(1, "Informe um valor maior que zero."),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").optional(),
  vendor: optText(120), recurring: z.boolean().optional()
}), { audit: "expense", order: "e.spent_on DESC, e.created_at DESC", select: "SELECT e.* FROM expenses e" });

module.exports = router;
