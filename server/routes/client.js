const express = require("express");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Area do cliente: cada usuario so enxerga os dados da empresa vinculada a ele.
router.get("/overview", requireAuth("client"), async (req, res) => {
  const companyId = req.user.companyId;
  if (!companyId) return res.json({ company: null, projects: [], invoices: [] });
  const [company, projects, invoices] = await Promise.all([
    query("SELECT id, name, segment, city, state FROM companies WHERE id = $1", [companyId]),
    query(
      `SELECT id, name, type, status, progress, start_date, due_date, delivered_at, url
         FROM projects WHERE company_id = $1 ORDER BY (status IN ('entregue','cancelado')), due_date NULLS LAST`,
      [companyId]
    ),
    query(
      `SELECT id, number, description, amount_cents, issue_date, due_date, status, paid_at,
              (status = 'pendente' AND due_date < current_date) AS overdue
         FROM invoices WHERE company_id = $1 AND status <> 'cancelada' ORDER BY due_date DESC LIMIT 100`,
      [companyId]
    )
  ]);
  res.json({ company: company.rows[0] || null, projects: projects.rows, invoices: invoices.rows });
});

module.exports = router;
