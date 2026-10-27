import { api, html, mount, brl, brlShort, num, compact, pct, deltaChip, icon, badge, dateBR, ago, on, initials, raw } from "/panel/ui.js";
import { lineChart, barChart, donut, hbars, sparkline, COLORS, PALETTE } from "/panel/charts.js";
import { STATES, MAP_VIEWBOX } from "/admin/js/brasil-map.js";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DEVICES = { mobile: "Celular", desktop: "Computador", tablet: "Tablet" };
const REGION_ORDER = ["Sudeste", "Nordeste", "Sul", "Centro-Oeste", "Norte"];

function dayLabel(iso) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }

// ------------------------------------------------------------------ mapa do Brasil
function renderMap(el, data) {
  const regionViews = Object.fromEntries(data.regions.map((r) => [r.region, r.views]));
  const stateViews = Object.fromEntries(data.states.map((s) => [s.region_code, s.views]));
  const total = data.regions.reduce((s, r) => s + r.views, 0) + data.unknownRegionViews;
  const state = { mode: "regioes" };

  const value = (uf) => (state.mode === "regioes" ? regionViews[STATES[uf].region] || 0 : stateViews[uf] || 0);
  const maxValue = () => Math.max(1, ...Object.keys(STATES).map(value));
  const share = (v) => (total ? (v / total) * 100 : 0);

  mount(el, html`<div class="card-head"><div><h2>De onde vêm as visitas</h2><p>Regiões e estados do Brasil (${num(total)} visualizações)</p></div><div class="seg" id="mapMode"><button data-mode="regioes" class="active">Regiões</button><button data-mode="estados">Estados</button></div></div>
    <div class="map-wrap">
      <div class="map" id="mapBox"><svg viewBox="${MAP_VIEWBOX}" role="img" aria-label="Mapa do Brasil com visitas por região">${Object.entries(STATES).map(([uf, s]) => html`<path data-uf="${uf}" d="${s.d}"><title>${s.name}</title></path>`)}</svg><div class="chart-tip" id="mapTip"></div>
        <div class="map-scale"><span>menos</span><i></i><span>mais visitas</span></div></div>
      <div id="regionList"></div>
    </div>`);

  const box = el.querySelector("#mapBox"), tip = el.querySelector("#mapTip"), paths = [...el.querySelectorAll("path")];

  function paint() {
    const max = maxValue();
    paths.forEach((p) => { p.style.setProperty("--v", (value(p.dataset.uf) / max).toFixed(3)); });
    const top = [...data.states].sort((a, b) => b.views - a.views);
    mount(el.querySelector("#regionList"), html`<div class="stack" style="gap:6px">
      ${REGION_ORDER.map((name) => {
        const v = regionViews[name] || 0;
        const states = top.filter((s) => STATES[s.region_code]?.region === name).slice(0, 3);
        return html`<div class="region-row" data-region="${name}"><div class="top"><strong>${name}</strong><span>${num(v)} · ${pct(share(v))}</span></div><div class="progress"><i style="width:${Math.min(100, share(v) * 2.2)}%"></i></div><span class="muted small">${states.length ? states.map((s) => `${s.region_code} ${num(s.views)}`).join(" · ") : "sem dados"}</span></div>`;
      })}
      ${data.unknownRegionViews ? html`<p class="muted small" style="padding:0 10px">${num(data.unknownRegionViews)} visualizações sem região identificada.</p>` : ""}
    </div>`);
  }

  const highlight = (predicate) => paths.forEach((p) => p.classList.toggle("hot", predicate(p.dataset.uf)));

  box.addEventListener("pointermove", (event) => {
    const path = event.target.closest("path");
    if (!path) { tip.style.opacity = "0"; highlight(() => false); return; }
    const uf = path.dataset.uf, s = STATES[uf];
    const regionName = s.region;
    highlight(state.mode === "regioes" ? (u) => STATES[u].region === regionName : (u) => u === uf);
    const rect = box.getBoundingClientRect();
    const v = state.mode === "regioes" ? regionViews[regionName] || 0 : stateViews[uf] || 0;
    tip.innerHTML = state.mode === "regioes"
      ? `<b>${regionName}</b>${num(v)} visualizações · ${pct(share(v))}`
      : `<b>${s.name} (${uf})</b>${regionName} · ${num(v)} visualizações · ${pct(share(v))}`;
    tip.style.left = `${Math.min(rect.width - 90, Math.max(90, event.clientX - rect.left))}px`;
    tip.style.top = `${Math.max(50, event.clientY - rect.top - 12)}px`;
    tip.style.opacity = "1";
  });
  box.addEventListener("pointerleave", () => { tip.style.opacity = "0"; highlight(() => false); });
  el.querySelector("#regionList").addEventListener("pointerover", (event) => { const row = event.target.closest("[data-region]"); highlight(row ? (u) => STATES[u].region === row.dataset.region : () => false); });
  el.querySelector("#regionList").addEventListener("pointerleave", () => highlight(() => false));
  el.querySelector("#mapMode").addEventListener("click", (event) => {
    const b = event.target.closest("[data-mode]");
    if (!b) return;
    state.mode = b.dataset.mode;
    el.querySelectorAll("#mapMode button").forEach((x) => x.classList.toggle("active", x === b));
    paint();
  });
  paint();
}

