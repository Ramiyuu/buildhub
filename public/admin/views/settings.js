import { api, html, mount, toast, badge, icon } from "/panel/ui.js";

export default async function render(root, ctx) {
  ctx.setTitle("Atendimento e IA", "Como o chat do site responde e quando chama a equipe");
  const { settings, openai, model } = await api("/admin/settings/chat");
  const keyBadge = openai === "configurada" ? badge("Chave da OpenAI configurada", "ok") : openai === "mock" ? badge("Modo de teste (respostas simuladas)", "warn") : badge("Chave da OpenAI ausente", "danger");

  mount(root, html`<div class="grid grid-main">
    <form class="card stack" id="form">
      <div class="card-head" style="margin:0"><div><h2>Atendimento automático</h2><p>Vale para todos os visitantes do site</p></div></div>
      <label class="check"><input type="checkbox" id="aiEnabled" ${settings.aiEnabled ? "checked" : ""}> IA ligada (quando desligada, toda conversa vai direto para a equipe)</label>
      <div class="field"><label for="greeting">Mensagem de boas-vindas</label><textarea class="textarea" id="greeting" maxlength="300" rows="3">${settings.greeting}</textarea><span class="help">É o primeiro texto que o visitante vê ao abrir o chat.</span></div>
      <div class="field"><label for="extraPrompt">Orientações extras para a IA</label><textarea class="textarea" id="extraPrompt" maxlength="2000" rows="7" placeholder="Ex.: Atendemos clientes de todo o Brasil. Horário da equipe: seg a sex, 9h às 18h. Nunca informe valores; peça os dados do projeto.">${settings.extraPrompt}</textarea><span class="help">Somam-se às regras fixas (responder em português, não inventar preços/prazos, chamar um atendente quando necessário).</span></div>
      <div class="form-error" id="err" hidden></div>
      <div><button class="btn primary" type="submit">Salvar configurações</button></div>
    </form>
    <div class="stack">
      <div class="card"><div class="card-head"><div><h2>Conexão com a OpenAI</h2></div></div><dl class="kv"><dt>Status</dt><dd>${keyBadge}</dd><dt>Modelo</dt><dd>${model}</dd></dl><p class="muted small mt">A chave fica só nas variáveis do servidor (OPENAI_API_KEY) e nunca é enviada ao navegador. O modelo pode ser trocado em OPENAI_MODEL.</p></div>
      <div class="card"><div class="card-head"><div><h2>Como funciona</h2></div></div><ul class="protection-list">
        <li>${icon("check")}<span>O visitante conversa com a IA a qualquer hora.</span></li>
        <li>${icon("check")}<span>Se ele pedir um atendente (ou a IA achar necessário), você recebe uma notificação com som no sino.</span></li>
        <li>${icon("check")}<span>Ao <b>assumir</b> a conversa ou responder, a IA para imediatamente nela.</span></li>
        <li>${icon("check")}<span><b>Devolver à IA</b> reativa o atendimento automático.</span></li>
        <li>${icon("check")}<span>Limites: 1.000 caracteres por mensagem, 14 mensagens/min por IP e 40 respostas de IA por conversa.</span></li>
      </ul></div>
    </div>
  </div>`);

  root.querySelector("#form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const err = root.querySelector("#err");
    err.hidden = true;
    try {
      await api("/admin/settings/chat", { method: "PUT", body: { aiEnabled: root.querySelector("#aiEnabled").checked, greeting: root.querySelector("#greeting").value, extraPrompt: root.querySelector("#extraPrompt").value } });
      toast("Configurações salvas.", "ok");
    } catch (error) { err.textContent = error.message; err.hidden = false; }
  });
}
