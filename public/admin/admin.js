// Shell do painel: autenticacao, menu, roteador por hash, notificacoes e tempo real (SSE).
import { api, setCsrf, $, $$, html, mount, icon, esc, toast, emit, on, ago, initials, initThemeToggle, modal, formModal } from "/panel/ui.js";

const ROUTES = {
  dashboard: { view: "dashboard", title: "Visão geral", icon: "grid", group: "Geral" },
  chat: { view: "chat", title: "Chat ao vivo", icon: "chat", group: "Geral" },
  clientes: { view: "clients", title: "Clientes", icon: "building", group: "Comercial" },
  leads: { view: "leads", title: "Leads e funil", icon: "target", group: "Comercial" },
  projetos: { view: "projects", title: "Projetos", icon: "folder", group: "Operação" },
  tarefas: { view: "tasks", title: "Tarefas", icon: "tasks", group: "Operação" },
  sites: { view: "sites", title: "Sites entregues", icon: "globe", group: "Operação" },
  cobrancas: { view: "invoices", title: "Cobranças", icon: "receipt", group: "Financeiro" },
  financeiro: { view: "finance", title: "Financeiro", icon: "wallet", group: "Financeiro" },
  usuarios: { view: "users", title: "Usuários", icon: "users", group: "Administração", admin: true },
  seguranca: { view: "security", title: "Segurança", icon: "shield", group: "Administração", admin: true },
  configuracoes: { view: "settings", title: "Atendimento e IA", icon: "settings", group: "Administração", admin: true }
};

const ROLE_LABEL = { admin: "Administrador", staff: "Equipe" };
const state = { user: null, current: null, notifications: [], unread: 0, chatUnread: 0, sound: localStorage.getItem("bh_sound") === "1", source: null };

// ------------------------------------------------------------------ inicializacao
async function start() {
  const me = await api("/auth/me");
  if (me.user.role === "client") { location.replace("/cliente/"); return; }
  setCsrf(me.csrf);
  state.user = me.user;

  $("#userName").textContent = me.user.name;
  $("#userRole").textContent = ROLE_LABEL[me.user.role] || me.user.role;
  $("#userAvatar").textContent = initials(me.user.name);
  initThemeToggle($("#themeBtn"));
  buildNav();
  bindChrome();

  if (me.user.mustChangePassword) { await forcePasswordChange(); return; }

  await loadNotifications();
  connect();
  refreshChatCount();
  window.addEventListener("hashchange", route);
  route();
}

function buildNav() {
  const groups = {};
  for (const [key, def] of Object.entries(ROUTES)) {
    if (def.admin && state.user.role !== "admin") continue;
    (groups[def.group] ||= []).push([key, def]);
  }
  mount($("#nav"), html`${Object.entries(groups).map(([group, items]) => html`<div class="nav-label">${group}</div>${items.map(([key, def]) => html`<a href="#/${key}" data-route="${key}">${icon(def.icon)}<span>${def.title}</span>${key === "chat" ? html`<span class="count" id="chatCount" hidden>0</span>` : ""}</a>`)}`)}`);
}

function bindChrome() {
  const sidebar = $("#sidebar"), scrim = $("#scrim");
  const toggle = (open) => { sidebar.classList.toggle("open", open); scrim.classList.toggle("open", open); };
  $("#menuBtn").addEventListener("click", () => toggle(!sidebar.classList.contains("open")));
  scrim.addEventListener("click", () => toggle(false));
  $("#nav").addEventListener("click", (event) => { if (event.target.closest("a")) toggle(false); });

  $("#logoutBtn").addEventListener("click", async () => {
    try { await api("/auth/logout", { method: "POST", body: {} }); } catch { /* segue para o login */ }
    location.href = "/login.html";
  });

  $("#bellBtn").addEventListener("click", (event) => { event.stopPropagation(); togglePanel(); });
  document.addEventListener("click", (event) => { if (!event.target.closest("#notif")) togglePanel(false); });
  $("#readAll").addEventListener("click", async () => { await api("/admin/notifications/read-all", { method: "POST", body: {} }); state.notifications.forEach((n) => { n.read_at ||= new Date().toISOString(); }); state.unread = 0; renderNotifications(); });
  $("#soundBtn").addEventListener("click", () => { state.sound = !state.sound; localStorage.setItem("bh_sound", state.sound ? "1" : "0"); renderSound(); if (state.sound) beep(); });
  renderSound();
}

function togglePanel(open) {
  const panel = $("#notifPanel");
  const next = open ?? !panel.classList.contains("open");
  panel.classList.toggle("open", next);
  $("#bellBtn").setAttribute("aria-expanded", String(next));
}

// ------------------------------------------------------------------ roteador
async function route() {
  const [, key = "dashboard", ...rest] = location.hash.split("/");
  const def = ROUTES[key] || ROUTES.dashboard;
  const name = ROUTES[key] ? key : "dashboard";
  if (def.admin && state.user.role !== "admin") { location.hash = "#/dashboard"; return; }

  $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
  setTitle(def.title, "");
  document.title = `${state.unread ? `(${state.unread}) ` : ""}${def.title} | BuildHub`;

  state.current?.destroy?.();
  state.current = null;
  const root = $("#view");
  mount(root, html`<div class="card"><div class="empty">Carregando…</div></div>`);
  try {
    const module = await import(`/admin/views/${def.view}.js`);
    if ((location.hash.split("/")[1] || "dashboard") !== key) return; // navegou durante o carregamento
    root.replaceChildren();
    state.current = (await module.default(root, { user: state.user, params: rest, setTitle, navigate: (hash) => { location.hash = hash; } })) || null;
    root.focus({ preventScroll: true });
  } catch (error) {
    console.error(error);
    mount(root, html`<div class="card"><div class="empty"><strong>Não foi possível carregar esta tela.</strong><span>${error.message}</span><div><button class="btn primary" id="retry">Tentar de novo</button></div></div></div>`);
    $("#retry").addEventListener("click", route);
  }
}

