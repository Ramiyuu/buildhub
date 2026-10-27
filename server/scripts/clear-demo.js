// Remove todos os dados ficticios (is_demo = true), na ordem certa das chaves estrangeiras.
const { query, pool } = require("../db");

(async () => {
  const steps = [
    "DELETE FROM tasks WHERE is_demo",
    "DELETE FROM invoices WHERE is_demo",
    "DELETE FROM portfolio_sites WHERE is_demo",
    "DELETE FROM projects WHERE is_demo",
    "DELETE FROM leads WHERE is_demo",
    "DELETE FROM expenses WHERE is_demo",
    "DELETE FROM chat_conversations WHERE is_demo",
    "DELETE FROM notifications WHERE is_demo",
    "DELETE FROM page_views WHERE is_demo",
    "DELETE FROM security_events WHERE is_demo",
    "DELETE FROM users WHERE is_demo",
    "DELETE FROM companies WHERE is_demo"
  ];
  for (const sql of steps) {
    const { rowCount } = await query(sql);
    console.log(`${String(rowCount).padStart(6)}  ${sql.replace("DELETE FROM ", "").replace(" WHERE is_demo", "")}`);
  }
  await pool.end();
})().catch((error) => { console.error(error); process.exit(1); });
