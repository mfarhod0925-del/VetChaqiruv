import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { inTelegram, initTelegram } from "./lib/telegram.js";
import "./styles.css";

initTelegram();

// Oflayn kesh (PWA) faqat oddiy brauzerda. Telegram ichida eski nusxa qolib ketmasligi uchun o'chiramiz.
if ("serviceWorker" in navigator) {
  if (inTelegram) {
    navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (!regs.length) return;
      await Promise.all(regs.map((r) => r.unregister()));
      try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* yo'q */ }
      location.reload(); // keshsiz, yangi nusxani yuklash
    }).catch(() => {});
  } else {
    import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
  }
}

// "Telefonga o'rnatish" tugmasi uchun brauzer taklifini saqlab qo'yamiz
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__installPrompt = e;
  window.dispatchEvent(new Event("installable"));
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
