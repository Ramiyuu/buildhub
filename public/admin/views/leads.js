import { html, brl, since, badge } from "/panel/ui.js";
import { kanbanView } from "./_kanban.js";

const SOURCE = { chat: "Chat", site: "Site", indicacao: "Indicação", instagram: "Instagram", outro: "Outro" };
const STATUSES = [{ key: "novo", label: "Novos" }, { key: "contato", label: "Em contato" }, { key: "proposta", label: "Proposta enviada" }, { key: "ganho", label: "Ganhos" }, { key: "perdido", label: "Perdidos" }];

export default kanbanView({
  title: "Leads e funil",
  subtitle: "Arraste os cartões entre as colunas conforme a negociação avança",
  endpoint: "/admin/leads",
  addLabel: "Novo lead",
  statuses: STATUSES,
  summary: (items) => {
    const open = items.filter((i) => ["novo", "contato", "proposta"].includes(i.status));
    const won = items.filter((i) => i.status === "ganho");
    const closed = items.filter((i) => ["ganho", "perdido"].includes(i.status));
    return html`<div class="grid grid-4">
      <div class="card kpi"><span class="label">Em negociação</span><span class="value">${open.length}</span><span class="foot">${brl(open.reduce((s, i) => s + i.value_cents, 0))} no funil</span></div>
      <div class="card kpi"><span class="label">Propostas enviadas</span><span class="value">${items.filter((i) => i.status === "proposta").length}</span><span class="foot">${brl(items.filter((i) => i.status === "proposta").reduce((s, i) => s + i.value_cents, 0))}</span></div>
      <div class="card kpi"><span class="label">Fechados (ganhos)</span><span class="value">${won.length}</span><span class="foot">${brl(won.reduce((s, i) => s + i.value_cents, 0))}</span></div>
      <div class="card kpi"><span class="label">Taxa de conversão</span><span class="value">${closed.length ? Math.round((won.length / closed.length) * 100) : 0}%</span><span class="foot">ganhos ÷ fechados</span></div>
    </div>`;
  },
  card: (lead) => html`<div class="t">${lead.name}</div>
    <div class="muted small">${lead.company_name || lead.email || "—"}</div>
    <div class="row wrap"><strong>${lead.value_cents ? brl(lead.value_cents) : "Sem valor"}</strong><span class="spacer"></span>${badge(SOURCE[lead.source] || lead.source, "brand")}</div>
    <div class="muted small">atualizado ${since(lead.updated_at)}</div>`,
  fields: () => [
    { name: "name", label: "Nome do contato", required: true },
    { name: "companyName", label: "Empresa" },
    { name: "email", label: "Email", type: "email" }, { name: "phone", label: "Telefone" },
    { name: "valueCents", label: "Valor estimado (R$)", type: "money" },
    { name: "source", label: "Origem", type: "select", default: "site", options: Object.entries(SOURCE).map(([value, label]) => ({ value, label })) },
    { name: "status", label: "Etapa", type: "select", default: "novo", options: STATUSES.map((s) => ({ value: s.key, label: s.label })) },
    { name: "notes", label: "Observações", type: "textarea", full: true }
  ]
});
