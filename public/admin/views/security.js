import { api, html, mount, table, toast, confirmDialog, badge, icon, num, dateTimeBR, since, esc } from "/panel/ui.js";
import { lineChart, hbars, COLORS } from "/panel/charts.js";

const EVENT = {
  geo_block: ["País bloqueado", "danger"], rate_limit: ["Limite de requisições", "warn"], login_failed: ["Login falhou", "warn"], login_locked: ["Conta travada", "danger"],
  ip_ban: ["IP banido", "danger"], csrf_block: ["Origem/CSRF bloqueado", "danger"], admin_login: ["Login do admin", "info"]
};
const COUNTRY = { US: "Estados Unidos", CN: "China", RU: "Rússia", DE: "Alemanha", IN: "Índia", NL: "Países Baixos", VN: "Vietnã", FR: "França", SG: "Singapura", BR: "Brasil", "??": "Não identificado" };

function browser(ua = "") {
  const b = /edg\//i.test(ua) ? "Edge" : /firefox/i.test(ua) ? "Firefox" : /chrome/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "Navegador";
  const os = /windows/i.test(ua) ? "Windows" : /android/i.test(ua) ? "Android" : /iphone|ipad/i.test(ua) ? "iOS" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "";
  return `${b}${os ? ` · ${os}` : ""}`;
}

