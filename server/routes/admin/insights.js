const express = require("express");
const { z } = require("zod");
const { query } = require("../../db");
const config = require("../../config");
const bus = require("../../lib/bus");
const { parse, HttpError } = require("../../lib/http");
const { REGION_OF_UF, maskIp } = require("../../lib/geo");
const { getSetting, setSetting } = require("../../lib/settings");
const { audit } = require("../../lib/audit");
const { bannedCount } = require("../../middleware/security");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();
const clampDays = (value, fallback = 30) => Math.min(180, Math.max(1, Number(value) || fallback));

// ------------------------------------------------------------------ analytics de visitas
async function visitTotals(from, to) {
  const { rows } = await query(
    `SELECT count(*)::int AS views, count(DISTINCT visitor || occurred_at::date::text)::int AS visitors
       FROM page_views WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz`,
    [from, to]
  );
  return rows[0];
}

router.get("/analytics", async (req, res) => {
  const days = clampDays(req.query.days);
  const since = `current_date - ($1::int - 1)`;
  const [series, pages, referrers, devices, browsers, states, cities, live] = await Promise.all([
    query(
      `WITH days AS (SELECT d::date AS day FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d),
            pv AS (SELECT occurred_at::date AS day, visitor FROM page_views WHERE occurred_at >= ${since})
       SELECT to_char(days.day, 'YYYY-MM-DD') AS day, count(pv.visitor)::int AS views, count(DISTINCT pv.visitor)::int AS visitors
         FROM days LEFT JOIN pv ON pv.day = days.day GROUP BY days.day ORDER BY days.day`,
      [days]
    ),
    query(`SELECT path, count(*)::int AS views, count(DISTINCT visitor)::int AS visitors FROM page_views WHERE occurred_at >= ${since} GROUP BY path ORDER BY views DESC LIMIT 8`, [days]),
    query(`SELECT referrer, count(*)::int AS views FROM page_views WHERE occurred_at >= ${since} AND referrer IS NOT NULL GROUP BY referrer ORDER BY views DESC LIMIT 6`, [days]),
    query(`SELECT device, count(*)::int AS views FROM page_views WHERE occurred_at >= ${since} GROUP BY device ORDER BY views DESC`, [days]),
    query(`SELECT browser, count(*)::int AS views FROM page_views WHERE occurred_at >= ${since} GROUP BY browser ORDER BY views DESC`, [days]),
    query(`SELECT region_code, count(*)::int AS views, count(DISTINCT visitor)::int AS visitors FROM page_views WHERE occurred_at >= ${since} AND region_code IS NOT NULL GROUP BY region_code ORDER BY views DESC`, [days]),
    query(`SELECT city, region_code, count(*)::int AS views FROM page_views WHERE occurred_at >= ${since} AND city IS NOT NULL GROUP BY city, region_code ORDER BY views DESC LIMIT 8`, [days]),
    query("SELECT count(DISTINCT visitor)::int AS online FROM page_views WHERE occurred_at >= now() - interval '5 minutes'")
  ]);

  const unknown = (await query(`SELECT count(*)::int AS views FROM page_views WHERE occurred_at >= ${since} AND region_code IS NULL`, [days])).rows[0].views;
  const regions = {};
  for (const row of states.rows) {
    const name = REGION_OF_UF[row.region_code];
    if (!name) continue;
    regions[name] = regions[name] || { region: name, views: 0, visitors: 0 };
    regions[name].views += row.views;
    regions[name].visitors += row.visitors;
  }

  const totalViews = series.rows.reduce((sum, r) => sum + r.views, 0);
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);
  const prevStart = new Date(now.getTime() - 2 * days * 86400000);
  const [current, previous] = await Promise.all([visitTotals(start.toISOString(), now.toISOString()), visitTotals(prevStart.toISOString(), start.toISOString())]);

  res.json({
    days, totalViews, current, previous,
    online: live.rows[0].online,
    series: series.rows, pages: pages.rows, referrers: referrers.rows, devices: devices.rows, browsers: browsers.rows,
    states: states.rows, regions: Object.values(regions).sort((a, b) => b.views - a.views), cities: cities.rows, unknownRegionViews: unknown
  });
});

