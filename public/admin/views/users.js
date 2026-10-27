import { api, html, mount, table, formModal, confirmDialog, showSecret, toast, badge, icon, since, dateTimeBR, debounce, optionsOf, initials } from "/panel/ui.js";

const ROLES = { admin: ["Administrador", "danger"], staff: ["Equipe", "brand"], client: ["Cliente", "info"] };

export default async function render(root, ctx) {
  ctx.setTitle("Usuários", "Contas do painel e da área do cliente");
  const companies = (await api("/admin/companies")).items;
  const state = { q: "", role: "", status: "", users: [] };

  mount(root, html`<div class="stack">
    <div id="summary"></div>
    <div class="toolbar">
      <input class="input search" id="q" type="search" placeholder="Buscar por nome ou email..." aria-label="Buscar">
      <select class="select" id="role" aria-label="Perfil"><option value="">Perfil: todos</option>${Object.entries(ROLES).map(([k, [l]]) => html`<option value="${k}">${l}</option>`)}</select>
      <select class="select" id="status" aria-label="Status"><option value="">Status: todos</option><option value="active">Ativos</option><option value="blocked">Bloqueados</option></select>
      <span class="spacer"></span>
      <button class="btn primary" id="add" type="button">${icon("plus")} Novo usuário</button>
    </div>
    <div id="list"></div>
  </div>`);
  const list = root.querySelector("#list");

  async function load() {
    const params = new URLSearchParams();
    for (const key of ["q", "role", "status"]) if (state[key]) params.set(key, state[key]);
    state.users = (await api(`/admin/users?${params}`)).users;
    draw();
  }

  function draw() {
    const all = state.users;
    mount(root.querySelector("#summary"), html`<div class="row wrap"><span class="badge">${all.length} usuário(s)</span><span class="badge danger">${all.filter((u) => u.role === "admin").length} admin</span><span class="badge brand">${all.filter((u) => u.role === "staff").length} equipe</span><span class="badge info">${all.filter((u) => u.role === "client").length} cliente(s)</span>${all.filter((u) => u.status === "blocked").length ? html`<span class="badge warn">${all.filter((u) => u.status === "blocked").length} bloqueado(s)</span>` : ""}</div>`);
    mount(list, table({
      emptyText: "Nenhum usuário encontrado.",
      columns: [
        { label: "Usuário", render: (u) => html`<div class="row"><span class="avatar">${initials(u.name)}</span><div><div class="title">${u.name}${u.id === ctx.user.id ? html` <span class="badge brand">você</span>` : ""}</div><div class="sub">${u.email}</div></div></div>` },
        { label: "Perfil", render: (u) => badge(ROLES[u.role][0], ROLES[u.role][1]) },
        { label: "Status", render: (u) => (u.status === "blocked" ? badge("Bloqueado", "danger") : u.locked ? badge("Travado (tentativas)", "warn") : badge("Ativo", "ok")) },
        { label: "Empresa", render: (u) => u.companyName || "—" },
        { label: "Último acesso", render: (u) => (u.lastLoginAt ? html`${since(u.lastLoginAt)}<div class="sub">${u.lastLoginCountry || ""} · ${dateTimeBR(u.lastLoginAt)}</div>` : html`<span class="muted">nunca</span>`) },
        { label: "Sessões", render: (u) => u.activeSessions || "—" },
        {
          label: "", className: "actions", render: (u) => html`<button class="btn sm ghost" data-act="edit" data-id="${u.id}" title="Editar" aria-label="Editar">${icon("edit")}</button>
            <button class="btn sm ghost" data-act="reset" data-id="${u.id}" title="Gerar nova senha temporária" aria-label="Redefinir senha">${icon("key")}</button>
            ${u.locked ? html`<button class="btn sm ghost" data-act="unlock" data-id="${u.id}">Destravar</button>` : ""}
            ${u.activeSessions ? html`<button class="btn sm ghost" data-act="sessions" data-id="${u.id}" title="Encerrar sessões" aria-label="Encerrar sessões">${icon("logout")}</button>` : ""}
            ${u.id !== ctx.user.id ? html`<button class="btn sm ghost" data-act="toggle" data-id="${u.id}" title="${u.status === "blocked" ? "Reativar acesso" : "Bloquear acesso"}" aria-label="${u.status === "blocked" ? "Reativar acesso" : "Bloquear acesso"}">${icon(u.status === "blocked" ? "check" : "lock")}</button> <button class="btn sm danger" data-act="delete" data-id="${u.id}" title="Excluir" aria-label="Excluir">${icon("trash")}</button>` : ""}`
        }
      ],
      rows: state.users
    }));
  }

  const fields = (creating) => [
    { name: "name", label: "Nome", required: true, full: true },
    { name: "email", label: "Email", type: "email", required: true, full: true },
    { name: "role", label: "Perfil", type: "select", default: "client", options: Object.entries(ROLES).map(([value, [label]]) => ({ value, label })) },
    { name: "companyId", label: "Empresa vinculada", type: "select", options: optionsOf(companies, { blank: "Nenhuma" }), help: "Clientes só enxergam dados da empresa vinculada." },
    ...(creating ? [{ name: "password", label: "Senha inicial (opcional)", type: "password", full: true, autocomplete: "new-password", help: "Em branco: o sistema gera uma senha temporária de 16 caracteres e exige a troca no primeiro acesso." }] : [])
  ];

  root.querySelector("#add").addEventListener("click", () => formModal({
    title: "Novo usuário", fields: fields(true), wide: true, submitLabel: "Criar usuário",
    onSubmit: async (v) => {
      const result = await api("/admin/users", { method: "POST", body: { name: v.name, email: v.email, role: v.role, companyId: v.companyId || null, password: v.password || undefined } });
      toast("Usuário criado.", "ok");
      await load();
      if (result.tempPassword) setTimeout(() => showSecret({ title: "Senha temporária", subtitle: `Passe para ${result.user.email}. Ela aparece só agora e precisa ser trocada no primeiro acesso.`, secret: result.tempPassword }), 150);
    }
  }));

  root.querySelector("#q").addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); load(); }, 250));
  root.querySelector("#role").addEventListener("change", (e) => { state.role = e.target.value; load(); });
  root.querySelector("#status").addEventListener("change", (e) => { state.status = e.target.value; load(); });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const user = state.users.find((u) => u.id === button.dataset.id);
    const act = button.dataset.act;
    const call = async (path, options, done) => { try { const r = await api(path, options); toast(done, "ok"); await load(); return r; } catch (error) { toast(error.message, "danger"); } };
    if (act === "edit") {
      formModal({ title: "Editar usuário", fields: fields(false), wide: true, initial: { name: user.name, email: user.email, role: user.role, companyId: user.companyId }, onSubmit: async (v) => { await api(`/admin/users/${user.id}`, { method: "PATCH", body: { name: v.name, email: v.email, role: v.role, companyId: v.companyId || null } }); toast("Usuário atualizado.", "ok"); await load(); } });
    } else if (act === "reset") {
      if (await confirmDialog({ title: "Redefinir senha?", message: `${user.name} perderá o acesso atual e receberá uma senha temporária.`, confirmLabel: "Gerar nova senha" })) {
        const r = await call(`/admin/users/${user.id}/reset-password`, { method: "POST", body: {} }, "Senha redefinida.");
        if (r) showSecret({ title: "Nova senha temporária", subtitle: `Passe para ${user.email}. Ela aparece só agora.`, secret: r.tempPassword });
      }
    } else if (act === "unlock") await call(`/admin/users/${user.id}/unlock`, { method: "POST", body: {} }, "Conta destravada.");
    else if (act === "sessions") { if (await confirmDialog({ title: "Encerrar sessões?", message: `${user.name} será desconectado de todos os dispositivos.`, confirmLabel: "Encerrar" })) await call(`/admin/users/${user.id}/revoke-sessions`, { method: "POST", body: {} }, "Sessões encerradas."); }
    else if (act === "toggle") {
      const block = user.status !== "blocked";
      if (!block || (await confirmDialog({ title: "Bloquear usuário?", message: `${user.name} não conseguirá entrar até ser reativado.`, confirmLabel: "Bloquear", danger: true }))) await call(`/admin/users/${user.id}`, { method: "PATCH", body: { status: block ? "blocked" : "active" } }, block ? "Usuário bloqueado." : "Usuário reativado.");
    } else if (act === "delete") {
      if (await confirmDialog({ title: "Excluir usuário?", message: `${user.name} (${user.email}) será removido definitivamente.`, confirmLabel: "Excluir", danger: true })) await call(`/admin/users/${user.id}`, { method: "DELETE" }, "Usuário excluído.");
    }
  });

  await load();
}
