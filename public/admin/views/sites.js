import { api, html, brl, dateBR, badge, optionsOf, safeUrl, num } from "/panel/ui.js";
import { crudView } from "./_crud.js";

const CATEGORY = { institucional: "Institucional", ecommerce: "E-commerce", landing: "Landing page", sistema: "Sistema", app: "Aplicativo" };
const STATUS = { online: ["No ar", "ok"], manutencao: ["Em manutenção", "warn"], offline: ["Fora do ar", "danger"] };
const card = (label, value, sub = "") => html`<div class="card kpi"><span class="label">${label}</span><span class="value">${value}</span><span class="foot">${sub}</span></div>`;

export default crudView({
  title: "Sites entregues",
  subtitle: "Portfólio da empresa, tecnologias e contratos de manutenção",
  endpoint: "/admin/sites",
  addLabel: "Novo site",
  searchPlaceholder: "Buscar site ou cliente...",
  searchKeys: ["name", "client_name", "company_name"],
  emptyText: "Nenhum site cadastrado.",
  filters: [{ key: "status", label: "Status", options: Object.entries(STATUS).map(([value, [label]]) => ({ value, label })) }, { key: "category", label: "Categoria", options: Object.entries(CATEGORY).map(([value, label]) => ({ value, label })) }],
  loadExtras: async () => ({ companies: (await api("/admin/companies")).items }),
  summary: (items) => html`<div class="grid grid-4">
    ${card("Sites no ar", num(items.filter((s) => s.status === "online").length), `${items.length} entregues no total`)}
    ${card("Receita recorrente (mês)", brl(items.filter((s) => s.status !== "offline").reduce((sum, s) => sum + s.maintenance_cents, 0)), "contratos de manutenção")}
    ${card("Com manutenção", num(items.filter((s) => s.maintenance_cents > 0).length), "contratos ativos")}
    ${card("Em destaque", num(items.filter((s) => s.featured).length), "no portfólio")}
  </div>`,
  columns: () => [
    { label: "Site", render: (s) => html`<div class="title">${s.name}</div><div class="sub">${safeUrl(s.url) ? html`<a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${s.url.replace(/^https?:\/\//, "")}</a>` : "sem endereço"}</div>` },
    { label: "Cliente", render: (s) => s.company_name || s.client_name || "—" },
    { label: "Categoria", render: (s) => CATEGORY[s.category] || s.category },
    { label: "Tecnologias", render: (s) => html`${(s.tech || []).slice(0, 3).map((t) => html`<span class="badge">${t}</span> `)}` },
    { label: "Entregue", render: (s) => dateBR(s.delivered_on) },
    { label: "Manutenção", align: "right", render: (s) => (s.maintenance_cents ? html`${brl(s.maintenance_cents)}<div class="sub">por mês</div>` : "—") },
    { label: "Status", render: (s) => html`${badge(STATUS[s.status]?.[0] || s.status, STATUS[s.status]?.[1])}${s.featured ? html` <span class="badge brand">Destaque</span>` : ""}` }
  ],
  fields: (extras) => [
    { name: "name", label: "Nome do site", required: true, full: true },
    { name: "companyId", label: "Cliente", type: "select", options: optionsOf(extras.companies, { blank: "Sem cliente vinculado" }) },
    { name: "clientName", label: "Nome de exibição do cliente" },
    { name: "url", label: "Endereço (URL)", placeholder: "https://" },
    { name: "category", label: "Categoria", type: "select", default: "institucional", options: Object.entries(CATEGORY).map(([value, label]) => ({ value, label })) },
    { name: "status", label: "Status", type: "select", default: "online", options: Object.entries(STATUS).map(([value, [label]]) => ({ value, label })) },
    { name: "deliveredOn", label: "Entregue em", type: "date" },
    { name: "maintenanceCents", label: "Manutenção mensal (R$)", type: "money", help: "Deixe 0 se não houver contrato." },
    { name: "tech", label: "Tecnologias", type: "tags", help: "Separe por vírgula.", full: true },
    { name: "featured", label: "Destacar no portfólio", type: "checkbox", full: true },
    { name: "notes", label: "Observações", type: "textarea", full: true }
  ]
});
