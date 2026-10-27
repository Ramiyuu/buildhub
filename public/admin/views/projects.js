import { api, html, brl, dateBR, statusBadge, progress, optionsOf, PROJECT_TYPES, STATUS, badge } from "/panel/ui.js";
import { crudView } from "./_crud.js";

const today = () => new Date().toISOString().slice(0, 10);
const typeOptions = Object.entries(PROJECT_TYPES).map(([value, label]) => ({ value, label }));
const statusOptions = Object.entries(STATUS.project).map(([value, [label]]) => ({ value, label }));

export default crudView({
  title: "Projetos",
  subtitle: "Do briefing à entrega: prazos, orçamento e andamento",
  endpoint: "/admin/projects",
  addLabel: "Novo projeto",
  searchPlaceholder: "Buscar projeto ou cliente...",
  searchKeys: ["name", "company_name"],
  emptyText: "Nenhum projeto cadastrado.",
  filters: [{ key: "status", label: "Status", options: statusOptions }, { key: "type", label: "Tipo", options: typeOptions }],
  loadExtras: async () => ({ companies: (await api("/admin/companies")).items }),
  deleteMessage: (row) => `Excluir o projeto "${row.name}"? As tarefas dele também serão removidas.`,
  summary: (items) => {
    const live = items.filter((p) => !["entregue", "cancelado"].includes(p.status));
    const late = live.filter((p) => p.due_date && p.due_date < today());
    return html`<div class="row wrap">
      ${Object.entries(STATUS.project).map(([key, [label, tone]]) => html`<span class="badge ${tone}">${label}: ${items.filter((p) => p.status === key).length}</span>`)}
      <span class="spacer"></span>
      ${late.length ? html`<span class="badge danger">${late.length} projeto(s) com prazo vencido</span>` : html`<span class="badge ok">Nenhum projeto atrasado</span>`}
    </div>`;
  },
  columns: () => [
    { label: "Projeto", render: (p) => html`<div class="title">${p.name}</div><div class="sub">${PROJECT_TYPES[p.type] || p.type}</div>` },
    { label: "Cliente", render: (p) => p.company_name },
    { label: "Status", render: (p) => statusBadge("project", p.status) },
    { label: "Progresso", render: (p) => html`<div style="min-width:110px">${progress(p.progress)}<div class="sub">${p.progress}%</div></div>` },
    { label: "Prazo", render: (p) => { const late = p.due_date && p.due_date < today() && !["entregue", "cancelado"].includes(p.status); return late ? badge(dateBR(p.due_date), "danger") : dateBR(p.status === "entregue" ? p.delivered_at || p.due_date : p.due_date); } },
    { label: "Orçamento", align: "right", render: (p) => html`${brl(p.budget_cents)}<div class="sub">recebido ${brl(p.paid_cents)}</div>` },
    { label: "Tarefas", render: (p) => (p.tasks_total ? `${p.tasks_done}/${p.tasks_total}` : "—") }
  ],
  fields: (extras) => [
    { name: "companyId", label: "Cliente", type: "select", required: true, options: [{ value: "", label: "Selecione..." }, ...optionsOf(extras.companies)], full: true },
    { name: "name", label: "Nome do projeto", required: true, full: true },
    { name: "type", label: "Tipo", type: "select", default: "site", options: typeOptions },
    { name: "status", label: "Status", type: "select", default: "briefing", options: statusOptions },
    { name: "progress", label: "Progresso (%)", type: "number", default: 0 },
    { name: "budgetCents", label: "Orçamento (R$)", type: "money" },
    { name: "startDate", label: "Início", type: "date" }, { name: "dueDate", label: "Prazo de entrega", type: "date" },
    { name: "deliveredAt", label: "Entregue em", type: "date" }, { name: "url", label: "Endereço (URL)", placeholder: "https://" },
    { name: "stack", label: "Tecnologias", type: "tags", help: "Separe por vírgula. Ex.: Node.js, PostgreSQL", full: true },
    { name: "description", label: "Descrição", type: "textarea", full: true }
  ]
});
