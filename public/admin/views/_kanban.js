// Quadro kanban generico (Leads e Tarefas): arrastar e soltar, ou botoes de mover para telas de toque.
import { api, html, mount, formModal, confirmDialog, toast, icon, camel } from "/panel/ui.js";
import { clean } from "./_crud.js";

export function kanbanView(config) {
  return async function render(root, ctx) {
    ctx.setTitle(config.title, config.subtitle || "");
    const extras = config.loadExtras ? await config.loadExtras() : {};
    let items = [];

    mount(root, html`<div class="stack"><div id="summary"></div><div class="toolbar"><span class="spacer"></span><button class="btn primary" id="add" type="button">${icon("plus")} ${config.addLabel}</button></div><div class="board" id="board"></div></div>`);
    const board = root.querySelector("#board");
    const summary = root.querySelector("#summary");
    const keys = config.statuses.map((s) => s.key);

    function draw() {
      if (config.summary) mount(summary, config.summary(items));
      mount(board, html`${config.statuses.map((status) => {
        const cards = items.filter((i) => i.status === status.key);
        return html`<div class="col" data-col="${status.key}"><h3><span>${status.label}</span><span class="badge">${cards.length}</span></h3>
          ${cards.length ? cards.map((item) => html`<article class="kcard" draggable="true" data-id="${item.id}">${config.card(item)}
            <div class="row"><button class="btn sm ghost" data-move="-1" data-id="${item.id}" aria-label="Mover para a coluna anterior" ${keys.indexOf(item.status) === 0 ? "disabled" : ""}>‹</button><button class="btn sm ghost" data-move="1" data-id="${item.id}" aria-label="Mover para a próxima coluna" ${keys.indexOf(item.status) === keys.length - 1 ? "disabled" : ""}>›</button><span class="spacer"></span><button class="btn sm ghost" data-edit="${item.id}" aria-label="Editar">${icon("edit")}</button><button class="btn sm danger" data-del="${item.id}" aria-label="Excluir">${icon("trash")}</button></div></article>`) : html`<p class="muted small">Nada aqui.</p>`}</div>`;
      })}`);
    }

    async function load() { items = (await api(config.endpoint)).items; draw(); }
    async function move(id, status) {
      const item = items.find((i) => i.id === id);
      if (!item || item.status === status) return;
      item.status = status; draw();
      try { await api(`${config.endpoint}/${id}`, { method: "PATCH", body: { status } }); } catch (error) { toast(error.message, "danger"); }
      await load();
    }

    function openForm(item) {
      formModal({
        title: item ? "Editar" : config.addLabel, wide: true, fields: config.fields(extras),
        initial: item ? (config.toForm ? config.toForm(item) : camel(item)) : config.defaults || {}, submitLabel: item ? "Salvar alterações" : "Criar",
        onSubmit: async (values) => { await api(item ? `${config.endpoint}/${item.id}` : config.endpoint, { method: item ? "PATCH" : "POST", body: clean(values) }); toast("Salvo.", "ok"); await load(); }
      });
    }

    root.querySelector("#add").addEventListener("click", () => openForm(null));
    board.addEventListener("click", async (event) => {
      const mv = event.target.closest("[data-move]");
      if (mv) { const item = items.find((i) => i.id === mv.dataset.id); return move(item.id, keys[keys.indexOf(item.status) + Number(mv.dataset.move)]); }
      const ed = event.target.closest("[data-edit]");
      if (ed) return openForm(items.find((i) => i.id === ed.dataset.edit));
      const del = event.target.closest("[data-del]");
      if (del && (await confirmDialog({ title: "Excluir?", message: "Esta ação não pode ser desfeita.", confirmLabel: "Excluir", danger: true }))) {
        try { await api(`${config.endpoint}/${del.dataset.del}`, { method: "DELETE" }); await load(); } catch (error) { toast(error.message, "danger"); }
      }
    });

    let dragging = null;
    board.addEventListener("dragstart", (event) => { const card = event.target.closest(".kcard"); if (card) { dragging = card.dataset.id; event.dataTransfer.effectAllowed = "move"; } });
    board.addEventListener("dragover", (event) => { if (event.target.closest(".col")) event.preventDefault(); });
    board.addEventListener("drop", (event) => { const col = event.target.closest(".col"); if (col && dragging) { event.preventDefault(); move(dragging, col.dataset.col); dragging = null; } });

    await load();
  };
}
