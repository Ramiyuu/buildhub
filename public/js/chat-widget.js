// Chat ao vivo do site: comeca com a IA; o administrador pode assumir e a IA para.
// Tudo que vem do servidor entra na tela via textContent (nada de HTML de terceiros).
(() => {
  if (document.querySelector(".bh-chat")) return;

  const ICON = {
    chat: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01"/>',
    end: '<path d="M18 6 6 18M6 6l12 12"/>'
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
  const SUGGESTIONS = ["Quero um orçamento", "Como funciona o processo?", "Falar com atendente"];

  const root = document.createElement("div");
  root.className = "bh-chat";
  root.innerHTML = `
    <button class="bh-chat__launcher" type="button" aria-label="Abrir atendimento" aria-expanded="false" aria-controls="bhChatPanel">
      <span class="bh-chat__ico bh-chat__ico--open">${svg("chat")}</span>
      <span class="bh-chat__ico bh-chat__ico--close">${svg("close")}</span>
      <span class="bh-chat__badge" hidden>0</span>
    </button>
    <section class="bh-chat__panel" id="bhChatPanel" role="dialog" aria-label="Atendimento BuildHub" hidden>
      <header class="bh-chat__head">
        <span class="bh-chat__avatar">${svg("bot")}</span>
        <div class="bh-chat__who">
          <strong>Atendimento BuildHub</strong>
          <small><i class="bh-chat__dot"></i><span data-status>Assistente virtual</span></small>
        </div>
        <button class="bh-chat__iconbtn" type="button" data-action="human" title="Falar com um atendente" aria-label="Falar com um atendente">${svg("user")}</button>
        <button class="bh-chat__iconbtn" type="button" data-action="end" title="Encerrar conversa" aria-label="Encerrar conversa">${svg("end")}</button>
      </header>
      <div class="bh-chat__messages" role="log" aria-live="polite"></div>
      <div class="bh-chat__chips"></div>
      <form class="bh-chat__form">
        <textarea rows="1" maxlength="1000" placeholder="Escreva sua mensagem..." aria-label="Mensagem"></textarea>
        <button type="submit" aria-label="Enviar">${svg("send")}</button>
      </form>
      <p class="bh-chat__note">Atendimento automático com IA. Não envie senhas nem dados de cartão.</p>
    </section>`;
  document.body.append(root);

  const $ = (selector) => root.querySelector(selector);
  const launcher = $(".bh-chat__launcher");
  const panel = $(".bh-chat__panel");
  const list = $(".bh-chat__messages");
  const form = $(".bh-chat__form");
  const input = form.querySelector("textarea");
  const badge = $(".bh-chat__badge");
  const status = $("[data-status]");
  const chips = $(".bh-chat__chips");

  const state = { conversationId: null, mode: "ai", admin: null, greeting: "", seen: new Set(), unread: 0, source: null, typing: null };

  // ------------------------------------------------------------------ mensagens
  function scrollDown() { list.scrollTop = list.scrollHeight; }

  function bubble(message) {
    const node = document.createElement("div");
    node.className = `bh-chat__msg bh-chat__msg--${message.sender}`;
    if (message.id) node.dataset.id = message.id;
    if (message.sender === "admin" && message.author) {
      const who = document.createElement("span");
      who.className = "bh-chat__author";
      who.textContent = message.author;
      node.append(who);
    }
    const text = document.createElement("p");
    text.textContent = message.body;
    node.append(text);
    return node;
  }

  function addMessage(message) {
    if (message.id && state.seen.has(message.id)) return null;
    if (message.id) state.seen.add(message.id);
    hideTyping();
    const node = bubble(message);
    list.append(node);
    chips.hidden = true;
    scrollDown();
    return node;
  }

  function showTyping() {
    if (state.typing) return;
    state.typing = document.createElement("div");
    state.typing.className = "bh-chat__msg bh-chat__msg--ai bh-chat__typing";
    state.typing.setAttribute("aria-label", "Digitando");
    state.typing.innerHTML = "<span></span><span></span><span></span>";
    list.append(state.typing);
    scrollDown();
  }

  function hideTyping() {
    state.typing?.remove();
    state.typing = null;
  }

  function setStatus() {
    status.textContent = state.mode === "human" ? `${state.admin || "Atendente"} · equipe BuildHub` : "Assistente virtual";
    root.classList.toggle("is-human", state.mode === "human");
  }

  function renderGreeting() {
    list.replaceChildren();
    state.seen.clear();
    if (state.greeting) list.append(bubble({ sender: "ai", body: state.greeting }));
    chips.hidden = false;
  }

  // ------------------------------------------------------------------ rede
  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || "Não foi possível enviar agora."), { status: response.status });
    return data;
  }

  async function sync() {
    const data = await request("/api/chat/history");
    state.greeting = data.greeting || state.greeting;
    state.conversationId = data.conversationId;
    state.mode = data.mode || "ai";
    if (!data.conversationId) { renderGreeting(); setStatus(); return; }
    if (!list.querySelector("[data-id]")) list.replaceChildren();
    data.messages.forEach(addMessage);
    const lastAdmin = [...data.messages].reverse().find((m) => m.sender === "admin");
    state.admin = lastAdmin?.author || state.admin;
    setStatus();
  }

  function connect() {
    if (state.source || !state.conversationId) return;
    const source = new EventSource("/api/chat/stream");
    state.source = source;
    source.addEventListener("ready", () => sync().catch(() => {}));
    source.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      addMessage(message);
      if (message.sender !== "visitor" && panel.hidden) { state.unread += 1; badge.textContent = String(state.unread); badge.hidden = false; }
    });
    source.addEventListener("typing", (event) => (JSON.parse(event.data).on ? showTyping() : hideTyping()));
    source.addEventListener("mode", (event) => {
      const data = JSON.parse(event.data);
      state.mode = data.mode;
      state.admin = data.admin || null;
      setStatus();
    });
    source.addEventListener("closed", () => reset());
    source.onerror = () => { if (source.readyState === EventSource.CLOSED) { state.source = null; } };
  }

  function reset() {
    state.source?.close();
    state.source = null;
    state.conversationId = null;
    state.mode = "ai";
    state.admin = null;
    hideTyping();
    renderGreeting();
    setStatus();
  }

  async function send(text) {
    const body = text.trim();
    if (!body) return;
    const node = addMessage({ sender: "visitor", body });
    input.value = "";
    autosize();
    try {
      const data = await request("/api/chat/message", { method: "POST", body: JSON.stringify({ body }) });
      state.conversationId = data.conversationId;
      state.mode = data.mode;
      state.seen.add(data.message.id);
      if (node) node.dataset.id = data.message.id;
      connect();
    } catch (error) {
      node?.classList.add("is-failed");
      addMessage({ sender: "system", body: error.message });
    }
  }

  // ------------------------------------------------------------------ interface
  function autosize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
  }

  function open() {
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    root.classList.add("is-open");
    state.unread = 0;
    badge.hidden = true;
    sessionStorage.setItem("bh_chat_open", "1");
    scrollDown();
    setTimeout(() => input.focus(), 50);
  }

  function close() {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    root.classList.remove("is-open");
    sessionStorage.removeItem("bh_chat_open");
  }

  launcher.addEventListener("click", () => (panel.hidden ? open() : close()));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.hidden) { close(); launcher.focus(); } });
  form.addEventListener("submit", (event) => { event.preventDefault(); send(input.value); });
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(input.value); } });

  for (const label of SUGGESTIONS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = label;
    chip.addEventListener("click", () => send(label));
    chips.append(chip);
  }

  root.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "human") {
      if (!state.conversationId) return send("Quero falar com um atendente");
      try { await request("/api/chat/handoff", { method: "POST", body: "{}" }); } catch (error) { addMessage({ sender: "system", body: error.message }); }
    }
    if (action === "end" && state.conversationId && confirm("Encerrar esta conversa?")) {
      await request("/api/chat/close", { method: "POST", body: "{}" }).catch(() => {});
      reset();
    }
  });

  sync().then(() => { connect(); if (sessionStorage.getItem("bh_chat_open")) open(); }).catch(() => renderGreeting());
})();
