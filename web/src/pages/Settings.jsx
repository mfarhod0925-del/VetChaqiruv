import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { ROLE_HOME, ROLE_NAMES } from "../lib/constants.js";
import { errText, fmtPhone } from "../lib/util.js";
import { inTelegram } from "../lib/telegram.js";
import { useToast } from "../toast.jsx";
import { RegionSelect } from "../ui.jsx";

export default function Settings() {
  const { user, profile, vet, pharmacy, updateProfile, signOut } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ full_name: profile.full_name, region: profile.region, district: profile.district, village: profile.village });
  const [busy, setBusy] = useState(false);
  const [canInstall, setCanInstall] = useState(Boolean(window.__installPrompt));

  useEffect(() => {
    const on = () => setCanInstall(true);
    window.addEventListener("installable", on);
    return () => window.removeEventListener("installable", on);
  }, []);

  async function save() {
    if (f.full_name.trim().length < 2) { toast("Ismingizni kiriting"); return; }
    setBusy(true);
    try { await updateProfile({ ...f, full_name: f.full_name.trim(), village: f.village.trim() }); toast("Saqlandi"); }
    catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  async function switchRole(role) {
    if (role === profile.role) return;
    try {
      await updateProfile({ role });
      if (role === "vet" && !vet) { toast("Veterinar profilini to'ldiring"); nav("/vet-profile"); return; }
      if (role === "pharmacy" && !pharmacy) { toast("Dorixona ma'lumotlarini kiriting"); nav("/pharmacy-profile"); return; }
      nav(ROLE_HOME[role]);
    } catch (e) { toast(errText(e)); }
  }

  async function install() {
    const p = window.__installPrompt;
    if (!p) return;
    p.prompt();
    await p.userChoice.catch(() => {});
    window.__installPrompt = null;
    setCanInstall(false);
  }

  return (
    <>
      <h1>Sozlamalar</h1>
      <p className="lead">{fmtPhone(user?.phone)}</p>

      <span className="label">Rol</span>
      <div className="seg">
        {Object.entries(ROLE_NAMES).map(([k, t]) => (
          <button key={k} aria-pressed={profile.role === k} onClick={() => switchRole(k)}>{t}</button>
        ))}
      </div>
      <p className="meta">Bitta raqam bilan bir nechta rolda ishlash mumkin, masalan veterinar o'z hayvoni uchun ariza bera oladi.</p>

      <h2>Shaxsiy ma'lumotlar</h2>
      <label className="label" htmlFor="stName">Ism-familiya</label>
      <input id="stName" type="text" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
      <RegionSelect idPrefix="st" region={f.region} district={f.district} onChange={(region, district) => setF({ ...f, region, district })} />
      <label className="label" htmlFor="stVillage">Qishloq, mahalla</label>
      <input id="stVillage" type="text" value={f.village} onChange={(e) => setF({ ...f, village: e.target.value })} />
      <button className="btn primary wide" disabled={busy} onClick={save}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>

      {inTelegram && (
        <>
          <h2>Telegram</h2>
          <p className="meta">Ilova Telegram bot orqali ochilgan. Ariza va buyurtmalar haqidagi xabarlar bot chatiga keladi.
            Xabarlarni o'chirish yoki raqamni almashtirish uchun botga /bildirishnoma yoki /raqam deb yozing.</p>
        </>
      )}

      {canInstall && !inTelegram && (
        <>
          <h2>Ilovani o'rnatish</h2>
          <p className="meta">Telefon ekraniga belgi qo'shiladi, ilova oddiy ilova kabi ochiladi.</p>
          <button className="btn dark wide" onClick={install}>Telefonga o'rnatish</button>
        </>
      )}

      <h2>Hisob</h2>
      <button className="btn danger wide" onClick={signOut}>Chiqish</button>
    </>
  );
}
