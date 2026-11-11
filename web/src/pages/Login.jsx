import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { errText, fmtPhone, localPhoneInput, phoneE164 } from "../lib/util.js";

export default function Login() {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const e164 = phoneE164(phone);

  async function sendCode(e) {
    e?.preventDefault();
    if (!e164) { setErr("Telefon raqamini to'liq kiriting: 90 123 45 67"); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    setStep("code"); setCode(""); setWait(60);
  }

  async function verify(e) {
    e?.preventDefault();
    if (code.length !== 6) { setErr("6 xonali kodni kiriting"); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: "sms" });
    setBusy(false);
    if (error) setErr(errText(error));
  }

  return (
    <div className="app bare">
      <div className="hero">
        <div className="brand">Vet<span>Chaqiruv</span></div>
        <h1 style={{ marginTop: 24 }}>Hayvoningizga tez yordam</h1>
        <p className="lead">Tumaningizdagi veterinarni chaqiring, video maslahat oling va kerakli dori qaysi dorixonada borligini biling.</p>

        {step === "phone" ? (
          <form onSubmit={sendCode}>
            <label className="label" htmlFor="phone">Telefon raqamingiz</label>
            <div className="phonein">
              <span>+998</span>
              <input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="90 123 45 67"
                value={phone} onChange={(e) => setPhone(localPhoneInput(e.target.value))} autoFocus />
            </div>
            {err && <div className="note bad">{err}</div>}
            <button className="btn primary wide" disabled={busy}>{busy ? "Yuborilmoqda…" : "SMS kod olish"}</button>
            <p className="meta" style={{ marginTop: 12 }}>Raqamingizga 6 xonali tasdiqlash kodi yuboriladi.</p>
          </form>
        ) : (
          <form onSubmit={verify}>
            <label className="label" htmlFor="code">{fmtPhone(e164)} raqamiga yuborilgan kod</label>
            <input id="code" className="otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
            {err && <div className="note bad">{err}</div>}
            <button className="btn primary wide" disabled={busy || code.length !== 6}>{busy ? "Tekshirilmoqda…" : "Kirish"}</button>
            <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <button type="button" className="linkbtn" onClick={() => { setStep("phone"); setErr(""); }}>Raqamni o'zgartirish</button>
              <button type="button" className="linkbtn" disabled={wait > 0 || busy} onClick={sendCode}>
                {wait > 0 ? `Qayta yuborish (${wait})` : "Kodni qayta yuborish"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
