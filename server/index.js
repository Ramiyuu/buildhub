const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const config = require("./config");
const { migrate, pool } = require("./db");
const events = require("./lib/events");
const { HttpError } = require("./lib/http");
const { ensureAdmin } = require("./lib/bootstrap");
const { securityHeaders, identifyClient, limits, sameOrigin } = require("./middleware/security");
const { loadSession, pageGuard } = require("./middleware/auth");

const app = express();
const publicDir = path.join(__dirname, "..", "public");

app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy > 0 ? config.trustProxy : false);

// Healthcheck da Railway: sem banco.
app.get("/health", (req, res) => res.json({ ok: true }));

app.use(identifyClient);    // Identifica IP e localizacao, sem restringir paises.
app.use(securityHeaders);   // 2) CSP, HSTS, nosniff...
app.use(limits.global);     // 3) limite global por IP
app.use(cookieParser());
app.use(express.json({ limit: "20kb" }));

// ---------------------------------------------------------------- API
app.use("/api", sameOrigin, loadSession, (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use("/api/auth", require("./routes/auth"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/client", require("./routes/client"));
app.use("/api", require("./routes/public"));
app.use("/api", (req, res) => res.status(404).json({ error: "Rota não encontrada." }));

// ---------------------------------------------------------------- paginas protegidas (so com sessao valida)
const staticOptions = {
  setHeaders(res, file) {
    res.setHeader("Cache-Control", /\.(png|jpe?g|svg|webp|ico|woff2?)$/i.test(file) ? "public, max-age=86400" : "no-cache");
  }
};
app.use("/admin", loadSession, pageGuard("admin", "staff"), express.static(path.join(publicDir, "admin"), staticOptions));
app.use("/cliente", loadSession, pageGuard("client"), express.static(path.join(publicDir, "cliente"), staticOptions));
app.use("/panel", loadSession, pageGuard("admin", "staff", "client"), express.static(path.join(publicDir, "panel"), staticOptions));
app.use(["/admin", "/cliente", "/panel"], (req, res) => res.status(404).type("text/plain").send("Não encontrado."));

// ---------------------------------------------------------------- site publico
app.use(express.static(publicDir, { ...staticOptions, extensions: ["html"] }));
app.use((req, res) => res.status(404).sendFile(path.join(publicDir, "index.html")));

// ---------------------------------------------------------------- erros
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message, ...(error.extra || {}) });
  if (error.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido." });
  if (error.type === "entity.too.large") return res.status(413).json({ error: "Requisição grande demais." });
  console.error("[erro]", req.method, req.path, error.message);
  res.status(500).json({ error: "Erro interno. Tente novamente em instantes." });
});

async function main() {
  await migrate();
  await ensureAdmin();
  if (config.seedDemo) await require("./scripts/seed-demo").seedDemoIfEmpty();

  const server = app.listen(config.port, () => {
    console.log(`BuildHub no ar: http://localhost:${config.port} (${config.isProd ? "producao" : "desenvolvimento"})`);
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 20000;
  server.keepAliveTimeout = 65000;
  server.maxHeadersCount = 60;

  const shutdown = async () => {
    server.close();
    await events.flush().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason?.message || reason));

main().catch((error) => {
  console.error("Falha ao iniciar:", error);
  process.exit(1);
});
