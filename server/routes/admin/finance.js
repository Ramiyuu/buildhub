const express = require("express");
const { z } = require("zod");
const { query } = require("../../db");
const { HttpError, parse, uuidParam } = require("../../lib/http");
const { audit } = require("../../lib/audit");

const router = express.Router();

const cents = z.number().int().min(1, "Informe um valor maior que zero.").max(100000000000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const note = z.string().trim().max(1000).nullish().transform((v) => (v === undefined ? undefined : v || null));

const invoiceSchema = z.object({
  companyId: z.string().uuid("Escolha o cliente."),
  projectId: z.string().uuid().nullish().transform((v) => (v === undefined ? undefined : v || null)),
  description: z.string().trim().min(2, "Descreva a cobrança.").max(200),
  amountCents: cents,
  dueDate: date,
  issueDate: date.optional(),
  notes: note
});

const SELECT = `SELECT i.*, c.name AS company_name, p.name AS project_name,
    (i.status = 'pendente' AND i.due_date < current_date) AS overdue,
    GREATEST(0, current_date - i.due_date) AS days_overdue
  FROM invoices i JOIN companies c ON c.id = i.company_id LEFT JOIN projects p ON p.id = i.project_id`;

// ------------------------------------------------------------------ cobrancas
router.get("/invoices", async (req, res) => {
  const where = [];
  const params = [];
  const status = req.query.status;
  if (status === "atrasada") where.push("(i.status = 'pendente' AND i.due_date < current_date)");
  else if (status === "pendente") where.push("(i.status = 'pendente' AND i.due_date >= current_date)");
  else if (status === "paga" || status === "cancelada") { params.push(status); where.push(`i.status = $${params.length}`); }
  if (req.query.companyId && /^[0-9a-f-]{36}$/i.test(req.query.companyId)) { params.push(req.query.companyId); where.push(`i.company_id = $${params.length}`); }
  const q = String(req.query.q || "").trim().slice(0, 80).toLowerCase();
  if (q) { params.push(`%${q}%`); where.push(`(lower(c.name) LIKE $${params.length} OR lower(i.number) LIKE $${params.length} OR lower(i.description) LIKE $${params.length})`); }

  const { rows } = await query(
    `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY CASE WHEN i.status = 'pendente' AND i.due_date < current_date THEN 0 WHEN i.status = 'pendente' THEN 1 WHEN i.status = 'paga' THEN 2 ELSE 3 END,
              CASE WHEN i.status = 'pendente' THEN i.due_date END ASC, i.due_date DESC
     LIMIT 400`,
    params
  );
  const totals = (await query(
    `SELECT
       COALESCE(sum(amount_cents) FILTER (WHERE status = 'pendente' AND due_date >= current_date), 0)::bigint AS pending_cents,
       COALESCE(sum(amount_cents) FILTER (WHERE status = 'pendente' AND due_date < current_date), 0)::bigint AS overdue_cents,
       count(*) FILTER (WHERE status = 'pendente' AND due_date < current_date)::int AS overdue_count,
       COALESCE(sum(amount_cents) FILTER (WHERE status = 'paga' AND date_trunc('month', paid_at) = date_trunc('month', current_date)), 0)::bigint AS paid_month_cents
     FROM invoices`
  )).rows[0];
  res.json({ items: rows, totals });
});

router.post("/invoices", async (req, res) => {
  const data = parse(invoiceSchema, req.body);
  const issue = data.issueDate || new Date().toISOString().slice(0, 10);
  try {
    const { rows } = await query(
      `INSERT INTO invoices (number, company_id, project_id, description, amount_cents, issue_date, due_date, notes)
       VALUES ('BH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 4, '0'), $1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [data.companyId, data.projectId || null, data.description, data.amountCents, issue, data.dueDate, data.notes || null]
    );
    await audit(req, "invoice.create", "invoice", rows[0].id, { amountCents: data.amountCents });
    res.status(201).json({ item: (await query(`${SELECT} WHERE i.id = $1`, [rows[0].id])).rows[0] });
  } catch (error) {
    if (error.code === "23503") throw new HttpError(400, "Cliente ou projeto inválido.");
    throw error;
  }
});

router.patch("/invoices/:id", async (req, res) => {
  const id = uuidParam(req);
  const data = parse(invoiceSchema.partial(), req.body);
  const { rows } = await query("SELECT status FROM invoices WHERE id = $1", [id]);
  if (!rows[0]) throw new HttpError(404, "Cobrança não encontrada.");
  if (rows[0].status !== "pendente" && (data.amountCents !== undefined || data.dueDate !== undefined || data.companyId !== undefined)) {
    throw new HttpError(400, "Só é possível alterar valor, vencimento e cliente de cobranças pendentes.");
  }
  const map = { companyId: "company_id", projectId: "project_id", description: "description", amountCents: "amount_cents", dueDate: "due_date", issueDate: "issue_date", notes: "notes" };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(map)) {
    if (data[key] !== undefined) { values.push(data[key]); sets.push(`${column} = $${values.length}`); }
  }
  if (!sets.length) throw new HttpError(400, "Nada para atualizar.");
  values.push(id);
  await query(`UPDATE invoices SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values);
  await audit(req, "invoice.update", "invoice", id, data);
  res.json({ item: (await query(`${SELECT} WHERE i.id = $1`, [id])).rows[0] });
});

router.post("/invoices/:id/pay", async (req, res) => {
  const id = uuidParam(req);
  const data = parse(z.object({ method: z.enum(["pix", "boleto", "cartao", "transferencia"], "Escolha a forma de pagamento."), paidAt: date.optional() }), req.body);
  const { rowCount } = await query(
    "UPDATE invoices SET status = 'paga', paid_at = COALESCE($2::date, current_date), payment_method = $3, updated_at = now() WHERE id = $1 AND status = 'pendente'",
    [id, data.paidAt || null, data.method]
  );
  if (!rowCount) throw new HttpError(409, "Só cobranças pendentes podem ser baixadas.");
  await audit(req, "invoice.pay", "invoice", id, data);
  res.json({ item: (await query(`${SELECT} WHERE i.id = $1`, [id])).rows[0] });
});

router.post("/invoices/:id/reopen", async (req, res) => {
  const id = uuidParam(req);
  const { rowCount } = await query("UPDATE invoices SET status = 'pendente', paid_at = NULL, payment_method = NULL, updated_at = now() WHERE id = $1 AND status IN ('paga','cancelada')", [id]);
  if (!rowCount) throw new HttpError(409, "Esta cobrança já está pendente.");
  await audit(req, "invoice.reopen", "invoice", id);
  res.json({ item: (await query(`${SELECT} WHERE i.id = $1`, [id])).rows[0] });
});

router.post("/invoices/:id/cancel", async (req, res) => {
  const id = uuidParam(req);
  const { rowCount } = await query("UPDATE invoices SET status = 'cancelada', updated_at = now() WHERE id = $1 AND status = 'pendente'", [id]);
  if (!rowCount) throw new HttpError(409, "Só cobranças pendentes podem ser canceladas.");
  await audit(req, "invoice.cancel", "invoice", id);
  res.json({ item: (await query(`${SELECT} WHERE i.id = $1`, [id])).rows[0] });
});

// Registra o lembrete e devolve o texto pronto para enviar (WhatsApp/e-mail). O sistema nao envia mensagens sozinho.
router.post("/invoices/:id/remind", async (req, res) => {
  const id = uuidParam(req);
  const { rows } = await query(`${SELECT} WHERE i.id = $1`, [id]);
  const inv = rows[0];
  if (!inv) throw new HttpError(404, "Cobrança não encontrada.");
  if (inv.status !== "pendente") throw new HttpError(409, "Só cobranças pendentes recebem lembrete.");
  await query("UPDATE invoices SET reminder_count = reminder_count + 1, last_reminder_at = now() WHERE id = $1", [id]);
  const valor = (inv.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const venc = new Date(inv.due_date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const message = inv.overdue
    ? `Olá, ${inv.company_name}! Identificamos que a cobrança ${inv.number} (${inv.description}), no valor de ${valor}, venceu em ${venc}. Se já pagou, desconsidere. Caso contrário, podemos enviar uma nova via de pagamento?`
    : `Olá, ${inv.company_name}! Lembrete amigável: a cobrança ${inv.number} (${inv.description}), no valor de ${valor}, vence em ${venc}. Qualquer dúvida, é só responder esta mensagem.`;
  await audit(req, "invoice.remind", "invoice", id);
  res.json({ message, reminderCount: inv.reminder_count + 1 });
});

// ------------------------------------------------------------------ resumo financeiro
router.get("/finance/summary", async (req, res) => {
  const months = Math.min(24, Math.max(3, Number(req.query.months) || 12));
  const [monthly, receivable, aging, mrr, top, byCategory, upcoming] = await Promise.all([
    query(
      `WITH months AS (SELECT date_trunc('month', current_date) - (n * interval '1 month') AS m FROM generate_series(0, $1::int - 1) n)
       SELECT to_char(m, 'YYYY-MM') AS month,
         COALESCE((SELECT sum(amount_cents) FROM invoices WHERE status = 'paga' AND date_trunc('month', paid_at) = m), 0)::bigint AS revenue,
         COALESCE((SELECT sum(amount_cents) FROM expenses WHERE date_trunc('month', spent_on) = m), 0)::bigint AS expenses,
         COALESCE((SELECT sum(amount_cents) FROM invoices WHERE status <> 'cancelada' AND date_trunc('month', issue_date) = m), 0)::bigint AS billed
       FROM months ORDER BY m`,
      [months]
    ),
    query(
      `SELECT COALESCE(sum(amount_cents) FILTER (WHERE due_date >= current_date), 0)::bigint AS pending_cents,
              COALESCE(sum(amount_cents) FILTER (WHERE due_date < current_date), 0)::bigint AS overdue_cents,
              count(*) FILTER (WHERE due_date < current_date)::int AS overdue_count,
              count(*)::int AS open_count
         FROM invoices WHERE status = 'pendente'`
    ),
    query(
      `SELECT bucket, COALESCE(sum(amount_cents), 0)::bigint AS cents, count(*)::int AS n FROM (
         SELECT amount_cents, CASE WHEN due_date >= current_date THEN 'a_vencer' WHEN current_date - due_date <= 7 THEN 'ate_7'
                WHEN current_date - due_date <= 30 THEN 'ate_30' WHEN current_date - due_date <= 60 THEN 'ate_60' ELSE 'mais_60' END AS bucket
           FROM invoices WHERE status = 'pendente') t GROUP BY bucket`
    ),
    query("SELECT COALESCE(sum(maintenance_cents), 0)::bigint AS mrr_cents, count(*)::int AS sites FROM portfolio_sites WHERE status = 'online' AND maintenance_cents > 0"),
    query(
      `SELECT c.id, c.name, sum(i.amount_cents)::bigint AS cents FROM invoices i JOIN companies c ON c.id = i.company_id
        WHERE i.status = 'paga' AND i.paid_at >= current_date - interval '365 days' GROUP BY c.id, c.name ORDER BY cents DESC LIMIT 6`
    ),
    query("SELECT category, sum(amount_cents)::bigint AS cents FROM expenses WHERE spent_on >= current_date - interval '90 days' GROUP BY category ORDER BY cents DESC"),
    query(`${SELECT} WHERE i.status = 'pendente' AND i.due_date <= current_date + interval '15 days' ORDER BY i.due_date LIMIT 8`)
  ]);

  const series = monthly.rows;
  const cur = series[series.length - 1] || { revenue: 0, expenses: 0 };
  const prev = series[series.length - 2] || { revenue: 0, expenses: 0 };
  res.json({
    monthly: series,
    thisMonth: { revenue: Number(cur.revenue), expenses: Number(cur.expenses), profit: Number(cur.revenue) - Number(cur.expenses), previousRevenue: Number(prev.revenue) },
    receivable: receivable.rows[0],
    aging: aging.rows,
    mrr: mrr.rows[0],
    topClients: top.rows,
    expensesByCategory: byCategory.rows,
    upcoming: upcoming.rows
  });
});

module.exports = router;
