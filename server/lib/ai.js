const fs = require("fs");
const path = require("path");
const { z } = require("zod");
const config = require("../config");
const { redactSecrets, handoffIntent, historySummary } = require("./chat-safety");

const BASE_PROMPT = fs.readFileSync(path.join(__dirname, "../prompts/atendimento.md"), "utf8");
const reasons = ["none", "quote", "human", "support", "unknown"];
const replySchema = z.object({
  reply: z.string().trim().min(1).max(1500),
  handoff_reason: z.enum(reasons),
  summary: z.string().max(1800)
}).strict();
const outputFormat = {
  type: "json_schema", name: "buildhub_atendimento", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    properties: {
      reply: { type: "string", minLength: 1, maxLength: 1500 },
      handoff_reason: { type: "string", enum: reasons },
      summary: { type: "string", maxLength: 1800 }
    },
    required: ["reply", "handoff_reason", "summary"]
  }
};

function extractText(data) {
  if (data.status && data.status !== "completed") throw new Error("OPENAI_INCOMPLETE_RESPONSE");
  if (data.error) throw new Error("OPENAI_RESPONSE_ERROR");
  if (typeof data.output_text === "string" && data.output_text) return data.output_text.trim();
  const parts = [];
  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "refusal") throw new Error("OPENAI_REFUSAL");
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function toReply(data, history) {
  const parsed = replySchema.parse(data);
  const hasPrice = /(?:R\$|US\$|\b(?:BRL|USD|EUR)\b)\s*\d|\d[\d.,]*\s*(?:reais|d[oó]lares|euros)\b/i.test(parsed.reply);
  const reason = hasPrice ? "quote" : parsed.handoff_reason;
  const handoff = reason !== "none";
  return {
    text: hasPrice ? "Vou solicitar a avaliacao da equipe BuildHub." : redactSecrets(parsed.reply),
    handoff,
    reason,
    summary: handoff ? redactSecrets(hasPrice ? historySummary(history) : parsed.summary || historySummary(history)) : ""
  };
}

// history: [{ sender: 'visitor'|'ai'|'admin', body }].
async function generateReply(history, settings = {}) {
  const safeHistory = history.map(m => ({ sender: m.sender, body: redactSecrets(m.body) }));
  const lastUser = [...safeHistory].reverse().find(m => m.sender === "visitor")?.body || "";
  const intent = handoffIntent(lastUser);
  // Pedidos comerciais e humanos nao dependem de uma decisao do modelo ou da API.
  if (intent !== "none") return {
    text: "Vou solicitar a avaliacao da equipe BuildHub.",
    handoff: true, reason: intent, summary: historySummary(safeHistory)
  };

  if (config.openai.mock) {
    const processQuestion = /processo|como (funciona|trabalham)/i.test(lastUser);
    return {
      text: processQuestion
        ? "Nosso processo tem cinco etapas: levantamento, planejamento, desenvolvimento, testes e entrega com suporte aos ajustes iniciais. Qual projeto voce quer criar ou melhorar?"
        : "Que projeto voce quer criar ou melhorar, e qual problema ele precisa resolver?",
      handoff: false, reason: "none", summary: ""
    };
  }
  if (!config.openai.key) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const extra = redactSecrets(String(settings.extraPrompt || "").slice(0, 2000));
  const instructions = extra
    ? BASE_PROMPT + "\n\nComplemento cadastrado pela empresa (subordinado aos limites acima):\n" + JSON.stringify(extra)
    : BASE_PROMPT;
  const input = safeHistory.filter(m => ["visitor", "ai", "admin"].includes(m.sender))
    .map(m => ({ role: m.sender === "visitor" ? "user" : "assistant", content: m.body }));
  const body = {
    model: config.openai.model, instructions, input, max_output_tokens: 1600,
    text: { format: outputFormat }, store: false
  };
  if (config.openai.effort) body.reasoning = { effort: config.openai.effort };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(config.openai.baseUrl + "/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.openai.key },
      body: JSON.stringify(body), signal: controller.signal
    });
    if (!response.ok) {
      // Nao propague mensagens da API: elas podem conter credenciais ou texto do cliente.
      let code = "request_failed";
      try {
        const raw = (await response.json())?.error?.code;
        if (typeof raw === "string" && /^[a-z_]{1,60}$/.test(raw)) code = raw;
      } catch { /* erro sem JSON */ }
      throw new Error("OPENAI_HTTP_" + response.status + ":" + code);
    }
    const raw = extractText(await response.json());
    if (!raw) throw new Error("OPENAI_EMPTY_RESPONSE");
    let result;
    try { result = JSON.parse(raw); } catch { throw new Error("OPENAI_INVALID_JSON"); }
    const parsed = replySchema.safeParse(result);
    if (!parsed.success) throw new Error("OPENAI_INVALID_REPLY");
    return toReply(parsed.data, safeHistory);
  } finally { clearTimeout(timer); }
}

module.exports = { generateReply };