// ------------------------------------------------------------------ tela
export default async function render(root, ctx) {
  ctx.setTitle("Visão geral", `Olá, ${ctx.user.name.split(" ")[0]}! Resumo da empresa e do site`);
  let days = 30;
  let timer;
  const offs = [];

  const [dash, fin, analytics, chats] = await Promise.all([
    api("/admin/dashboard"), api("/admin/finance/summary?months=6"), api("/admin/analytics?days=30"), api("/admin/chat/conversations")
  ]);

  const m = dash.money, p = dash.projects, v = dash.visits;
  const revSeries = fin.monthly.map((x) => x.revenue);

  mount(root, html`<div class="stack">
    <div class="grid grid-4">
      <div class="card kpi"><span class="ico">${icon("wallet")}</span><span class="label">Receita do mês</span><span class="value">${brl(m.revenue_month)}</span><span class="foot">${deltaChip(m.revenue_month, m.revenue_prev)} vs mês anterior</span>${raw(sparkline(revSeries, COLORS.accent))}</div>
      <div class="card kpi"><span class="ico">${icon("receipt")}</span><span class="label">A receber</span><span class="value">${brl(m.receivable)}</span><span class="foot">${m.overdue_count ? html`<span class="badge danger">${m.overdue_count} em atraso · ${brlShort(m.overdue)}</span>` : html`<span class="badge ok">Sem atrasos</span>`}</span></div>
      <div class="card kpi"><span class="ico">${icon("folder")}</span><span class="label">Projetos ativos</span><span class="value">${p.active}</span><span class="foot">${p.late ? html`<span class="badge danger">${p.late} atrasado(s)</span>` : ""} ${p.due_soon ? html`<span class="badge warn">${p.due_soon} vence(m) em 7 dias</span>` : ""}${!p.late && !p.due_soon ? "no prazo" : ""}</span></div>
      <div class="card kpi"><span class="ico">${icon("trending")}</span><span class="label">Visitas (30 dias)</span><span class="value">${num(v.current.views)}</span><span class="foot">${deltaChip(v.current.views, v.previous.views)} · ${num(v.current.visitors)} visitantes</span>${raw(sparkline(v.series.map((x) => x.views), COLORS.cyan))}</div>
    </div>

    <div class="grid grid-balanced">
      <div class="card"><div class="card-head"><div><h2>Visitas ao site</h2><p id="visitsSub"></p></div><div class="seg" id="rangeSeg"><button data-d="7">7 dias</button><button data-d="30" class="active">30 dias</button><button data-d="90">90 dias</button></div></div>
        <div id="visitsChart"></div><div class="legend"><span><i style="background:${COLORS.accent}"></i>Visualizações</span><span><i style="background:${COLORS.cyan}"></i>Visitantes</span></div>
        <div class="mt"><h3 style="font-size:.92rem;margin-bottom:10px">Cidades que mais acessam</h3><div id="cities"></div></div></div>
      <div class="card" id="mapCard"></div>
    </div>

    <div class="grid grid-3">
      <div class="card"><div class="card-head"><div><h2>Receita × despesas</h2><p>Últimos 6 meses</p></div><a class="btn sm ghost" href="#/financeiro">Detalhes</a></div><div id="revChart"></div><div class="legend"><span><i style="background:${COLORS.accent}"></i>Receita</span><span><i style="background:${COLORS.rose}"></i>Despesas</span></div></div>
      <div class="card"><div class="card-head"><div><h2>Cobranças em atraso</h2><p>As mais antigas primeiro</p></div><a class="btn sm ghost" href="#/cobrancas">Cobranças</a></div>
        ${dash.lateInvoices.length ? html`<div class="stack" style="gap:10px">${dash.lateInvoices.map((i) => html`<div class="row"><div style="min-width:0;flex:1"><div class="title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.company_name}</div><div class="muted small">${i.number} · ${i.days} dia(s) de atraso</div></div><strong>${brl(i.amount_cents)}</strong></div>`)}</div>` : html`<div class="empty">Nenhuma cobrança atrasada.</div>`}</div>
      <div class="card"><div class="card-head"><div><h2>Atendimento ao vivo</h2><p id="chatSub"></p></div><a class="btn sm ghost" href="#/chat">Abrir chat</a></div><div id="chatList"></div></div>
    </div>

    <div class="grid grid-3">
      <div class="card"><div class="card-head"><div><h2>Páginas mais vistas</h2><p>Últimos 30 dias</p></div></div><div id="pages"></div></div>
      <div class="card"><div class="card-head"><div><h2>Dispositivos</h2><p>Como o público acessa</p></div></div><div id="devices"></div></div>
      <div class="card"><div class="card-head"><div><h2>Origem do tráfego</h2><p>De onde as pessoas chegam</p></div></div><div id="refs"></div></div>
    </div>

    <div class="grid grid-4">
      <div class="card kpi"><span class="label">Online agora</span><span class="value" id="online">${analytics.online}</span><span class="foot">visitantes nos últimos 5 min</span></div>
      <div class="card kpi"><span class="label">Sites no ar</span><span class="value">${dash.sites.online}<small class="muted" style="font-size:1rem"> / ${dash.sites.total}</small></span><span class="foot">MRR de manutenção ${brl(dash.sites.mrr)}</span></div>
      <div class="card kpi"><span class="label">Leads em negociação</span><span class="value">${dash.leads.open}</span><span class="foot">${brl(dash.leads.pipeline)} no funil</span></div>
      <div class="card kpi"><span class="label">Conversas abertas</span><span class="value">${dash.chats.open}</span><span class="foot">${dash.chats.handoff ? html`<span class="badge danger">${dash.chats.handoff} aguardando humano</span>` : "tudo respondido"}</span></div>
    </div>
  </div>`);

  // visitas (reconsulta ao trocar o periodo)
  function drawVisits(data) {
    lineChart(root.querySelector("#visitsChart"), {
      labels: data.series.map((s) => dayLabel(s.day)),
      series: [{ name: "Visualizações", values: data.series.map((s) => s.views), color: COLORS.accent }, { name: "Visitantes", values: data.series.map((s) => s.visitors), color: COLORS.cyan }],
      format: (x) => num(Math.round(x))
    });
    root.querySelector("#visitsSub").textContent = `${num(data.current.views)} visualizações · ${num(data.current.visitors)} visitantes nos últimos ${data.days} dias`;
  }
  drawVisits(analytics);
  root.querySelector("#rangeSeg").addEventListener("click", async (event) => {
    const b = event.target.closest("[data-d]");
    if (!b) return;
    days = Number(b.dataset.d);
    root.querySelectorAll("#rangeSeg button").forEach((x) => x.classList.toggle("active", x === b));
    drawVisits(await api(`/admin/analytics?days=${days}`));
  });

  renderMap(root.querySelector("#mapCard"), analytics);
  mount(root.querySelector("#cities"), analytics.cities.length ? hbars(analytics.cities.slice(0, 5).map((c) => ({ label: `${c.city}${c.region_code ? ` / ${c.region_code}` : ""}`, value: c.views })), { format: num, color: COLORS.cyan }) : html`<p class="muted small">Sem dados de cidade ainda.</p>`);

  barChart(root.querySelector("#revChart"), { labels: fin.monthly.map((x) => MONTHS[Number(x.month.slice(5)) - 1]), series: [{ name: "Receita", values: fin.monthly.map((x) => x.revenue), color: COLORS.accent }, { name: "Despesas", values: fin.monthly.map((x) => x.expenses), color: COLORS.rose }], height: 220, width: 400, format: (x, axis) => (axis ? brlShort(x).replace("R$ ", "") : brl(x)) });

  mount(root.querySelector("#pages"), analytics.pages.length ? hbars(analytics.pages.map((x) => ({ label: x.path, value: x.views })), { format: num }) : html`<div class="empty">Sem visitas ainda.</div>`);
  donut(root.querySelector("#devices"), analytics.devices.map((d, i) => ({ label: DEVICES[d.device] || d.device, value: d.views, color: PALETTE[i] })), { center: "visualizações", format: compact });
  const referred = analytics.referrers.reduce((s, x) => s + x.views, 0);
  const refs = [{ label: "Acesso direto", value: Math.max(0, analytics.totalViews - referred) }, ...analytics.referrers.map((x) => ({ label: x.referrer, value: x.views }))].filter((x) => x.value > 0);
  mount(root.querySelector("#refs"), hbars(refs, { format: num, color: COLORS.cyan }));

  // atendimento (atualiza em tempo real)
  async function drawChats() {
    const { items } = await api("/admin/chat/conversations");
    const waiting = items.filter((c) => c.handoff_requested && c.mode === "ai").length;
    root.querySelector("#chatSub").textContent = `${items.length} aberta(s)${waiting ? ` · ${waiting} aguardando humano` : ""}`;
    mount(root.querySelector("#chatList"), items.length ? html`<div class="stack" style="gap:10px">${items.slice(0, 4).map((c) => html`<a class="row" href="#/chat/${c.id}"><span class="avatar">${initials(c.visitor_name || "V")}</span><div style="min-width:0;flex:1"><div class="title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.visitor_name || "Visitante"} ${c.handoff_requested && c.mode === "ai" ? badge("pediu humano", "danger") : c.mode === "human" ? badge("humano", "info") : badge("IA", "brand")}</div><div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.last_message_preview || ""}</div></div>${c.unread_admin ? html`<span class="badge danger">${c.unread_admin}</span>` : ""}</a>`)}</div>` : html`<div class="empty">Nenhuma conversa aberta.</div>`);
  }
  await drawChats();
  offs.push(on("chat:message", drawChats), on("chat:mode", drawChats), on("chat:closed", drawChats), on("chat:read", drawChats));
  timer = setInterval(async () => {
    try { const a = await api("/admin/analytics?days=1"); const el = root.querySelector("#online"); if (el) el.textContent = a.online; } catch { /* mantem o ultimo valor */ }
  }, 30000);

  return { destroy() { clearInterval(timer); offs.forEach((off) => off()); } };
}
