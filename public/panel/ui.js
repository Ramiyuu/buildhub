// Biblioteca de UI do painel: templates com escape automatico, API com CSRF, modais, formularios e tabelas.

// ------------------------------------------------------------------ templates seguros
// html`...` escapa tudo que e interpolado, exceto o que vier de outro html`...` ou raw().
export const raw = (value) => ({ __raw: String(value ?? "") });
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => MAP[c]);
const part = (value) => (value && value.__raw !== undefined ? value.__raw : esc(value));
export function html(strings, ...values) {
  let out = "";
  strings.forEach((text, i) => {
    out += text;
    if (i < values.length) out += Array.isArray(values[i]) ? values[i].map(part).join("") : part(values[i]);
  });
  return raw(out);
}
export const mount = (element, template) => { element.innerHTML = template.__raw; };
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// ------------------------------------------------------------------ eventos internos (SSE -> telas)
export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, handler) => { const fn = (event) => handler(event.detail); bus.addEventListener(name, fn); return () => bus.removeEventListener(name, fn); };

// ------------------------------------------------------------------ API
let csrf = "";
export const setCsrf = (token) => { csrf = token; };

export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { location.href = `/login.html?next=${encodeURIComponent(location.pathname)}`; throw new Error("Sessão expirada."); }
  if (!response.ok) throw Object.assign(new Error(data.error || "Algo deu errado."), { status: response.status, code: data.code });
  return data;
}

// ------------------------------------------------------------------ formatadores
const brlFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (cents) => brlFormat.format((Number(cents) || 0) / 100);
export const brlShort = (cents) => {
  const value = (Number(cents) || 0) / 100;
  if (Math.abs(value) >= 1e6) return `R$ ${(value / 1e6).toFixed(1).replace(".", ",")} mi`;
  if (Math.abs(value) >= 1e4) return `R$ ${(value / 1e3).toFixed(1).replace(".", ",")} mil`;
  return brlFormat.format(value);
};
export const num = (value) => (Number(value) || 0).toLocaleString("pt-BR");
export const compact = (value) => (value >= 1e4 ? `${(value / 1e3).toFixed(1).replace(".", ",")} mil` : num(value));
export const pct = (value) => `${(Number(value) || 0).toFixed(1).replace(".", ",")}%`;
export const dateBR = (value) => {
  if (!value) return "—";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) { const [y, m, d] = text.split("-"); return `${d}/${m}/${y}`; }
  return new Date(text).toLocaleDateString("pt-BR");
};
export const dateTimeBR = (value) => (value ? new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
export function ago(value) {
  if (!value) return "";
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "agora";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} d`;
  return dateBR(new Date(value).toISOString().slice(0, 10));
}
export function since(value) {
  const text = ago(value);
  return text === "agora" ? "agora" : /^\d/.test(text) && !text.includes("/") ? `há ${text}` : text;
}
export const initials = (name = "?") => String(name).trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
export function delta(current, previous) {
  if (!previous) return { text: current ? "novo" : "—", tone: "flat" };
  const value = ((current - previous) / previous) * 100;
  return { text: `${value >= 0 ? "+" : ""}${value.toFixed(1).replace(".", ",")}%`, tone: value > 0.5 ? "up" : value < -0.5 ? "down" : "flat" };
}
export const deltaChip = (current, previous) => { const d = delta(current, previous); return html`<span class="delta ${d.tone}">${d.tone === "up" ? "▲" : d.tone === "down" ? "▼" : "•"} ${d.text}</span>`; };

// ------------------------------------------------------------------ icones (traco, 24x24)
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zM16 14h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  tasks: '<path d="m4 7 2 2 4-4M4 17l2 2 4-4M14 8h6M14 18h6"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a6 6 0 0 0-4-5.6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trending: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  back: '<path d="M19 12H5M12 5l-7 7 7 7"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
};
export const icon = (name) => raw(`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`);

// ------------------------------------------------------------------ componentes
export const badge = (text, tone = "") => html`<span class="badge ${tone}">${text}</span>`;
export const empty = (text, sub = "") => html`<div class="empty"><strong>${text}</strong>${sub ? html`<span>${sub}</span>` : ""}</div>`;
export const progress = (value) => html`<div class="progress" title="${value}%"><i style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%"></i></div>`;
export const debounce = (fn, wait = 250) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; };

