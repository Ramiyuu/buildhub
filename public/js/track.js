// Conta a visita de forma anonima (o servidor guarda so pais/estado, nunca o IP). Ignora robos e usuarios logados.
(() => {
  const body = JSON.stringify({ path: location.pathname, ref: document.referrer || undefined });
  const send = () => {
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" })))) {
        fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch (error) { /* analytics nunca deve quebrar a pagina */ }
  };
  if (document.readyState === "complete") send();
  else window.addEventListener("load", send, { once: true });
})();
