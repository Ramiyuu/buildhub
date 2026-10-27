import { html, brl, num, statusBadge, optionsOf, UFS } from "/panel/ui.js";
import { crudView } from "./_crud.js";

const card = (label, value, sub = "") => html`<div class="card kpi"><span class="label">${label}</span><span class="value">${value}</span><span class="foot">${sub}</span></div>`;

export default crudView({
  title: "Clientes",
  subtitle: "Empresas atendidas, faturamento e situação financeira",
  endpoint: "/admin/companies",
  addLabel: "Novo cliente",
  searchPlaceholder: "Buscar por nome, cidade ou segmento...",
  searchKeys: ["name", "city", "segment", "email"],
  emptyText: "Nenhum cliente cadastrado.",
  filters: [{ key: "status", label: "Status", options: [{ value: "ativo", label: "Ativo" }, { value: "lead", label: "Lead" }, { value: "inativo", label: "Inativo" }] }],
  deleteMessage: (row) => `Excluir "${row.name}"? Clientes com projetos ou cobranças não podem ser excluídos (inative-os).`,
  summary: (items) => html`<div class="grid grid-4">
    ${card("Clientes ativos", num(items.filter((c) => c.status === "ativo").length), `${items.length} no total`)}
    ${card("Faturamento acumulado", brl(items.reduce((s, c) => s + c.paid_cents, 0)), "cobranças pagas")}
    ${card("Em aberto", brl(items.reduce((s, c) => s + c.open_cents, 0)), "a receber")}
    ${card("Em atraso", brl(items.reduce((s, c) => s + c.overdue_cents, 0)), `${items.filter((c) => c.overdue_cents > 0).length} cliente(s)`)}
  </div>`,
  columns: () => [
    { label: "Empresa", render: (c) => html`<div class="title">${c.name}</div><div class="sub">${[c.segment, c.city && `${c.city}${c.state ? `/${c.state}` : ""}`].filter(Boolean).join(" · ") || "—"}</div>` },
    { label: "Contato", render: (c) => html`<div>${c.email || "—"}</div><div class="sub">${c.phone || ""}</div>` },
    { label: "Status", render: (c) => statusBadge("company", c.status) },
    { label: "Projetos", render: (c) => html`${c.active_projects} ativo(s)<div class="sub">${c.projects} no total</div>` },
    { label: "Faturado", align: "right", render: (c) => brl(c.paid_cents) },
    { label: "Em aberto", align: "right", render: (c) => c.overdue_cents ? html`<span class="badge danger">${brl(c.open_cents)}</span>` : c.open_cents ? brl(c.open_cents) : "—" }
  ],
  fields: () => [
    { name: "name", label: "Nome da empresa", required: true, full: true },
    { name: "cnpj", label: "CNPJ" }, { name: "segment", label: "Segmento" },
    { name: "email", label: "Email", type: "email" }, { name: "phone", label: "Telefone" },
    { name: "city", label: "Cidade" },
    { name: "state", label: "UF", type: "select", options: [{ value: "", label: "—" }, ...UFS.map((u) => ({ value: u, label: u }))] },
    { name: "status", label: "Status", type: "select", default: "ativo", options: [{ value: "ativo", label: "Ativo" }, { value: "lead", label: "Lead" }, { value: "inativo", label: "Inativo" }] },
    { name: "notes", label: "Observações", type: "textarea", full: true }
  ]
});
