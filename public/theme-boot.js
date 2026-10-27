// Roda no <head>, antes da pintura: aplica o tema salvo e liga o estado da animacao de entrada.
// Fica em arquivo proprio porque a CSP do site bloqueia scripts inline.
try {
  if (localStorage.getItem("buildhub_theme") === "dark") document.documentElement.classList.add("dark-theme");
} catch (error) { /* localStorage indisponivel (modo privado): segue no tema claro */ }
document.documentElement.classList.add("has-intro");