// ------------------------------------------------------------------ dashboard (visao geral)
router.get("/dashboard", async (req, res) => {
  const [money, projects, sites, leads, chats, late, now30, prev30, series] = await Promise.all([
    query(
      `SELECT
         COALESCE(sum(amount_cents) FILTER (WHERE status = 'paga' AND date_trunc('month', paid_at) = date_trunc('month', current_date)), 0)::bigint AS revenue_month,
         COALESCE(sum(amount_cents) FILTER (WHERE status = 'paga' AND date_trunc('month', paid_at) = date_trunc('month', current_date) - interval '1 month'), 0)::bigint AS revenue_prev,
         COALESCE(sum(amount_cents) FILTER (WHERE status = 'pendente'), 0)::bigint AS receivable,
         COALESCE(sum(amount_cents) FILTER (WHERE status = 'pendente' AND due_date < current_date), 0)::bigint AS overdue,
         count(*) FILTER (WHERE status = 'pendente' AND due_date < current_date)::int AS overdue_count
       FROM invoices`
    ),
    query(
      `SELECT count(*) FILTER (WHERE status NOT IN ('entregue','cancelado','pausado'))::int AS active,
              count(*) FILTER (WHERE status NOT IN ('entregue','cancelado') AND due_date < current_date)::int AS late,
              count(*) FILTER (WHERE status NOT IN ('entregue','cancelado') AND due_date BETWEEN current_date AND current_date + 7)::int AS due_soon
         FROM projects`
    ),
    query("SELECT count(*) FILTER (WHERE status = 'online')::int AS online, count(*)::int AS total, COALESCE(sum(maintenance_cents) FILTER (WHERE status = 'online'), 0)::bigint AS mrr FROM portfolio_sites"),
    query("SELECT count(*) FILTER (WHERE status IN ('novo','contato','proposta'))::int AS open, COALESCE(sum(value_cents) FILTER (WHERE status IN ('novo','contato','proposta')), 0)::bigint AS pipeline FROM leads"),
    query("SELECT count(*)::int AS open, count(*) FILTER (WHERE handoff_requested AND mode = 'ai')::int AS handoff, COALESCE(sum(unread_admin), 0)::int AS unread FROM chat_conversations WHERE status = 'open'"),
    query(`SELECT i.id, i.number, c.name AS company_name, i.amount_cents, (current_date - i.due_date)::int AS days
             FROM invoices i JOIN companies c ON c.id = i.company_id WHERE i.status = 'pendente' AND i.due_date < current_date ORDER BY i.due_date LIMIT 5`),
    visitTotals(new Date(Date.now() - 30 * 86400000).toISOString(), new Date().toISOString()),
    visitTotals(new Date(Date.now() - 60 * 86400000).toISOString(), new Date(Date.now() - 30 * 86400000).toISOString()),
    query(
      `WITH days AS (SELECT d::date AS day FROM generate_series(current_date - 29, current_date, interval '1 day') d),
            pv AS (SELECT occurred_at::date AS day, visitor FROM page_views WHERE occurred_at >= current_date - 29)
       SELECT to_char(days.day, 'YYYY-MM-DD') AS day, count(pv.visitor)::int AS views FROM days LEFT JOIN pv ON pv.day = days.day GROUP BY days.day ORDER BY days.day`
    )
  ]);
  res.json({
    money: money.rows[0], projects: projects.rows[0], sites: sites.rows[0], leads: leads.rows[0], chats: chats.rows[0],
    lateInvoices: late.rows, visits: { current: now30, previous: prev30, series: series.rows }
  });
});

