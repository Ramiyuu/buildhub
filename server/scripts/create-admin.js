// Gera as credenciais do administrador.
//   npm run admin:create                -> senha aleatoria de 16 caracteres
//   ADMIN_EMAIL=voce@empresa.com npm run admin:create
//
// - A senha em texto vai SOMENTE para ADMIN-CREDENTIALS.local.txt (ignorado pelo git). Leia, guarde num gerenciador de
//   senhas e apague o arquivo. Ela nao e impressa no terminal.
// - O .env local recebe ADMIN_EMAIL e ADMIN_PASSWORD_HASH. Na Railway cadastre so essas duas variaveis.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { hashPassword, generatePassword } = require("../lib/password");

(async () => {
  const root = path.join(__dirname, "..", "..");
  const email = (process.env.ADMIN_EMAIL || "admin@buildhub.dev").trim().toLowerCase();
  const password = generatePassword(16);
  const hash = await hashPassword(password);

  const envPath = path.join(root, ".env");
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const upsert = (text, key, value) => {
    const line = `${key}=${value}`;
    return new RegExp(`^${key}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  };
  let next = current;
  if (!/^SESSION_SECRET=.{32,}/m.test(next)) next = upsert(next, "SESSION_SECRET", crypto.randomBytes(48).toString("hex"));
  next = upsert(next, "ADMIN_EMAIL", email);
  next = upsert(next, "ADMIN_PASSWORD_HASH", hash);
  fs.writeFileSync(envPath, next, { mode: 0o600 });

  const note = [
    "CREDENCIAIS DO ADMINISTRADOR BUILDHUB",
    "Guarde num gerenciador de senhas e APAGUE este arquivo.",
    "",
    `Email: ${email}`,
    `Senha: ${password}`,
    "",
    "Para a Railway (Variables), cadastre apenas:",
    `ADMIN_EMAIL=${email}`,
    `ADMIN_PASSWORD_HASH=${hash}`,
    "",
    "A senha acima nunca precisa ir para a Railway: o servidor guarda so o hash (scrypt).",
    "Ela so vale se o admin ainda nao existir no banco (criado no primeiro boot). Para trocar depois, use o painel (Usuarios > Redefinir senha)."
  ].join("\n");
  fs.writeFileSync(path.join(root, "ADMIN-CREDENTIALS.local.txt"), note + "\n", { mode: 0o600 });

  console.log("Credenciais geradas.");
  console.log("- Email do admin:", email);
  console.log("- Senha (16 caracteres): salva em ADMIN-CREDENTIALS.local.txt (nao impressa aqui)");
  console.log("- Hash gravado em .env (ADMIN_PASSWORD_HASH)");
})().catch((error) => { console.error(error); process.exit(1); });
