import { api, html, mount, table, formModal, confirmDialog, toast, brl, brlShort, dateBR, badge, icon, deltaChip, esc } from "/panel/ui.js";
import { barChart, lineChart, donut, hbars, COLORS, PALETTE } from "/panel/charts.js";
import { clean } from "./_crud.js";

const CATEGORIES = { hospedagem: "Hospedagem", infraestrutura: "Infraestrutura", ferramentas: "Ferramentas", folha: "Folha e pró-labore", marketing: "Marketing", impostos: "Impostos", freelancer: "Freelancers", outros: "Outros" };
const AGING = [["a_vencer", "A vencer"], ["ate_7", "Atraso até 7 dias"], ["ate_30", "Atraso de 8 a 30 dias"], ["ate_60", "Atraso de 31 a 60 dias"], ["mais_60", "Atraso acima de 60 dias"]];
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthLabel = (ym) => MONTHS[Number(ym.slice(5)) - 1];

export default async function render(root, ctx) {
  ctx.setTitle("Financeiro", "Receitas, despesas, lucro e saúde do caixa");
  const state = { months: 12, expenses: [], category: "" };

  mount(root, html`<div class="stack">
    <div id="kpis"></div>
    <div class="grid grid-main">
      <div class="card"><div class="card-head"><div><h2>Receita × despesas</h2><p>Pagamentos recebidos e despesas lançadas por mês</p></div><div class="seg" id="range"><button data-m="6">6 meses</button><button data-m="12" class="active">12 meses</button></div></div><div id="chartBars"></div><div class="legend"><span><i style="background:${COLORS.accent}"></i>Receita</span><span><i style="background:${COLORS.rose}"></i>Despesas</span></div></div>
      <div class="card"><div class="card-head"><div><h2>Lucro por mês</h2><p>Receita menos despesas</p></div></div><div id="chartProfit"></div></div>
    </div>
    <div class="grid grid-3">
      <div class="card"><div class="card-head"><div><h2>Cobranças em aberto</h2><p>Por tempo de atraso</p></div></div><div id="aging"></div></div>
      <div class="card"><div class="card-head"><div><h2>Maiores clientes</h2><p>Receita nos últimos 12 meses</p></div></div><div id="top"></div></div>
      <div class="card"><div class="card-head"><div><h2>Despesas por categoria</h2><p>Últimos 90 dias</p></div></div><div id="cats"></div></div>
    </div>
    <div class="card"><div class="card-head"><div><h2>Próximos vencimentos</h2><p>Cobranças pendentes dos próximos 15 dias e atrasadas</p></div><a class="btn sm ghost" href="#/cobrancas">Ver cobranças</a></div><div id="upcoming"></div></div>
    <div>
      <div class="toolbar"><h2 style="font-size:1.05rem">Despesas</h2><select class="select" id="catFilter" aria-label="Categoria"><option value="">Todas as categorias</option>${Object.entries(CATEGORIES).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select><span class="spacer"></span><button class="btn primary" id="addExpense" type="button">${icon("plus")} Nova despesa</button></div>
      <div id="expenses"></div>
    </div>
  </div>`);

  async function loadSummary() {
    const s = await api(`/admin/finance/summary?months=${state.months}`);
    const labels = s.monthly.map((m) => monthLabel(m.month));
    const profit = s.monthly.map((m) => m.revenue - m.expenses);
    const margin = s.thisMonth.revenue ? Math.round((s.thisMonth.profit / s.thisMonth.revenue) * 100) : 0;

    mount(root.querySelector("#kpis"), html`<div class="grid grid-4">
      <div class="card kpi"><span class="label">Receita do mês</span><span class="value">${brl(s.thisMonth.revenue)}</span><span class="foot">${deltaChip(s.thisMonth.revenue, s.thisMonth.previousRevenue)} vs mês anterior</span></div>
      <div class="card kpi"><span class="label">Despesas do mês</span><span class="value">${brl(s.thisMonth.expenses)}</span><span class="foot">lançadas até hoje</span></div>
      <div class="card kpi"><span class="label">Lucro do mês</span><span class="value" style="color:${s.thisMonth.profit >= 0 ? "var(--p-ok)" : "var(--p-danger)"}">${brl(s.thisMonth.profit)}</span><span class="foot">margem de ${margin}%</span></div>
      <div class="card kpi"><span class="label">Receita recorrente (MRR)</span><span class="value">${brl(s.mrr.mrr_cents)}</span><span class="foot">${s.mrr.sites} site(s) com manutenção</span></div>
    </div>`);

    barChart(root.querySelector("#chartBars"), { labels, series: [{ name: "Receita", values: s.monthly.map((m) => m.revenue), color: COLORS.accent }, { name: "Despesas", values: s.monthly.map((m) => m.expenses), color: COLORS.rose }], format: (v, axis) => (axis ? brlShort(v).replace("R$ ", "") : brl(v)) });
    lineChart(root.querySelector("#chartProfit"), { width: 420, labels, series: [{ name: "Lucro", values: profit.map((v) => Math.max(v, 0)), color: COLORS.ok }], format: (v, axis) => (axis ? brlShort(v).replace("R$ ", "") : brl(v)) });

    const byBucket = Object.fromEntries(s.aging.map((a) => [a.bucket, a]));
    mount(root.querySelector("#aging"), html`${hbars(AGING.map(([key, label], i) => ({ label: `${label}${byBucket[key] ? ` (${byBucket[key].n})` : ""}`, value: byBucket[key]?.cents || 0, color: i === 0 ? COLORS.info : COLORS.danger })), { format: brl })}<p class="muted small mt">Total em aberto: <b>${brl(s.receivable.pending_cents + s.receivable.overdue_cents)}</b></p>`);
    mount(root.querySelector("#top"), s.topClients.length ? hbars(s.topClients.map((c) => ({ label: c.name, value: c.cents })), { format: brlShort }) : html`<div class="empty">Sem recebimentos no período.</div>`);
    donut(root.querySelector("#cats"), s.expensesByCategory.map((c, i) => ({ label: CATEGORIES[c.category] || c.category, value: c.cents, color: PALETTE[i % PALETTE.length] })), { format: brlShort, center: "em 90 dias" });
    mount(root.querySelector("#upcoming"), table({
      emptyText: "Nada vencendo nos próximos dias.",
      columns: [{ label: "Cobrança", render: (i) => html`<span class="title">${i.number}</span>` }, { label: "Cliente", render: (i) => html`${i.company_name}<div class="sub">${i.description}</div>` }, { label: "Vencimento", render: (i) => (i.overdue ? badge(`${dateBR(i.due_date)} · ${i.days_overdue}d de atraso`, "danger") : dateBR(i.due_date)) }, { label: "Valor", align: "right", render: (i) => brl(i.amount_cents) }],
      rows: s.upcoming
    }));
  }

  async function loadExpenses() {
    state.expenses = (await api("/admin/expenses")).items;
    drawExpenses();
  }

  function drawExpenses() {
    const rows = state.expenses.filter((e) => !state.category || e.category === state.category);
    mount(root.querySelector("#expenses"), table({
      emptyText: "Nenhuma despesa neste filtro.",
      columns: [
        { label: "Data", render: (e) => dateBR(e.spent_on) },
        { label: "Descrição", render: (e) => html`<div class="title">${e.description}</div><div class="sub">${e.vendor || ""}${e.recurring ? " · recorrente" : ""}</div>` },
        { label: "Categoria", render: (e) => badge(CATEGORIES[e.category] || e.category, "brand") },
        { label: "Valor", align: "right", render: (e) => brl(e.amount_cents) },
        { label: "", className: "actions", render: (e) => html`<button class="btn sm ghost" data-act="edit" data-id="${e.id}" aria-label="Editar">${icon("edit")}</button> <button class="btn sm danger" data-act="del" data-id="${e.id}" aria-label="Excluir">${icon("trash")}</button>` }
      ],
      rows: rows.slice(0, 60)
    }));
    if (rows.length > 60) root.querySelector("#expenses").insertAdjacentHTML("beforeend", `<p class="muted small mt">Mostrando as 60 mais recentes de ${rows.length}.</p>`);
  }

  const fields = () => [
    { name: "description", label: "Descrição", required: true, full: true },
    { name: "category", label: "Categoria", type: "select", options: Object.entries(CATEGORIES).map(([value, label]) => ({ value, label })), default: "outros" },
    { name: "amountCents", label: "Valor (R$)", type: "money", required: true },
    { name: "spentOn", label: "Data", type: "date", default: new Date().toISOString().slice(0, 10) },
    { name: "vendor", label: "Fornecedor" },
    { name: "recurring", label: "Despesa recorrente (mensal)", type: "checkbox", full: true }
  ];
  const openExpense = (expense) => formModal({
    title: expense ? "Editar despesa" : "Nova despesa", fields: fields(), wide: true,
    initial: expense ? { description: expense.description, category: expense.category, amountCents: expense.amount_cents, spentOn: String(expense.spent_on).slice(0, 10), vendor: expense.vendor, recurring: expense.recurring } : {},
    onSubmit: async (values) => {
      if (!values.amountCents) throw new Error("Informe um valor maior que zero.");
      await api(expense ? `/admin/expenses/${expense.id}` : "/admin/expenses", { method: expense ? "PATCH" : "POST", body: clean(values) });
      toast("Despesa salva.", "ok");
      await Promise.all([loadExpenses(), loadSummary()]);
    }
  });

  root.querySelector("#addExpense").addEventListener("click", () => openExpense(null));
  root.querySelector("#catFilter").addEventListener("change", (event) => { state.category = event.target.value; drawExpenses(); });
  root.querySelector("#range").addEventListener("click", (event) => {
    const b = event.target.closest("[data-m]");
    if (!b) return;
    state.months = Number(b.dataset.m);
    root.querySelectorAll("#range button").forEach((x) => x.classList.toggle("active", x === b));
    loadSummary();
  });
  root.querySelector("#expenses").addEventListener("click", async (event) => {
    const b = event.target.closest("[data-act]");
    if (!b) return;
    const expense = state.expenses.find((e) => e.id === b.dataset.id);
    if (b.dataset.act === "edit") return openExpense(expense);
    if (await confirmDialog({ title: "Excluir despesa?", message: `${expense.description} · ${brl(expense.amount_cents)}`, confirmLabel: "Excluir", danger: true })) {
      try { await api(`/admin/expenses/${expense.id}`, { method: "DELETE" }); toast("Despesa excluída.", "ok"); await Promise.all([loadExpenses(), loadSummary()]); } catch (error) { toast(error.message, "danger"); }
    }
  });

  await Promise.all([loadSummary(), loadExpenses()]);
}
