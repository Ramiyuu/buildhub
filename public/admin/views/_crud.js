// Tela de lista + cadastro generica (busca, filtros, criar, editar, excluir) usada por Clientes, Projetos e Sites.
import { api, html, mount, table, formModal, confirmDialog, toast, debounce, icon, camel } from "/panel/ui.js";

export const clean = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === "" ? null : v]));

export function crudView(config) {
  return async function render(root, ctx) {
    ctx.setTitle(config.title, config.subtitle || "");
    const extras = config.loadExtras ? await config.loadExtras() : {};
    const state = { q: "", filters: {}, items: [] };

    mount(root, html`<div class="stack">
      <div id="summary"></div>
      <div class="toolbar">
        <input class="input search" id="q" type="search" placeholder="${config.searchPlaceholder || "Buscar..."}" aria-label="Buscar">
        ${(config.filters || []).map((f) => html`<select class="select" data-filter="${f.key}" aria-label="${f.label}"><option value="">${f.label}: todos</option>${f.options.map((o) => html`<option value="${o.value}">${o.label}</option>`)}</select>`)}
        <span class="spacer"></span>
        <button class="btn primary" id="add" type="button">${icon("plus")} ${config.addLabel}</button>
      </div>
      <div id="list"></div>
    </div>`);

    const listEl = root.querySelector("#list");
    const summaryEl = root.querySelector("#summary");

    const visible = () => state.items.filter((row) => {
      const q = state.q.trim().toLowerCase();
      if (q && !(config.searchKeys || ["name"]).some((k) => String(row[k] ?? "").toLowerCase().includes(q))) return false;
      return Object.entries(state.filters).every(([key, value]) => !value || String(row[key]) === value);
    });

    function draw() {
      const rows = visible();
      if (config.summary) mount(summaryEl, config.summary(state.items, extras));
      const columns = [
        ...config.columns(extras),
        { label: "", className: "actions", render: (row) => html`${(config.rowActions || []).map((a) => html`<button class="btn sm ghost" data-act="${a.key}" data-id="${row.id}" title="${a.label}">${a.label}</button> `)}<button class="btn sm ghost" data-act="edit" data-id="${row.id}" aria-label="Editar">${icon("edit")}</button> <button class="btn sm danger" data-act="delete" data-id="${row.id}" aria-label="Excluir">${icon("trash")}</button>` }
      ];
      mount(listEl, table({ columns, rows, emptyText: state.items.length ? "Nenhum resultado para esse filtro." : config.emptyText }));
    }

    async function load() {
      state.items = (await api(config.endpoint)).items;
      draw();
    }

    function openForm(row) {
      const editing = !!row;
      formModal({
        title: editing ? config.editTitle || "Editar" : config.addLabel,
        wide: true,
        fields: config.fields(extras),
        initial: editing ? (config.toForm ? config.toForm(row) : camel(row)) : config.defaults || {},
        submitLabel: editing ? "Salvar alterações" : "Criar",
        onSubmit: async (values) => {
          const body = clean(values);
          await api(editing ? `${config.endpoint}/${row.id}` : config.endpoint, { method: editing ? "PATCH" : "POST", body });
          toast(editing ? "Alterações salvas." : "Criado com sucesso.", "ok");
          await load();
        }
      });
    }

    root.querySelector("#add").addEventListener("click", () => openForm(null));
    root.querySelector("#q").addEventListener("input", debounce((event) => { state.q = event.target.value; draw(); }, 150));
    root.querySelectorAll("[data-filter]").forEach((el) => el.addEventListener("change", () => { state.filters[el.dataset.filter] = el.value; draw(); }));

    listEl.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-act]");
      if (!button) return;
      const row = state.items.find((r) => r.id === button.dataset.id);
      if (!row) return;
      if (button.dataset.act === "edit") return openForm(row);
      if (button.dataset.act === "delete") {
        if (!(await confirmDialog({ title: config.deleteTitle || "Excluir registro?", message: config.deleteMessage ? config.deleteMessage(row) : "Esta ação não pode ser desfeita.", confirmLabel: "Excluir", danger: true }))) return;
        try { await api(`${config.endpoint}/${row.id}`, { method: "DELETE" }); toast("Registro excluído.", "ok"); await load(); } catch (error) { toast(error.message, "danger"); }
        return;
      }
      const custom = (config.rowActions || []).find((a) => a.key === button.dataset.act);
      if (custom) await custom.onClick(row, load);
    });

    await load();
  };
}
