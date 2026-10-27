class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Valida com zod e devolve os dados limpos (campos desconhecidos sao descartados).
function parse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.length ? issue.path.join(".") : "";
  throw new HttpError(400, issue.message && !/^Invalid|^Required|^Expected/i.test(issue.message) ? issue.message : `Dado inválido${field ? ` em "${field}"` : ""}.`);
}

const isUuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function uuidParam(req, name = "id") {
  const value = req.params[name];
  if (!isUuid(value)) throw new HttpError(404, "Registro não encontrado.");
  return value;
}

// Monta INSERT/UPDATE a partir das chaves do objeto ja validado (as chaves vem do schema, nunca do usuario).
function toColumns(data) {
  const snake = (key) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return Object.entries(data).filter(([, v]) => v !== undefined).map(([k, v]) => [snake(k), v]);
}

function buildInsert(table, data, extra = []) {
  const cols = [...toColumns(data), ...extra];
  const names = cols.map(([k]) => k).join(", ");
  const marks = cols.map((_, i) => `$${i + 1}`).join(", ");
  return { text: `INSERT INTO ${table} (${names}) VALUES (${marks}) RETURNING *`, values: cols.map(([, v]) => v) };
}

function buildUpdate(table, id, data) {
  const cols = toColumns(data);
  if (!cols.length) throw new HttpError(400, "Nada para atualizar.");
  const sets = cols.map(([k], i) => `${k} = $${i + 1}`).join(", ");
  return { text: `UPDATE ${table} SET ${sets}, updated_at = now() WHERE id = $${cols.length + 1} RETURNING *`, values: [...cols.map(([, v]) => v), id] };
}

const money = (cents) => Math.round(Number(cents) || 0);

module.exports = { HttpError, parse, isUuid, uuidParam, buildInsert, buildUpdate, money };