export default async function render(root, ctx) {
  ctx.setTitle("Segurança", "Proteções ativas, bloqueios e acessos ao painel");
  const state = { days: 7, tab: "visao" };

  mount(root, html`<div class="stack"><div class="toolbar"><div class="seg" id="tabs"><button data-t="visao" class="active">Visão geral</button><button data-t="audit">Auditoria</button></div><span class="spacer"></span><div class="seg" id="days"><button data-d="7" class="active">7 dias</button><button data-d="14">14 dias</button><button data-d="30">30 dias</button></div></div><div id="content"></div></div>`);
  const content = root.querySelector("#content");

  async function drawOverview() {
    const s = await api(`/admin/security?days=${state.days}`);
    const total = (type) => s.byType.find((t) => t.type === type)?.total || 0;
    const p = s.protections;
    const notes = [];
    if (!p.production) notes.push("O servidor está em modo de desenvolvimento (NODE_ENV não é production): cookies sem Secure e sem HSTS.");
    if (p.openai === "ausente") notes.push("OPENAI_API_KEY não configurada: o chat não consegue responder com IA (cai para atendimento humano).");
    if (p.openai === "mock") notes.push("IA em modo de teste (AI_MOCK): as respostas são simuladas, não vêm da OpenAI.");
    if (!p.cloudflare) notes.push("Cloudflare não configurado na frente do site: proteção contra ataques volumétricos (DDoS de rede) depende só da infraestrutura da Railway.");

    mount(content, html`<div class="stack">
      <div class="grid grid-4">
        <div class="card kpi"><span class="ico">${icon("globe")}</span><span class="label">Acessos bloqueados por país (${state.days}d)</span><span class="value">${num(total("geo_block"))}</span><span class="foot">${num(s.geoBlocked24h)} nas últimas 24 h</span></div>
        <div class="card kpi"><span class="ico">${icon("alert")}</span><span class="label">Limites de requisição atingidos</span><span class="value">${num(total("rate_limit"))}</span><span class="foot">proteção contra excesso/robôs</span></div>
        <div class="card kpi"><span class="ico">${icon("lock")}</span><span class="label">Logins falhos / contas travadas</span><span class="value">${num(total("login_failed") + total("login_locked"))}</span><span class="foot">${num(total("csrf_block"))} tentativas de origem inválida</span></div>
        <div class="card kpi"><span class="ico">${icon("shield")}</span><span class="label">IPs banidos agora</span><span class="value">${p.bannedIps}</span><span class="foot">${num(total("ip_ban"))} banimentos no período</span></div>
      </div>

      ${notes.length ? html`<div class="card"><div class="card-head"><div><h2>Pontos de atenção</h2></div></div><ul class="protection-list warn">${notes.map((n) => html`<li>${icon("alert")}<span>${n}</span></li>`)}</ul></div>` : ""}

      <div class="grid grid-main">
        <div class="card"><div class="card-head"><div><h2>Bloqueios por dia</h2><p>O que a aplicação barrou antes de chegar ao sistema</p></div></div><div id="chart"></div><div class="legend"><span><i style="background:${COLORS.danger}"></i>País não permitido</span><span><i style="background:${COLORS.warn}"></i>Limite de requisições</span><span><i style="background:${COLORS.info}"></i>Logins falhos</span></div></div>
        <div class="card"><div class="card-head"><div><h2>Países bloqueados</h2><p>Origem das tentativas fora do Brasil</p></div></div>${s.blockedCountries.length ? hbars(s.blockedCountries.map((c) => ({ label: `${COUNTRY[c.country] || c.country} (${c.country})`, value: c.total })), { color: COLORS.danger }) : html`<div class="empty">Nenhum bloqueio no período.</div>`}</div>
      </div>

      <div class="grid grid-2">
        <div class="card"><div class="card-head"><div><h2>Proteções ativas</h2><p>Camadas de defesa desta aplicação</p></div></div><ul class="protection-list">
          <li>${icon("check")}<span><b>Bloqueio por país:</b> só ${p.allowCountries.join(", ")} acessa. IP sem país identificado: ${p.geoUnknown === "block" ? "bloqueado" : "liberado"}.</span></li>
          <li>${icon("check")}<span><b>Limite de requisições</b> por IP (geral, login, cadastro, chat e rastreio) com resposta 429.</span></li>
          <li>${icon("check")}<span><b>Banimento automático</b> de 30 min após 10 infrações em 10 min.</span></li>
          <li>${icon("check")}<span><b>Senhas com scrypt</b>, bloqueio da conta por 15 min após 5 erros e tempo de resposta uniforme.</span></li>
          <li>${icon("check")}<span><b>Sessão</b> em cookie httpOnly + SameSite estrito, token CSRF e checagem de origem em toda alteração.</span></li>
          <li>${icon("check")}<span><b>Cabeçalhos</b> CSP restritiva, HSTS, nosniff, sem iframes (clickjacking) e referrer controlado.</span></li>
          <li>${icon("check")}<span><b>Entradas validadas</b> no servidor, SQL parametrizado, corpo limitado a 20 KB e limite de conexões em tempo real por IP.</span></li>
          <li>${icon("check")}<span><b>Privacidade:</b> IPs só aparecem mascarados e visitas usam hash diário (sem guardar IP).</span></li>
          <li>${icon("check")}<span><b>Auditoria</b> de ações administrativas e alerta de login/bloqueios no sino.</span></li>
        </ul>
        <p class="muted small mt">Seu acesso atual: ${s.you.country || "—"} · IP ${esc(s.you.ip)}. ${p.adminsOnline} admin(s) conectado(s) em tempo real.</p></div>
        <div class="card"><div class="card-head"><div><h2>Sessões ativas</h2><p>Quem está logado agora</p></div></div><div id="sessions"></div></div>
      </div>

      <div><div class="card-head"><div><h2>Eventos recentes</h2><p>Os eventos repetidos são agrupados (coluna Qtd)</p></div></div><div id="events"></div></div>
    </div>`);

    lineChart(content.querySelector("#chart"), {
      labels: s.byDay.map((d) => `${d.day.slice(8)}/${d.day.slice(5, 7)}`),
      series: [{ name: "País não permitido", values: s.byDay.map((d) => d.geo), color: COLORS.danger }, { name: "Limite de requisições", values: s.byDay.map((d) => d.rate), color: COLORS.warn }, { name: "Logins falhos", values: s.byDay.map((d) => d.login), color: COLORS.info }],
      format: (v) => num(Math.round(v))
    });

    mount(content.querySelector("#sessions"), table({
      emptyText: "Nenhuma sessão ativa.",
      columns: [
        { label: "Usuário", render: (x) => html`<div class="title">${x.name}${x.user_id === ctx.user.id ? html` <span class="badge brand">você</span>` : ""}</div><div class="sub">${x.email}</div>` },
        { label: "Acesso", render: (x) => html`${browser(x.user_agent)}<div class="sub">${x.ip_masked}</div>` },
        { label: "Atividade", render: (x) => since(x.last_seen_at) },
        { label: "", className: "actions", render: (x) => (x.user_id === ctx.user.id ? "" : html`<button class="btn sm danger" data-revoke="${x.user_id}" data-name="${x.name}">Encerrar</button>`) }
      ],
      rows: s.sessions
    }));

    mount(content.querySelector("#events"), table({
      emptyText: "Sem eventos.",
      columns: [
        { label: "Quando", render: (e) => dateTimeBR(e.occurred_at) },
        { label: "Evento", render: (e) => badge(EVENT[e.type]?.[0] || e.type, EVENT[e.type]?.[1] || "") },
        { label: "Origem", render: (e) => html`${COUNTRY[e.country] || e.country || "—"}<div class="sub">${e.ip_masked || ""}</div>` },
        { label: "Caminho", render: (e) => html`<span class="muted">${e.path || "—"}</span>` },
        { label: "Detalhe", render: (e) => e.detail || "—" },
        { label: "Qtd", align: "right", render: (e) => num(e.count) }
      ],
      rows: s.recent
    }));
  }

  async function drawAudit() {
    const { items } = await api("/admin/audit");
    mount(content, html`<div class="card-head"><div><h2>Auditoria</h2><p>As 150 ações administrativas mais recentes</p></div></div>${table({
      emptyText: "Sem registros.",
      columns: [
        { label: "Quando", render: (a) => dateTimeBR(a.occurred_at) },
        { label: "Quem", render: (a) => a.user_email || "—" },
        { label: "Ação", render: (a) => badge(a.action, "brand") },
        { label: "Objeto", render: (a) => html`${a.entity || "—"}<div class="sub">${a.entity_id ? String(a.entity_id).slice(0, 8) : ""}</div>` },
        { label: "IP", render: (a) => a.ip_masked || "—" }
      ],
      rows: items.map((a) => ({ ...a, id: a.id }))
    })}`);
  }

  const draw = () => (state.tab === "visao" ? drawOverview() : drawAudit()).catch((e) => toast(e.message, "danger"));
  root.querySelector("#tabs").addEventListener("click", (event) => { const b = event.target.closest("[data-t]"); if (!b) return; state.tab = b.dataset.t; root.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b)); root.querySelector("#days").style.display = state.tab === "visao" ? "" : "none"; draw(); });
  root.querySelector("#days").addEventListener("click", (event) => { const b = event.target.closest("[data-d]"); if (!b) return; state.days = Number(b.dataset.d); root.querySelectorAll("#days button").forEach((x) => x.classList.toggle("active", x === b)); draw(); });
  content.addEventListener("click", async (event) => {
    const b = event.target.closest("[data-revoke]");
    if (!b || !(await confirmDialog({ title: "Encerrar sessões?", message: `${b.dataset.name} será desconectado de todos os dispositivos.`, confirmLabel: "Encerrar", danger: true }))) return;
    try { await api(`/admin/users/${b.dataset.revoke}/revoke-sessions`, { method: "POST", body: {} }); toast("Sessões encerradas.", "ok"); draw(); } catch (error) { toast(error.message, "danger"); }
  });

  await draw();
}
