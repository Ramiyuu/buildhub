import { api, html, mount, formModal, confirmDialog, toast, badge, icon, ago, initials, on, empty } from "/panel/ui.js";

const REGION = (c) => [c.region_code, c.country].filter(Boolean).join(" · ") || "—";
const clock = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function modeBadge(c) {
  if (c.status === "closed") return badge("Encerrada", "");
  if (c.handoff_requested) return badge("Pediu atendente", "danger");
  return c.mode === "human" ? badge(`Humano${c.admin_name ? ` · ${c.admin_name.split(" ")[0]}` : ""}`, "info") : badge("IA respondendo", "brand");
}

export default async function render(root, ctx) {
  ctx.setTitle("Chat ao vivo", "Atendimento automático com IA — assuma a conversa quando quiser");
  const state = { status: "open", items: [], activeId: ctx.params[0] || null, conv: null, messages: [], seen: new Set() };

  mount(root, html`<div class="inbox" id="inbox">
    <div class="inbox-list"><div class="seg" id="tabs"><button data-s="open" class="active">Abertas</button><button data-s="closed">Encerradas</button></div><div class="conv-items" id="convs"></div></div>
    <div class="inbox-chat" id="pane"></div>
  </div>`);
  const inbox = root.querySelector("#inbox"), convsEl = root.querySelector("#convs"), pane = root.querySelector("#pane");

  // ------------------------------------------------------------------ lista
  async function loadList() {
    state.items = (await api(`/admin/chat/conversations?status=${state.status}`)).items;
    drawList();
  }

  function drawList() {
    mount(convsEl, state.items.length ? html`${state.items.map((c) => html`<button class="conv ${c.id === state.activeId ? "active" : ""} ${c.handoff_requested && c.status === "open" ? "urgent" : ""}" data-id="${c.id}">
      <span class="avatar">${initials(c.visitor_name || "V")}</span>
      <span style="min-width:0"><span class="who"><span>${c.visitor_name || "Visitante"}</span></span><span class="prev" style="display:block">${c.last_message_preview || "—"}</span><span style="display:block;margin-top:4px">${modeBadge(c)}</span></span>
      <span class="meta"><span>${ago(c.last_message_at)}</span>${c.unread_admin ? html`<span class="unread">${c.unread_admin}</span>` : ""}</span></button>`)}` : empty(state.status === "open" ? "Nenhuma conversa aberta" : "Nenhuma conversa encerrada", "Quando alguém falar com o chat do site, aparece aqui."));
  }

  // ------------------------------------------------------------------ conversa
  async function openConversation(id) {
    state.activeId = id;
    history.replaceState(null, "", `#/chat/${id}`);
    inbox.classList.add("has-chat");
    mount(pane, html`<div class="empty">Carregando…</div>`);
    const data = await api(`/admin/chat/conversations/${id}`);
    state.conv = data.conversation;
    state.messages = data.messages;
    state.seen = new Set(data.messages.map((m) => m.id));
    const item = state.items.find((c) => c.id === id);
    if (item) item.unread_admin = 0;
    drawList();
    drawPane();
  }

  function bubbleHtml(m) {
    return html`<div class="bub ${m.sender}" data-id="${m.id}">${m.sender === "ai" ? html`<span class="from">IA</span>` : m.sender === "admin" ? html`<span class="from">${m.author || "Equipe"}</span>` : ""}${m.body}${m.sender !== "system" ? html`<small>${clock(m.createdAt)}</small>` : ""}</div>`;
  }

  function drawPane() {
    const c = state.conv;
    if (!c) { mount(pane, html`<div class="empty" style="margin:auto"><strong>Selecione uma conversa</strong><span>As mensagens aparecem em tempo real.</span></div>`); inbox.classList.remove("has-chat"); return; }
    const closed = c.status === "closed";
    mount(pane, html`<div class="chat-head">
        <button class="icon-btn" id="back" aria-label="Voltar para a lista" style="display:none">${icon("back")}</button>
        <span class="avatar">${initials(c.visitor_name || "V")}</span>
        <div class="who"><strong>${c.visitor_name || "Visitante"}</strong><span class="muted small">${[c.visitor_email, REGION(c)].filter(Boolean).join(" · ")}</span></div>
        ${modeBadge(c)}
        ${closed ? "" : html`${(c.mode === "ai" || c.handoff_requested) ? html`<button class="btn sm primary" id="takeover">Assumir conversa</button>` : html`<button class="btn sm ghost" id="release">${icon("bot")} Devolver à IA</button>`}
        <button class="btn sm ghost" id="lead">Criar lead</button><button class="btn sm danger" id="close">Encerrar</button>`}
        ${ctx.user.role === "admin" ? html`<button class="btn sm danger" id="delete" title="Excluir conversa" aria-label="Excluir conversa">${icon("trash")}</button>` : ""}
      </div>
      <div class="chat-body" id="body">${state.messages.map(bubbleHtml)}</div>
      ${closed ? html`<div class="composer"><div class="notice">Conversa encerrada. O histórico fica salvo.</div></div>` : html`<form class="composer" id="composer">
        ${c.handoff_requested ? html`<div class="notice warn">Aguardando um administrador assumir. A IA esta pausada e o historico fica disponivel para a equipe.</div>` : c.mode === "ai" ? html`<div class="notice">A IA está respondendo este visitante. Ao enviar uma mensagem, você assume a conversa e a IA para.</div>` : html`<div class="notice warn">Você está no controle — a IA está pausada nesta conversa.</div>`}
        <div class="row"><textarea class="textarea" id="text" rows="1" maxlength="2000" placeholder="Escreva a resposta... (Enter envia, Shift+Enter quebra linha)"></textarea><button class="btn primary" type="submit" aria-label="Enviar">${icon("send")}</button></div>
      </form>`}`);
    scrollDown();
    wirePane();
  }

  const scrollDown = () => { const b = pane.querySelector("#body"); if (b) b.scrollTop = b.scrollHeight; };

  function appendMessage(message) {
    if (state.seen.has(message.id)) return;
    state.seen.add(message.id);
    state.messages.push(message);
    const body = pane.querySelector("#body");
    if (body) { body.insertAdjacentHTML("beforeend", bubbleHtml(message).__raw); scrollDown(); }
  }

  function wirePane() {
    pane.querySelector("#back")?.addEventListener("click", () => { state.activeId = null; state.conv = null; history.replaceState(null, "", "#/chat"); drawList(); drawPane(); });
    const act = async (path, done) => { try { await api(`/admin/chat/conversations/${state.activeId}${path}`, { method: "POST", body: {} }); if (done) toast(done, "ok"); await Promise.all([loadList(), refreshConversation()]); } catch (error) { toast(error.message, "danger"); } };
    pane.querySelector("#takeover")?.addEventListener("click", () => act("/takeover", "Você assumiu a conversa. A IA parou."));
    pane.querySelector("#release")?.addEventListener("click", () => act("/release", "A IA voltou a responder."));
    pane.querySelector("#close")?.addEventListener("click", async () => { if (await confirmDialog({ title: "Encerrar conversa?", message: "O visitante será avisado e o histórico fica salvo.", confirmLabel: "Encerrar" })) act("/close", "Conversa encerrada."); });
    pane.querySelector("#delete")?.addEventListener("click", async () => {
      if (!(await confirmDialog({ title: "Excluir conversa?", message: "Apaga a conversa e todas as mensagens definitivamente.", confirmLabel: "Excluir", danger: true }))) return;
      try { await api(`/admin/chat/conversations/${state.activeId}`, { method: "DELETE" }); state.activeId = null; state.conv = null; history.replaceState(null, "", "#/chat"); await loadList(); drawPane(); toast("Conversa excluída.", "ok"); } catch (error) { toast(error.message, "danger"); }
    });
    pane.querySelector("#lead")?.addEventListener("click", () => formModal({
      title: "Criar lead desta conversa", wide: true, submitLabel: "Criar lead",
      initial: { name: state.conv.visitor_name || "", email: state.conv.visitor_email || "" },
      fields: [{ name: "name", label: "Nome", required: true }, { name: "email", label: "Email", type: "email" }, { name: "phone", label: "Telefone" }, { name: "notes", label: "Observações", type: "textarea", full: true }],
      onSubmit: async (v) => { await api(`/admin/chat/conversations/${state.activeId}/lead`, { method: "POST", body: v }); toast("Lead criado. Veja em Leads e funil.", "ok"); }
    }));

    const form = pane.querySelector("#composer");
    if (!form) return;
    const text = form.querySelector("#text");
    const send = async () => {
      const body = text.value.trim();
      if (!body) return;
      text.value = "";
      try {
        const { message } = await api(`/admin/chat/conversations/${state.activeId}/messages`, { method: "POST", body: { body } });
        appendMessage(message);
        await Promise.all([loadList(), refreshConversation(false)]);
      } catch (error) { text.value = body; toast(error.message, "danger"); }
    };
    form.addEventListener("submit", (event) => { event.preventDefault(); send(); });
    text.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } });
    text.addEventListener("input", () => { text.style.height = "auto"; text.style.height = `${Math.min(text.scrollHeight, 120)}px`; });
    if (window.matchMedia("(min-width: 900px)").matches) text.focus();
  }

  // atualiza so o cabecalho/modo sem perder o scroll das mensagens
  async function refreshConversation(redraw = true) {
    if (!state.activeId) return;
    const data = await api(`/admin/chat/conversations/${state.activeId}`);
    const modeChanged = !state.conv || state.conv.mode !== data.conversation.mode || state.conv.status !== data.conversation.status || state.conv.handoff_requested !== data.conversation.handoff_requested || state.conv.admin_name !== data.conversation.admin_name;
    state.conv = data.conversation;
    data.messages.forEach(appendMessage);
    if (modeChanged && redraw) drawPane();
  }

  // ------------------------------------------------------------------ eventos
  root.querySelector("#tabs").addEventListener("click", async (event) => {
    const b = event.target.closest("[data-s]");
    if (!b) return;
    state.status = b.dataset.s;
    root.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    await loadList();
  });
  convsEl.addEventListener("click", (event) => { const b = event.target.closest("[data-id]"); if (b) openConversation(b.dataset.id).catch((e) => toast(e.message, "danger")); });

  const offs = [
    on("chat:message", async ({ conversationId, message }) => {
      if (state.status === "open") await loadList();
      if (conversationId === state.activeId) {
        appendMessage(message);
        if (message.sender === "visitor") api(`/admin/chat/conversations/${conversationId}`).catch(() => {}); // marca como lida
        const item = state.items.find((c) => c.id === conversationId);
        if (item) { item.unread_admin = 0; drawList(); }
      }
    }),
    on("chat:mode", async ({ conversationId }) => { await loadList(); if (conversationId === state.activeId) await refreshConversation(); }),
    on("chat:closed", async ({ conversationId }) => { await loadList(); if (conversationId === state.activeId) await refreshConversation(); }),
    on("chat:read", () => loadList())
  ];

  await loadList();
  if (state.activeId) await openConversation(state.activeId).catch(() => { state.activeId = null; drawPane(); });
  else drawPane();
  const mq = window.matchMedia("(max-width: 899px)");
  const syncBack = () => { const b = pane.querySelector("#back"); if (b) b.style.display = mq.matches ? "grid" : "none"; };
  const observer = new MutationObserver(syncBack);
  observer.observe(pane, { childList: true });
  syncBack();

  return { destroy() { offs.forEach((off) => off()); observer.disconnect(); } };
}
