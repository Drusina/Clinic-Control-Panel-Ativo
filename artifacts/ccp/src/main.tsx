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
  // Timestamp of this page load. Lets us tell a fresh boot (safe to apply an
  // update immediately) apart from an update discovered mid-session (offer a
  // non-blocking banner instead, so we never discard in-progress work).
  const bootedAt = Date.now();

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // A new version finished installing and is waiting. If it surfaced right
      // after boot, the user has no in-progress work — apply it now so a simple
      // reload always delivers published fixes WITHOUT manual cache clearing
      // (this is what makes the already-shipped Diagnóstico fix reach the
      // manager's installed PWA). If it surfaces later in the session, show a
      // non-blocking banner so the user chooses when to reload.
      if (Date.now() - bootedAt < 10_000) {
        void updateSW(true);
      } else {
        showUpdateBanner(() => {
          void updateSW(true);
        });
      }
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const checkForUpdate = () => {
        void registration.update().catch(() => {});
      };
      // Check on startup, then hourly, on tab focus, and whenever the app
      // returns to the foreground (installed PWAs rarely fire `focus`, so
      // `visibilitychange` is the reliable signal there).
      checkForUpdate();
      setInterval(checkForUpdate, 60 * 60 * 1000);
      window.addEventListener("focus", checkForUpdate);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });
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
