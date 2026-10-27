// Area do cliente: projetos, cobrancas e troca de senha. So mostra dados da empresa vinculada ao usuario.
import { api, setCsrf, $, html, mount, table, badge, statusBadge, progress, brl, dateBR, icon, formModal, toast, initials, initThemeToggle, PROJECT_TYPES, safeUrl } from "/panel/ui.js";

const card = (label, value, sub = "") => html`<div class="card kpi"><span class="label">${label}</span><span class="value">${value}</span><span class="foot">${sub}</span></div>`;

async function start() {
  const me = await api("/auth/me");
  if (me.user.role !== "client") { location.replace("/admin/"); return; }
  setCsrf(me.csrf);
  $("#userName").textContent = me.user.name;
  $("#userAvatar").textContent = initials(me.user.name);
  initThemeToggle($("#themeBtn"));
  $("#logoutBtn").addEventListener("click", async () => { try { await api("/auth/logout", { method: "POST", body: {} }); } catch { /* segue */ } location.href = "/login.html"; });

  if (me.user.mustChangePassword) { changePassword(true); return; }

  const { company, projects, invoices } = await api("/client/overview");
  const root = $("#view");

  if (!company) {
    mount(root, html`<div class="card" style="margin-top:24px"><div class="empty"><strong>Sua conta ainda não está vinculada a uma empresa</strong><span>Assim que a equipe da BuildHub fizer o vínculo, seus projetos e cobranças aparecem aqui. Use o chat no canto da tela para falar com a gente.</span></div></div>`);
    return;
  }

  const active = projects.filter((p) => !["entregue", "cancelado"].includes(p.status));
  const open = invoices.filter((i) => i.status === "pendente");
  const overdue = open.filter((i) => i.overdue);

  mount(root, html`<div class="stack" style="padding-top:24px">
    <div><h1 style="font-size:1.6rem;font-weight:800">Olá, ${me.user.name.split(" ")[0]}!</h1><p class="muted">${company.name}${company.city ? ` · ${company.city}${company.state ? `/${company.state}` : ""}` : ""}</p></div>
    <div class="grid grid-4">
      ${card("Projetos em andamento", active.length, `${projects.length} no total`)}
      ${card("Projetos entregues", projects.filter((p) => p.status === "entregue").length, "concluídos")}
      ${card("A pagar", brl(open.reduce((s, i) => s + i.amount_cents, 0)), `${open.length} cobrança(s) em aberto`)}
      ${card("Em atraso", brl(overdue.reduce((s, i) => s + i.amount_cents, 0)), overdue.length ? "regularize para evitar bloqueios" : "tudo em dia")}
    </div>

    <section><div class="card-head"><div><h2 style="font-size:1.1rem">Meus projetos</h2></div></div>
      ${projects.length ? html`<div class="grid grid-3">${projects.map((p) => html`<div class="card project-card"><div class="row"><h3>${p.name}</h3><span class="spacer"></span>${statusBadge("project", p.status)}</div><span class="muted small">${PROJECT_TYPES[p.type] || p.type}</span>${progress(p.progress)}<div class="row small muted"><span>${p.progress}% concluído</span><span class="spacer"></span><span>${p.status === "entregue" ? `Entregue em ${dateBR(p.delivered_at || p.due_date)}` : `Prazo: ${dateBR(p.due_date)}`}</span></div>${safeUrl(p.url) ? html`<a class="btn sm ghost" href="${safeUrl(p.url)}" target="_blank" rel="noopener noreferrer">Abrir site ${icon("external")}</a>` : ""}</div>`)}</div>` : html`<div class="card"><div class="empty">Nenhum projeto ainda.</div></div>`}
    </section>

    <section><div class="card-head"><div><h2 style="font-size:1.1rem">Cobranças</h2><p>Para pagar ou tirar dúvidas, fale com a equipe pelo chat.</p></div></div>
      ${table({
        emptyText: "Nenhuma cobrança.",
        columns: [
          { label: "Nº", render: (i) => html`<span class="title">${i.number}</span>` },
          { label: "Descrição", render: (i) => i.description },
          { label: "Vencimento", render: (i) => dateBR(i.due_date) },
          { label: "Valor", align: "right", render: (i) => brl(i.amount_cents) },
          { label: "Situação", render: (i) => (i.status === "paga" ? html`${badge("Paga", "ok")}<div class="sub">${dateBR(i.paid_at)}</div>` : i.overdue ? badge("Em atraso", "danger") : badge("A vencer", "warn")) }
        ],
        rows: invoices
      })}
    </section>

    <section><div class="card"><div class="row wrap"><div><h2 style="font-size:1.05rem">Minha conta</h2><p class="muted small">${me.user.email}</p></div><span class="spacer"></span><button class="btn ghost" id="pass">${icon("key")} Trocar senha</button></div></div></section>
  </div>`);
  $("#pass").addEventListener("click", () => changePassword(false));
}

function changePassword(forced) {
  const dialog = formModal({
    title: forced ? "Defina uma nova senha" : "Trocar senha",
    subtitle: forced ? "Por segurança, troque a senha temporária antes de continuar." : "Suas outras sessões serão encerradas.",
    submitLabel: "Salvar senha",
    fields: [
      { name: "current", label: "Senha atual", type: "password", required: true, full: true, autocomplete: "current-password" },
      { name: "next", label: "Nova senha", type: "password", required: true, full: true, autocomplete: "new-password", help: "Mínimo de 8 caracteres, com letras e números." }
    ],
    onSubmit: async (values) => { await api("/auth/change-password", { method: "POST", body: values }); toast("Senha alterada.", "ok"); if (forced) location.reload(); }
  });
  if (forced) dialog.el.querySelector(".dialog-actions .ghost").remove();
}

start().catch((error) => { console.error(error); mount($("#view"), html`<div class="card" style="margin-top:24px"><div class="empty"><strong>Não foi possível carregar sua área.</strong><span>${error.message}</span></div></div>`); });