function setTitle(title, subtitle = "") {
  $("#pageTitle").textContent = title;
  $("#pageSub").textContent = subtitle;
}

// ------------------------------------------------------------------ notificacoes
const NOTIF_ICON = { handoff: "user", chat_new: "chat", chat_message: "chat", ai_error: "bot", invoice_overdue: "receipt", security: "shield", user_new: "users" };

async function loadNotifications() {
  const data = await api("/admin/notifications");
  state.notifications = data.items;
  state.unread = data.unread;
  renderNotifications();
}

function renderNotifications() {
  const dot = $("#bellDot");
  dot.hidden = !state.unread;
  dot.textContent = state.unread > 99 ? "99+" : state.unread;
  document.title = document.title.replace(/^\(\d+\)\s/, "");
  if (state.unread) document.title = `(${state.unread}) ${document.title}`;
  mount($("#notifList"), state.notifications.length
    ? html`${state.notifications.map((n) => html`<button class="notif-item t-${n.type} ${n.read_at ? "" : "unread"}" data-id="${n.id}" data-link="${n.link || ""}"><span class="ni-ico">${icon(NOTIF_ICON[n.type] || "bell")}</span><span><b>${n.title}</b><span>${n.body || ""}</span><small>${ago(n.created_at)}</small></span></button>`)}`
    : html`<div class="empty">Sem notificações.</div>`);
}

$("#notifList")?.addEventListener("click", async (event) => {
  const item = event.target.closest(".notif-item");
  if (!item) return;
  const n = state.notifications.find((x) => String(x.id) === item.dataset.id);
  if (n && !n.read_at) { n.read_at = new Date().toISOString(); state.unread = Math.max(0, state.unread - 1); api(`/admin/notifications/${n.id}/read`, { method: "POST", body: {} }).catch(() => {}); renderNotifications(); }
  togglePanel(false);
  if (item.dataset.link) location.hash = item.dataset.link;
});

function renderSound() { $("#soundBtn").textContent = `Som: ${state.sound ? "on" : "off"}`; }

let audio;
function beep() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = "sine"; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
    osc.connect(gain).connect(audio.destination);
    osc.start(); osc.stop(audio.currentTime + 0.4);
  } catch { /* navegador sem audio */ }
}

// ------------------------------------------------------------------ tempo real
function connect() {
  const source = new EventSource("/api/admin/stream");
  state.source = source;
  source.addEventListener("ready", (event) => { const { online } = JSON.parse(event.data); $("#onlineInfo").textContent = `${online} admin online`; });
  source.addEventListener("notification", (event) => {
    const n = JSON.parse(event.data);
    state.notifications.unshift(n);
    state.notifications = state.notifications.slice(0, 40);
    state.unread += 1;
    renderNotifications();
    const urgent = ["handoff", "ai_error", "security"].includes(n.type);
    toast(n.body || "", urgent ? "danger" : "", { title: n.title, link: n.link || "", ms: urgent ? 9000 : 5500 });
    if (state.sound && ["handoff", "chat_new", "chat_message"].includes(n.type)) beep();
    emit("notification", n);
  });
  for (const name of ["chat:message", "chat:mode", "chat:closed", "chat:read"]) {
    source.addEventListener(name, (event) => { emit(name, JSON.parse(event.data)); refreshChatCount(); });
  }
  source.onerror = () => { /* o navegador reconecta sozinho */ };
}

let chatTimer;
function refreshChatCount() {
  clearTimeout(chatTimer);
  chatTimer = setTimeout(async () => {
    try {
      const { items } = await api("/admin/chat/conversations");
      state.chatUnread = items.reduce((sum, c) => sum + (c.unread_admin || 0), 0);
      const badge = $("#chatCount");
      if (badge) { badge.hidden = !state.chatUnread; badge.textContent = state.chatUnread; }
    } catch { /* ignora */ }
  }, 300);
}

// ------------------------------------------------------------------ troca obrigatoria de senha (primeiro acesso / senha redefinida)
function forcePasswordChange() {
  return new Promise(() => {
    const dialog = formModal({
      title: "Defina uma nova senha",
      subtitle: "Por segurança, troque a senha temporária antes de continuar.",
      submitLabel: "Salvar e entrar",
      fields: [
        { name: "current", label: "Senha atual (temporária)", type: "password", required: true, full: true, autocomplete: "current-password" },
        { name: "next", label: "Nova senha", type: "password", required: true, full: true, autocomplete: "new-password", help: "Mínimo de 8 caracteres, com letras e números." }
      ],
      onSubmit: async (values) => { await api("/auth/change-password", { method: "POST", body: values }); location.reload(); }
    });
    dialog.el.querySelector(".dialog-actions .ghost").remove();
  });
}

start().catch((error) => { console.error(error); if (error.status !== 401) mount($("#view"), html`<div class="card"><div class="empty"><strong>Não foi possível iniciar o painel.</strong><span>${error.message}</span></div></div>`); });
