// Login e cadastro pela API (sessao em cookie httpOnly; nada de senha ou dado de conta fica no navegador).
(() => {
  const loginForm = document.querySelector("#loginForm");
  const registerForm = document.querySelector("#registerForm");
  if (!loginForm || !registerForm) return;

  const REMEMBER_KEY = "buildhub_remembered_email";
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ---- abas Entrar / Cadastrar
  function setMode(mode) {
    const isLogin = mode === "login";
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
      const active = tab.dataset.authTab === mode;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
  }
  document.querySelectorAll("[data-auth-tab]").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.authTab)));
  if (location.hash === "#cadastro") setMode("register");

  // ---- mostrar/ocultar senha
  document.querySelectorAll("[data-toggle-password], #togglePassword").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector(`#${button.dataset.togglePassword || "loginPassword"}`);
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      button.textContent = hidden ? "Ocultar" : "Ver";
      button.setAttribute("aria-label", hidden ? "Ocultar senha" : "Mostrar senha");
    });
  });

  // ---- mascara de CPF
  document.querySelector("#registerCpf").addEventListener("input", (event) => {
    const d = event.target.value.replace(/\D/g, "").slice(0, 11);
    event.target.value = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(".") + (d.length > 9 ? `-${d.slice(9)}` : "");
  });

  // ---- lembrar so o e-mail (nunca a senha)
  const remembered = localStorage.getItem(REMEMBER_KEY);
  if (remembered) {
    document.querySelector("#loginEmail").value = remembered;
    document.querySelector("#rememberLogin").checked = true;
  }

  // ---- helpers
  function fieldError(input, message) {
    const row = input.closest(".form-row");
    row.classList.toggle("error", !!message);
    row.querySelector("small").textContent = message || "";
  }
  function formError(form, message) {
    const box = form.querySelector(".auth-error");
    box.textContent = message || "";
    box.hidden = !message;
  }
  function validate(rules) {
    let ok = true;
    for (const [input, valid, message] of rules) {
      fieldError(input, valid ? "" : message);
      if (!valid) ok = false;
    }
    return ok;
  }
  function destination(fallback) {
    const next = new URLSearchParams(location.search).get("next");
    return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
  }
  async function submit(form, path, payload) {
    const button = form.querySelector("button[type=submit]");
    const label = button.querySelector("span");
    const original = label.textContent;
    button.disabled = true;
    label.textContent = "Aguarde...";
    formError(form, "");
    try {
      const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (response.status === 429 ? "Muitas tentativas. Aguarde um pouco." : "Não foi possível concluir. Tente novamente."));
      return data;
    } finally {
      button.disabled = false;
      label.textContent = original;
    }
  }

  // ---- login
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector("#loginEmail");
    const password = document.querySelector("#loginPassword");
    if (!validate([[email, emailPattern.test(email.value.trim()), "Digite um email válido."], [password, password.value.length > 0, "Informe a senha."]])) return;
    try {
      const data = await submit(loginForm, "/api/auth/login", { email: email.value.trim(), password: password.value });
      if (document.querySelector("#rememberLogin").checked) localStorage.setItem(REMEMBER_KEY, email.value.trim());
      else localStorage.removeItem(REMEMBER_KEY);
      location.href = destination(data.redirect);
    } catch (error) {
      password.value = "";
      formError(loginForm, error.message);
    }
  });

  // ---- cadastro
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const f = (id) => document.querySelector(`#${id}`);
    const name = f("registerName"), email = f("registerEmail"), cpf = f("registerCpf"), pass = f("registerPassword"), confirm = f("registerPasswordConfirm");
    const strong = pass.value.length >= 8 && /[A-Za-z]/.test(pass.value) && /\d/.test(pass.value);
    if (!validate([
      [name, name.value.trim().length >= 3, "Informe seu nome completo."],
      [email, emailPattern.test(email.value.trim()), "Digite um email válido."],
      [cpf, cpf.value.replace(/\D/g, "").length === 11, "Informe um CPF com 11 números."],
      [pass, strong, "Mínimo de 8 caracteres, com letras e números."],
      [confirm, confirm.value === pass.value, "As senhas não coincidem."]
    ])) return;
    try {
      const data = await submit(registerForm, "/api/auth/register", { name: name.value.trim(), email: email.value.trim(), cpf: cpf.value, password: pass.value });
      location.href = destination(data.redirect);
    } catch (error) {
      formError(registerForm, error.message);
    }
  });
})();
