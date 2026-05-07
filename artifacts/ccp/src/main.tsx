import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

// Registra o service worker em modo "prompt": quando uma nova versão do app
// é publicada, mostramos uma faixa não-bloqueante no rodapé pedindo pra
// recarregar. O `updateSW(true)` envia SKIP_WAITING pro SW novo, que assume
// imediatamente (ver sw.ts → activate + clients.claim).
if ("serviceWorker" in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      showUpdateBanner(() => {
        void updateSW(true);
      });
    },
    onRegisteredSW(_swUrl, registration) {
      // Verifica a cada 60 min se há nova versão (também roda no foco da aba)
      if (!registration) return;
      const checkForUpdate = () => {
        void registration.update().catch(() => {});
      };
      setInterval(checkForUpdate, 60 * 60 * 1000);
      window.addEventListener("focus", checkForUpdate);
    },
  });
}

function showUpdateBanner(onReload: () => void) {
  if (document.getElementById("ionex-pwa-update-banner")) return;

  const banner = document.createElement("div");
  banner.id = "ionex-pwa-update-banner";
  banner.setAttribute("role", "status");
  banner.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:16px",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "display:flex",
    "align-items:center",
    "gap:12px",
    "padding:10px 14px",
    "border-radius:10px",
    "background:#0a0b0f",
    "color:#fff",
    "border:1px solid rgba(255,255,255,0.12)",
    "box-shadow:0 8px 30px rgba(0,0,0,0.45)",
    "font:500 14px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    "max-width:calc(100vw - 32px)",
  ].join(";");

  const text = document.createElement("span");
  text.textContent = "Nova versão disponível";
  text.style.opacity = "0.92";

  const reloadBtn = document.createElement("button");
  reloadBtn.type = "button";
  reloadBtn.textContent = "Recarregar";
  reloadBtn.style.cssText = [
    "appearance:none",
    "border:0",
    "padding:6px 12px",
    "border-radius:8px",
    "background:#22c55e",
    "color:#0a0b0f",
    "font-weight:600",
    "cursor:pointer",
  ].join(";");
  reloadBtn.addEventListener("click", () => {
    reloadBtn.disabled = true;
    reloadBtn.textContent = "Atualizando…";
    onReload();
  });

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.setAttribute("aria-label", "Fechar");
  dismissBtn.textContent = "✕";
  dismissBtn.style.cssText = [
    "appearance:none",
    "border:0",
    "background:transparent",
    "color:#fff",
    "opacity:0.6",
    "cursor:pointer",
    "font-size:14px",
    "padding:4px 6px",
  ].join(";");
  dismissBtn.addEventListener("click", () => banner.remove());

  banner.append(text, reloadBtn, dismissBtn);
  document.body.append(banner);
}