// ------------------------------------------------------------------ seguranca (somente administrador)
router.get("/security", requireAuth("admin"), async (req, res) => {
  const days = clampDays(req.query.days, 7);
  const since = `now() - ($1::int * interval '1 day')`;
  const [byType, byDay, byCountry, recent, sessions, blocked24h] = await Promise.all([
    query(`SELECT type, sum(count)::int AS total FROM security_events WHERE occurred_at >= ${since} GROUP BY type ORDER BY total DESC`, [days]),
    query(
      `WITH days AS (SELECT d::date AS day FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d)
       SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
              COALESCE(sum(e.count) FILTER (WHERE e.type = 'geo_block'), 0)::int AS geo,
              COALESCE(sum(e.count) FILTER (WHERE e.type = 'rate_limit'), 0)::int AS rate,
              COALESCE(sum(e.count) FILTER (WHERE e.type IN ('login_failed','login_locked')), 0)::int AS login
         FROM days LEFT JOIN security_events e ON e.occurred_at::date = days.day GROUP BY days.day ORDER BY days.day`,
      [days]
    ),
    query(`SELECT COALESCE(country, '??') AS country, sum(count)::int AS total FROM security_events WHERE type = 'geo_block' AND occurred_at >= ${since} GROUP BY 1 ORDER BY total DESC LIMIT 10`, [days]),
    query("SELECT id, occurred_at, type, country, ip_masked, path, detail, count FROM security_events ORDER BY occurred_at DESC, id DESC LIMIT 60"),
    query(
      `SELECT s.id, s.ip_masked, s.user_agent, s.created_at, s.last_seen_at, u.id AS user_id, u.name, u.email, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.revoked_at IS NULL AND s.expires_at > now() ORDER BY s.last_seen_at DESC LIMIT 40`
    ),
    query("SELECT COALESCE(sum(count), 0)::int AS total FROM security_events WHERE type = 'geo_block' AND occurred_at >= now() - interval '24 hours'")
  ]);
  res.json({
    days, byType: byType.rows, byDay: byDay.rows, blockedCountries: byCountry.rows, recent: recent.rows, sessions: sessions.rows,
    geoBlocked24h: blocked24h.rows[0].total,
    protections: {
      geoBlocking: false, bannedIps: bannedCount(),
      trustProxy: config.trustProxy, cloudflare: config.trustCloudflare, production: config.isProd,
      openai: config.openai.mock ? "mock" : config.openai.key ? "configurada" : "ausente", model: config.openai.model,
      adminsOnline: bus.adminOnline()
    },
    you: { country: req.geo?.country || null, ip: maskIp(req.clientIp) }
  });
});

router.get("/audit", requireAuth("admin"), async (req, res) => {
  const { rows } = await query("SELECT id, occurred_at, user_email, action, entity, entity_id, detail, ip_masked FROM audit_log ORDER BY id DESC LIMIT 150");
  res.json({ items: rows });
});

// ------------------------------------------------------------------ notificacoes
router.get("/notifications", async (req, res) => {
  const [list, unread] = await Promise.all([
    query("SELECT id, type, title, body, link, read_at, created_at FROM notifications ORDER BY id DESC LIMIT 40"),
    query("SELECT count(*)::int AS n FROM notifications WHERE read_at IS NULL")
  ]);
  res.json({ items: list.rows, unread: unread.rows[0].n });
});

router.post("/notifications/read-all", async (req, res) => {
  await query("UPDATE notifications SET read_at = now() WHERE read_at IS NULL");
  res.json({ ok: true });
});

router.post("/notifications/:id/read", async (req, res) => {
  await query("UPDATE notifications SET read_at = now() WHERE id = $1 AND read_at IS NULL", [Number(req.params.id) || 0]);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ configuracoes do chat (somente administrador)
const chatSettings = z.object({
  aiEnabled: z.boolean(),
  greeting: z.string().trim().min(5, "Escreva uma saudação.").max(300),
  extraPrompt: z.string().trim().max(2000)
});

router.get("/settings/chat", requireAuth("admin"), async (req, res) => {
  res.json({ settings: await getSetting("chat"), openai: config.openai.mock ? "mock" : config.openai.key ? "configurada" : "ausente", model: config.openai.model });
});

router.put("/settings/chat", requireAuth("admin"), async (req, res) => {
  const data = parse(chatSettings, req.body);
  await setSetting("chat", data);
  await audit(req, "settings.chat", "settings", "chat", { aiEnabled: data.aiEnabled });
  res.json({ settings: data });
});

// ------------------------------------------------------------------ tempo real (SSE) para o painel
router.get("/stream", (req, res) => {
  if (!bus.openStream(req, res, req.clientIp)) return;
  bus.addAdmin(res);
  bus.write(res, "ready", { online: bus.adminOnline() });
});

module.exports = router;
