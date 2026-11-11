import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { initTelegram } from "./lib/telegram.js";
import "./styles.css";

initTelegram();

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
