import { useState } from "react";
import { useAuth } from "../auth.jsx";
import { requestContact, tg } from "../lib/telegram.js";
import Login from "./Login.jsx";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Telegram ichida ochilganda kirish ekrani: raqam so'rash yoki xatoni ko'rsatish. */
export default function TelegramLogin() {
  const { tgState, telegramLogin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [sms, setSms] = useState(false);

  if (sms) return <Login />;

  if (tgState.status === "loading" && !busy) {
    return <div className="center">Telegram orqali kirilmoqda…</div>;
  }

  async function sharePhone() {
    setBusy(true); setHint("");
    const sent = await requestContact();
    if (sent === null) {
      // Eski Telegram: raqamni botdagi tugma orqali yuborish kerak
      setHint("Telegram ilovangiz eski. Botga qaytib, pastdagi «📱 Telefon raqamni yuborish» tugmasini bosing, so'ng ilovani qayta oching.");
      setBusy(false);
      return;
    }
    if (!sent) { setHint("Kirish uchun raqamingiz kerak. Qayta urinib ko'ring."); setBusy(false); return; }
    // Raqam botga yetib borishi uchun bir oz kutamiz va qayta tekshiramiz
    for (let i = 0; i < 6; i++) {
      await sleep(i === 0 ? 800 : 1500);
      if (await telegramLogin()) return;
    }
    setHint("Raqam hali yetib kelmadi. Bir oz kutib, «Qayta tekshirish» ni bosing.");
    setBusy(false);
  }

  async function retry() {
    setBusy(true); setHint("");
    await telegramLogin();
    setBusy(false);
  }

  const needPhone = tgState.status === "need_phone";
  const name = tg?.initDataUnsafe?.user?.first_name;

  return (
    <div className="app bare">
      <div className="hero">
        <div className="brand">Vet<span>Chaqiruv</span></div>
        <h1 style={{ marginTop: 24 }}>{needPhone ? `Xush kelibsiz${name ? ", " + name : ""}!` : "Kirish"}</h1>
        {needPhone ? (
          <>
            <p className="lead">
              Hisobingizni ochish uchun Telegram'dagi telefon raqamingizni yuboring. SMS kod kerak emas.
              Raqam veterinar yoki dorixona siz bilan bog'lanishi uchun ham kerak.
            </p>
            <button className="btn primary wide" disabled={busy} onClick={sharePhone}>
              {busy ? "Kutilmoqda…" : "📱 Raqamni yuborish"}
            </button>
          </>
        ) : (
          <>
            <p className="lead">{tgState.error || "Telegram orqali qayta kiring."}</p>
            <button className="btn primary wide" disabled={busy} onClick={retry}>
              {busy ? "Tekshirilmoqda…" : "Telegram orqali kirish"}
            </button>
          </>
        )}
        {hint && <div className="note bad" style={{ marginTop: 12 }}>{hint}</div>}
        {needPhone && busy === false && hint && (
          <button className="btn ghost wide" onClick={retry}>Qayta tekshirish</button>
        )}
        <button className="btn ghost wide" onClick={() => setSms(true)}>SMS kod orqali kirish</button>
      </div>
    </div>
  );
}
