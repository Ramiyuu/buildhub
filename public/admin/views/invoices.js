import { api, html, mount, table, modal, formModal, confirmDialog, toast, brl, dateBR, badge, icon, debounce, optionsOf, esc } from "/panel/ui.js";

const METHODS = [{ value: "pix", label: "Pix" }, { value: "boleto", label: "Boleto" }, { value: "cartao", label: "Cartão" }, { value: "transferencia", label: "Transferência" }];
const TABS = [["", "Todas"], ["pendente", "A vencer"], ["atrasada", "Atrasadas"], ["paga", "Pagas"], ["cancelada", "Canceladas"]];
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function statusOf(inv) {
  if (inv.status === "pendente") return inv.overdue ? badge(`Atrasada há ${inv.days_overdue}d`, "danger") : badge("A vencer", "warn");
  return inv.status === "paga" ? badge("Paga", "ok") : badge("Cancelada", "");
}

export default async function render(root, ctx) {
  ctx.setTitle("Cobranças", "Controle de recebimentos, atrasos e lembretes");
  const [companies, projects] = await Promise.all([api("/admin/companies").then((r) => r.items), api("/admin/projects").then((r) => r.items)]);
  const state = { status: "", q: "", items: [], totals: {} };

  mount(root, html`<div class="stack">
    <div id="kpis"></div>
    <div class="toolbar">
      <div class="seg" id="tabs">${TABS.map(([key, label]) => html`<button type="button" data-tab="${key}" class="${key === "" ? "active" : ""}">${label}</button>`)}</div>
      <input class="input search" id="q" type="search" placeholder="Buscar cliente, número ou descrição..." aria-label="Buscar">
      <span class="spacer"></span>
      <button class="btn primary" id="add" type="button">${icon("plus")} Nova cobrança</button>
    </div>
    <div id="list"></div>
  </div>`);
  const list = root.querySelector("#list");

  async function load() {
    const params = new URLSearchParams();
    if (state.status) params.set("status", state.status);
    if (state.q) params.set("q", state.q);
    const data = await api(`/admin/invoices?${params}`);
    state.items = data.items;
    state.totals = data.totals;
    draw();
  }

  function draw() {
    const t = state.totals;
    mount(root.querySelector("#kpis"), html`<div class="grid grid-4">
      <div class="card kpi"><span class="label">A vencer</span><span class="value">${brl(t.pending_cents)}</span><span class="foot">cobranças pendentes no prazo</span></div>
      <div class="card kpi"><span class="label">Em atraso</span><span class="value" style="color:var(--p-danger)">${brl(t.overdue_cents)}</span><span class="foot">${t.overdue_count || 0} cobrança(s) vencida(s)</span></div>
      <div class="card kpi"><span class="label">Recebido no mês</span><span class="value" style="color:var(--p-ok)">${brl(t.paid_month_cents)}</span><span class="foot">baixas do mês atual</span></div>
      <div class="card kpi"><span class="label">Listadas</span><span class="value">${state.items.length}</span><span class="foot">conforme o filtro</span></div>
    </div>`);
    mount(list, table({
      emptyText: "Nenhuma cobrança neste filtro.",
      columns: [
        { label: "Nº", render: (i) => html`<span class="title nowrap">${i.number}</span>` },
        { label: "Cliente", render: (i) => html`<div class="title">${i.company_name}</div><div class="sub">${i.description}</div>` },
        { label: "Vencimento", render: (i) => html`${dateBR(i.due_date)}${i.status === "paga" ? html`<div class="sub">pago em ${dateBR(i.paid_at)}</div>` : ""}` },
        { label: "Valor", align: "right", render: (i) => html`<strong>${brl(i.amount_cents)}</strong>${i.payment_method ? html`<div class="sub">${i.payment_method}</div>` : ""}` },
        { label: "Situação", render: (i) => statusOf(i) },
        { label: "Lembretes", render: (i) => (i.reminder_count ? html`${i.reminder_count}<div class="sub">último ${dateBR(String(i.last_reminder_at).slice(0, 10))}</div>` : "—") },
        {
          label: "", className: "actions", render: (i) => i.status === "pendente"
            ? html`<button class="btn sm primary" data-act="pay" data-id="${i.id}">Baixar</button> <button class="btn sm ghost" data-act="remind" data-id="${i.id}">Lembrete</button> <button class="btn sm ghost" data-act="edit" data-id="${i.id}" aria-label="Editar">${icon("edit")}</button> <button class="btn sm danger" data-act="cancel" data-id="${i.id}" aria-label="Cancelar cobrança">${icon("x")}</button>`
            : html`<button class="btn sm ghost" data-act="reopen" data-id="${i.id}">Reabrir</button>`
        }
      ],
      rows: state.items
    }));
  }

  const fields = (initial = {}) => [
    { name: "companyId", label: "Cliente", type: "select", required: true, full: true, options: [{ value: "", label: "Selecione..." }, ...optionsOf(companies)] },
    { name: "projectId", label: "Projeto (opcional)", type: "select", full: true, options: optionsOf(projects, { blank: "Sem projeto" }) },
    { name: "description", label: "Descrição", required: true, full: true, placeholder: "Ex.: Parcela final do site institucional" },
    { name: "amountCents", label: "Valor (R$)", type: "money", required: true },
    { name: "dueDate", label: "Vencimento", type: "date", required: true, default: plusDays(10) },
    { name: "notes", label: "Observações", type: "textarea", full: true }
  ];

  const save = (invoice) => async (values) => {
    const body = { ...values, projectId: values.projectId || null, notes: values.notes || null };
    if (!body.amountCents) throw new Error("Informe um valor maior que zero.");
    await api(invoice ? `/admin/invoices/${invoice.id}` : "/admin/invoices", { method: invoice ? "PATCH" : "POST", body });
    toast(invoice ? "Cobrança atualizada." : "Cobrança criada.", "ok");
    await load();
  };

  root.querySelector("#add").addEventListener("click", () => formModal({ title: "Nova cobrança", fields: fields(), wide: true, submitLabel: "Criar cobrança", onSubmit: save(null) }));
  root.querySelector("#tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (!tab) return;
    state.status = tab.dataset.tab;
    root.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b === tab));
    load();
  });
  root.querySelector("#q").addEventListener("input", debounce((event) => { state.q = event.target.value.trim(); load(); }, 250));

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const inv = state.items.find((i) => i.id === button.dataset.id);
    const act = button.dataset.act;
    try {
      if (act === "edit") {
        formModal({ title: `Editar ${inv.number}`, fields: fields(), wide: true, initial: { companyId: inv.company_id, projectId: inv.project_id, description: inv.description, amountCents: inv.amount_cents, dueDate: String(inv.due_date).slice(0, 10), notes: inv.notes }, onSubmit: save(inv) });
      } else if (act === "pay") {
        formModal({
          title: `Baixar ${inv.number}`, subtitle: `${inv.company_name} · ${brl(inv.amount_cents)}`, submitLabel: "Confirmar pagamento",
          fields: [{ name: "method", label: "Forma de pagamento", type: "select", options: METHODS, default: "pix" }, { name: "paidAt", label: "Data do pagamento", type: "date", default: today() }],
          onSubmit: async (v) => { await api(`/admin/invoices/${inv.id}/pay`, { method: "POST", body: { method: v.method, paidAt: v.paidAt || undefined } }); toast("Pagamento registrado.", "ok"); await load(); }
        });
      } else if (act === "remind") {
        const { message, reminderCount } = await api(`/admin/invoices/${inv.id}/remind`, { method: "POST", body: {} });
        modal({
          title: "Lembrete de cobrança", subtitle: `Registrado (${reminderCount}º lembrete). Copie o texto e envie por WhatsApp ou e-mail — o painel não envia mensagens sozinho.`,
          body: html`<textarea class="textarea" rows="5" readonly id="remindText">${message}</textarea>`,
          actions: [{ label: "Copiar texto", className: "primary", close: false, onClick: async ({ button: b }) => { await navigator.clipboard?.writeText(message).catch(() => {}); b.textContent = "Copiado!"; } }, { label: "Fechar" }]
        });
        await load();
      } else if (act === "cancel") {
        if (await confirmDialog({ title: "Cancelar cobrança?", message: `${inv.number} · ${brl(inv.amount_cents)} deixará de contar como a receber.`, confirmLabel: "Cancelar cobrança", danger: true })) { await api(`/admin/invoices/${inv.id}/cancel`, { method: "POST", body: {} }); toast("Cobrança cancelada.", "ok"); await load(); }
      } else if (act === "reopen") {
        if (await confirmDialog({ title: "Reabrir cobrança?", message: "Ela volta para pendente.", confirmLabel: "Reabrir" })) { await api(`/admin/invoices/${inv.id}/reopen`, { method: "POST", body: {} }); await load(); }
      }
    } catch (error) { toast(error.message, "danger"); }
  });

  await load();
}