export function table({ columns, rows, emptyText = "Nada por aqui ainda." }) {
  if (!rows.length) return html`<div class="table-wrap">${empty(emptyText)}</div>`;
  return html`<div class="table-wrap"><table class="table">
    <thead><tr>${columns.map((c) => html`<th class="${c.align === "right" ? "right" : ""}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((row) => html`<tr data-id="${row.id}">${columns.map((c) => html`<td class="${c.className || ""} ${c.align === "right" ? "right" : ""}">${c.render(row)}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

export function toast(message, tone = "", { title = "", link = "", ms = 4200 } = {}) {
  const host = $("#toasts");
  if (!host) return;
  const item = document.createElement("div");
  item.className = `toast-item ${tone} ${link ? "link" : ""}`;
  item.innerHTML = `<div>${title ? `<b>${esc(title)}</b>` : ""}<span>${esc(message)}</span></div>`;
  if (link) item.addEventListener("click", () => { location.hash = link; item.remove(); });
  host.append(item);
  setTimeout(() => item.remove(), ms);
}

// ------------------------------------------------------------------ modal
export function modal({ title, subtitle = "", body, actions = [], wide = false, onClose }) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `<div class="dialog ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2>${subtitle ? `<p class="dialog-sub">${esc(subtitle)}</p>` : ""}<div class="dialog-body"></div><div class="dialog-actions"></div></div>`;
  const bodyEl = overlay.querySelector(".dialog-body");
  if (body && body.__raw !== undefined) bodyEl.innerHTML = body.__raw; else if (body) bodyEl.append(body);
  const bar = overlay.querySelector(".dialog-actions");
  const close = (result) => { document.removeEventListener("keydown", onKey); overlay.remove(); onClose?.(result); };
  const onKey = (event) => { if (event.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn ${action.className || "ghost"}`;
    button.textContent = action.label;
    button.addEventListener("click", async () => { await action.onClick?.({ close, button, overlay }); if (action.close !== false) close(action.value); });
    bar.append(button);
  });
  document.body.append(overlay);
  (overlay.querySelector("input, select, textarea, .dialog-actions button:last-child"))?.focus();
  return { close, el: overlay };
}

export function confirmDialog({ title, message, confirmLabel = "Confirmar", danger = false }) {
  return new Promise((resolve) => {
    modal({
      title, subtitle: message,
      actions: [
        { label: "Cancelar", value: false },
        { label: confirmLabel, className: danger ? "solid-danger" : "primary", value: true }
      ],
      onClose: (value) => resolve(value === true)
    });
  });
}

export function showSecret({ title, subtitle, secret, note }) {
  modal({
    title, subtitle,
    body: html`<div class="secret"><span id="secretValue">${secret}</span></div>${note ? html`<p class="muted small mt">${note}</p>` : ""}`,
    actions: [
      { label: "Copiar", className: "ghost", close: false, onClick: async ({ button }) => { await navigator.clipboard?.writeText(secret).catch(() => {}); button.textContent = "Copiado!"; } },
      { label: "Fechar", className: "primary" }
    ]
  });
}

// ------------------------------------------------------------------ formulario em modal
const parseMoney = (text) => {
  const clean = String(text).replace(/[^\d,.-]/g, "");
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return Math.round((parseFloat(normalized) || 0) * 100);
};
const moneyText = (cents) => ((Number(cents) || 0) / 100).toFixed(2).replace(".", ",");

export function formModal({ title, subtitle = "", fields, initial = {}, submitLabel = "Salvar", onSubmit, wide = false }) {
  const form = document.createElement("form");
  form.noValidate = true;
  form.innerHTML = `<div class="form-error" hidden></div><div class="form-grid">${fields.map((f) => {
    const id = `f_${f.name}`;
    const value = initial[f.name];
    let control;
    if (f.type === "select") {
      control = `<select class="select" id="${id}" name="${f.name}">${f.options.map((o) => `<option value="${esc(o.value ?? "")}" ${String(value ?? f.default ?? "") === String(o.value ?? "") ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
    } else if (f.type === "textarea") {
      control = `<textarea class="textarea" id="${id}" name="${f.name}" placeholder="${esc(f.placeholder || "")}">${esc(value ?? "")}</textarea>`;
    } else if (f.type === "checkbox") {
      return `<div class="field ${f.full ? "full" : ""}"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${value ? "checked" : ""}> ${esc(f.label)}</label></div>`;
    } else {
      const shown = f.type === "money" ? (value === undefined || value === null ? "" : moneyText(value)) : f.type === "tags" ? (value || []).join(", ") : (value ?? f.default ?? "");
      const type = f.type === "money" || f.type === "tags" ? "text" : f.type || "text";
      control = `<input class="input" id="${id}" name="${f.name}" type="${type}" value="${esc(shown)}" placeholder="${esc(f.placeholder || (f.type === "money" ? "0,00" : ""))}" ${f.type === "money" ? 'inputmode="decimal"' : ""} ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : 'autocomplete="off"'}>`;
    }
    return `<div class="field ${f.full ? "full" : ""}"><label for="${id}">${esc(f.label)}${f.required ? " *" : ""}</label>${control}${f.help ? `<span class="help">${esc(f.help)}</span>` : ""}</div>`;
  }).join("")}</div>`;

  const errorBox = form.querySelector(".form-error");
  const collect = () => {
    const values = {};
    for (const f of fields) {
      const el = form.elements[f.name];
      if (f.type === "checkbox") values[f.name] = el.checked;
      else if (f.type === "money") values[f.name] = parseMoney(el.value);
      else if (f.type === "number") values[f.name] = el.value === "" ? undefined : Number(el.value);
      else if (f.type === "tags") values[f.name] = el.value.split(",").map((t) => t.trim()).filter(Boolean);
      else values[f.name] = el.value.trim();
    }
    return values;
  };

  const dialog = modal({
    title, subtitle, body: form, wide,
    actions: [
      { label: "Cancelar", className: "ghost" },
      {
        label: submitLabel, className: "primary", close: false,
        onClick: async ({ button, close }) => {
          errorBox.hidden = true;
          const missing = fields.find((f) => f.required && f.type !== "checkbox" && !String(form.elements[f.name].value).trim());
          if (missing) { errorBox.textContent = `Preencha: ${missing.label}.`; errorBox.hidden = false; form.elements[missing.name].focus(); return; }
          button.disabled = true;
          try { await onSubmit(collect()); close(); } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; button.disabled = false; }
        }
      }
    ]
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); dialog.el.querySelector(".dialog-actions .primary").click(); });
  return dialog;
}

// ------------------------------------------------------------------ tema
export function initThemeToggle(button) {
  button?.addEventListener("click", () => {
    const dark = !document.documentElement.classList.contains("dark-theme");
    document.documentElement.classList.toggle("dark-theme", dark);
    document.body.classList.toggle("dark-theme", dark);
    try { localStorage.setItem("buildhub_theme", dark ? "dark" : "light"); } catch { /* sem storage */ }
  });
}

export const STATUS = {
  project: { briefing: ["Briefing", "info"], design: ["Design", "brand"], desenvolvimento: ["Desenvolvimento", "brand"], testes: ["Testes", "warn"], entregue: ["Entregue", "ok"], pausado: ["Pausado", ""], cancelado: ["Cancelado", "danger"] },
  invoice: { pendente: ["Pendente", "warn"], paga: ["Paga", "ok"], cancelada: ["Cancelada", ""], atrasada: ["Atrasada", "danger"] },
  lead: { novo: ["Novo", "info"], contato: ["Em contato", "brand"], proposta: ["Proposta", "warn"], ganho: ["Ganho", "ok"], perdido: ["Perdido", ""] },
  company: { ativo: ["Ativo", "ok"], lead: ["Lead", "info"], inativo: ["Inativo", ""] }
};
export const statusBadge = (kind, key) => { const [label, tone] = STATUS[kind][key] || [key, ""]; return badge(label, tone); };
export const PROJECT_TYPES = { site: "Site", sistema: "Sistema", landing: "Landing page", loja: "Loja virtual", app: "Aplicativo", manutencao: "Manutenção" };
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

// ------------------------------------------------------------------ utilitarios extras
// So deixa passar http(s): evita href="javascript:..." vindo de dados cadastrados.
export const safeUrl = (value) => (/^https?:\/\//i.test(String(value || "")) ? String(value) : "");
export const camel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
export const optionsOf = (list, { blank = "", label = "name" } = {}) => [...(blank ? [{ value: "", label: blank }] : []), ...list.map((item) => ({ value: item.id, label: item[label] }))];
