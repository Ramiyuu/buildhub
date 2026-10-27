// Redacao defensiva: nao substitui autenticacao nem detecta todos os tipos de segredo.
function redactSecrets(value = "") {
  return String(value)
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/g, "[chave privada removida]")
    .replace(/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}\b/g, "[chave de API removida]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}=*/gi, "Bearer [credencial removida]")
    .replace(/\b(senha|password|api[_ -]?key|access[_ -]?token)\s*[:=]\s*[^\s,;]+/gi, "$1: [credencial removida]");
}

function handoffIntent(value = "") {
  const text = String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(atendente|humano|administrador|admin|pessoa de verdade|falar com (alguem|uma pessoa|o dono|um consultor))\b/.test(text)) return "human";
  if (/\b(orcamento|cotacao|proposta comercial|precos?|quanto custa|quanto fica|quanto voces cobram|qual o valor|quais os valores|valor do (site|projeto|sistema)|descontos?|parcelas?|parcelamento)\b/.test(text)) return "quote";
  if (/\b(cobranca|contrato|reembolso|pagamento|pagar|reclamacao|excluir meus dados|apagar meus dados|invadiram|minha conta|esqueci (a |minha )?senha)\b/.test(text)) return "support";
  return "none";
}

function historySummary(history) {
  return redactSecrets(history.filter(m => m.sender === "visitor")
    .map(m => m.body).join("\n")).slice(-1800);
}

module.exports = { redactSecrets, handoffIntent, historySummary };
