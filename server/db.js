const fs = require("fs");
const path = require("path");
const { Pool, types } = require("pg");
const config = require("./config");

// date vem como texto "YYYY-MM-DD" (sem virar Date com fuso) e bigint (somas em centavos) vem como numero.
types.setTypeParser(1082, (value) => value);
types.setTypeParser(20, (value) => Number(value));

if (!config.databaseUrl) {
  console.error("DATABASE_URL nao definida. Em desenvolvimento rode `npm run dev:db` e copie a URL para .env; na Railway adicione o plugin Postgres.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: config.databasePoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
  statement_timeout: 15000
});

pool.on("error", (error) => console.error("[db] erro no pool:", error.message));


const query = (text, params) => pool.query(text, params);

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Aplica server/migrations/*.sql em ordem, uma vez cada, com lock para nao rodar em duas instancias ao mesmo tempo.
async function migrate() {
  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727401)");
    // "Hoje", "este mes" e vencimentos seguem o horario de Brasilia (conexoes novas herdam do banco).
    try {
      await client.query("DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Sao_Paulo'); END $$");
      await client.query("SET TIME ZONE 'America/Sao_Paulo'");
    } catch (error) {
      console.warn("[db] nao foi possivel fixar o fuso do banco:", error.message);
    }
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[db] migracao aplicada: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727401)").catch(() => {});
    client.release();
  }
}

module.exports = { pool, query, tx, migrate };
