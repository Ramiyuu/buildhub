// Postgres local para desenvolvimento, via PGlite (Postgres real em WASM, sem instalar nada).
// Uso: npm run dev:db  (deixe rodando) e coloque a URL impressa em DATABASE_URL no .env
// So para desenvolvimento/testes. Em producao use o Postgres da Railway.
const path = require("path");

(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const db = await PGlite.create(path.join(__dirname, "..", "..", ".dev-pg"));
  const server = new PGLiteSocketServer({ db, port: Number(process.env.DEV_DB_PORT) || 15433, host: "127.0.0.1" });
  await server.start();
  console.log("Postgres local (PGlite) pronto.");
  console.log("DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:15433/postgres");
  const stop = async () => { await server.stop(); await db.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
})().catch((error) => { console.error(error); process.exit(1); });
