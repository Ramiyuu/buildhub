const { query } = require("../db");
const { clientIp, maskIp } = require("./geo");

// Trilha de auditoria (quem fez o que). Nunca derruba a requisicao se falhar.
async function audit(req, action, entity = null, entityId = null, detail = null) {
  try {
    await query(
      "INSERT INTO audit_log (user_id, user_email, action, entity, entity_id, detail, ip_masked) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [req.user?.id || null, req.user?.email || null, action, entity, entityId ? String(entityId) : null, detail ? JSON.stringify(detail) : null, maskIp(clientIp(req))]
    );
  } catch (error) {
    console.error("[audit] falha:", error.message);
  }
}

module.exports = { audit };
