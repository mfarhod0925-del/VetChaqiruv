import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { DEFAULT_REGION, REGIONS, SERVICES } from "../../lib/constants.js";
import { errText, localPhoneInput, phoneDigits, phoneE164 } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ConfirmButton, Icon, RegionSelect } from "../../ui.jsx";

export default function MasterProfile() {
  const { uid, user, profile, master, reload, updateProfile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const region0 = master?.region || profile.region || DEFAULT_REGION;
  const [f, setF] = useState({
    full_name: master?.full_name || profile.full_name || "",
    phone: localPhoneInput(master?.phone || user?.phone || ""),
    region: region0,
    district: master?.district || profile.district || REGIONS[region0]?.[0],
    village: master?.village || profile.village || "",
    experience: master?.experience ?? "",
    services: master?.services || [],
    about: master?.about || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  async function save() {
    if (f.full_name.trim().length < 2) { toast("Ism-familiyani kiriting"); return; }
    if (!phoneDigits(f.phone)) { toast("Telefon raqamini to'liq kiriting"); return; }
    if (!f.services.length) { toast("Kamida bitta xizmatni belgilang"); return; }
    setBusy(true);
    try {
      must(await supabase.from("masters").upsert({
        id: uid, full_name: f.full_name.trim(), phone: phoneE164(f.phone), region: f.region, district: f.district,
        village: f.village.trim(), experience: Math.max(0, Math.min(70, Math.floor(+f.experience || 0))),
        services: f.services, about: f.about.trim().slice(0, 500),
        ...(master ? {} : { status: "online" }),
      }));
      if (profile.role !== "master") await updateProfile({ role: "master" });
      await reload();
      toast(master ? "Profil saqlandi" : "Ro'yxatdan o'tdingiz");
      if (!master) nav("/jobs");
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  async function remove() {
    try {
      must(await supabase.from("masters").delete().eq("id", uid));
      await updateProfile({ role: "farmer" });
      await reload();
      toast("Usta profili o'chirildi");
      nav("/new");
    } catch (e) { toast(errText(e)); }
  }

  return (
    <>
      <h1>{master ? "Usta profili" : "Usta sifatida ro'yxatdan o'tish"}</h1>
      <p className="lead">Bu ma'lumotlar tumaningizdagi chorvadorlarga ko'rinadi. Tanlagan xizmatlaringiz bo'yicha buyurtmalar keladi.</p>
      <span className="label">Xizmatlar</span>
      <div className="list">
        {Object.entries(SERVICES).map(([k, s]) => (
          <button key={k} type="button" className="rolecard" aria-pressed={f.services.includes(k)}
            onClick={() => set({ services: f.services.includes(k) ? f.services.filter((x) => x !== k) : [...f.services, k] })}>
            <span className="svc-ic" style={{ margin: 0 }}><Icon name={f.services.includes(k) ? "check" : s.icon} /></span>
            <div><b>{s.n}</b><span>{k === "qassob" ? "So'yish buyurtmalari va viloyatdagi chorva e'lonlariga narx taklif qilish" : s.d}</span></div>
          </button>
        ))}
      </div>
      <label className="label" htmlFor="mpName">Ism-familiya</label>
      <input id="mpName" type="text" value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} placeholder="Masalan: Jamshid Usmonov" />
      <label className="label" htmlFor="mpPhone">Ish telefoni</label>
      <div className="phonein"><span>+998</span>
        <input id="mpPhone" type="tel" inputMode="numeric" value={f.phone} onChange={(e) => set({ phone: localPhoneInput(e.target.value) })} placeholder="90 123 45 67" />
      </div>
      <RegionSelect idPrefix="mp" region={f.region} district={f.district} onChange={(region, district) => set({ region, district })} />
      <label className="label" htmlFor="mpVillage">Qishloq / mahalla</label>
      <input id="mpVillage" type="text" value={f.village} onChange={(e) => set({ village: e.target.value })} placeholder="Masalan: Qorako'l qishlog'i" />
      <label className="label" htmlFor="mpExp">Tajriba (yil)</label>
      <input id="mpExp" type="number" min="0" max="70" value={f.experience} onChange={(e) => set({ experience: e.target.value })} />
      <label className="label" htmlFor="mpAbout">O'zingiz haqingizda</label>
      <textarea id="mpAbout" maxLength={500} value={f.about} onChange={(e) => set({ about: e.target.value })}
        placeholder="Masalan: elektr qaychi bilan ishlayman, kuniga 80 bosh qo'y qirqaman" />
      <button className="btn primary wide" disabled={busy} onClick={save}>{busy ? "Saqlanmoqda…" : master ? "Saqlash" : "Ro'yxatdan o'tish"}</button>
      {master && <ConfirmButton confirmText="Ha, o'chirish" onConfirm={remove}>Usta profilini o'chirish</ConfirmButton>}
    </>
  );
}
