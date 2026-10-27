const { query } = require("../db");
const config = require("../config");
const { hashPassword, generatePassword } = require("./password");

// Garante que exista ao menos um administrador. Preferencia: ADMIN_PASSWORD_HASH (a senha em texto nunca vai ao servidor).
async function ensureAdmin() {
  const { rows } = await query("SELECT count(*)::int AS n FROM users WHERE role = 'admin'");
  if (rows[0].n > 0) return;

  let hash = config.admin.passwordHash;
  let generated = null;
  let mustChange = false;
  if (!hash && config.admin.password) {
    hash = await hashPassword(config.admin.password);
    mustChange = true;
  } else if (!hash) {
    generated = generatePassword(16);
    hash = await hashPassword(generated);
    mustChange = true;
  }

  await query(
    "INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES ('Administrador', $1, $2, 'admin', $3)",
    [config.admin.email, hash, mustChange]
  );
  console.log(`[admin] administrador criado: ${config.admin.email}`);
  if (generated) {
    // Unica vez que a senha aparece: copie dos logs e troque no primeiro acesso.
    console.log("============================================================");
    console.log(` SENHA INICIAL DO ADMIN (16 caracteres, mostrada uma unica vez): ${generated}`);
    console.log(" Troque-a no primeiro login. Para evitar isto, defina ADMIN_PASSWORD_HASH (npm run admin:create).");
    console.log("============================================================");
  }
}

module.exports = { ensureAdmin };
