import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { DEFAULT_REGION, REGIONS, SPECS } from "../../lib/constants.js";
import { errText, localPhoneInput, phoneDigits, phoneE164 } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ConfirmButton, RegionSelect } from "../../ui.jsx";

export default function VetProfile() {
  const { uid, user, profile, vet, reload, updateProfile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const region0 = vet?.region || profile.region || DEFAULT_REGION;
  const [f, setF] = useState({
    full_name: vet?.full_name || profile.full_name || "",
    phone: localPhoneInput(vet?.phone || user?.phone || ""),
    region: region0,
    district: vet?.district || profile.district || REGIONS[region0]?.[0],
    village: vet?.village || profile.village || "",
    experience: vet?.experience ?? "",
    specs: vet?.specs || [],
  });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  async function save() {
    if (f.full_name.trim().length < 2) { toast("Ism-familiyani kiriting"); return; }
    if (!phoneDigits(f.phone)) { toast("Telefon raqamini to'liq kiriting"); return; }
    setBusy(true);
    try {
      must(await supabase.from("vets").upsert({
        id: uid, full_name: f.full_name.trim(), phone: phoneE164(f.phone), region: f.region, district: f.district,
        village: f.village.trim(), experience: Math.max(0, Math.min(70, Math.floor(+f.experience || 0))), specs: f.specs,
        ...(vet ? {} : { status: "online" }),
      }));
      if (profile.role !== "vet") await updateProfile({ role: "vet" });
      await reload();
      toast(vet ? "Profil saqlandi" : "Ro'yxatdan o'tdingiz");
      if (!vet) nav("/inbox");
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  async function remove() {
    try {
      must(await supabase.from("vets").delete().eq("id", uid));
      await updateProfile({ role: "farmer" });
      await reload();
      toast("Veterinar profili o'chirildi");
      nav("/new");
    } catch (e) { toast(errText(e)); }
  }

  return (
    <>
      <h1>{vet ? "Veterinar profili" : "Veterinar sifatida ro'yxatdan o'tish"}</h1>
      <p className="lead">Bu ma'lumotlar tumaningizdagi chorvadorlarga ko'rinadi.</p>
      <label className="label" htmlFor="vpName">Ism-familiya</label>
      <input id="vpName" type="text" value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} placeholder="Masalan: Sherzod Rahimov" />
      <label className="label" htmlFor="vpPhone">Ish telefoni</label>
      <div className="phonein"><span>+998</span>
        <input id="vpPhone" type="tel" inputMode="numeric" value={f.phone} onChange={(e) => set({ phone: localPhoneInput(e.target.value) })} placeholder="90 123 45 67" />
      </div>
      <RegionSelect idPrefix="vp" region={f.region} district={f.district} onChange={(region, district) => set({ region, district })} />
      <label className="label" htmlFor="vpVillage">Ish joyi / qishloq</label>
      <input id="vpVillage" type="text" value={f.village} onChange={(e) => set({ village: e.target.value })} placeholder="Masalan: Qorako'l qishlog'i, vet punkt" />
      <label className="label" htmlFor="vpExp">Tajriba (yil)</label>
      <input id="vpExp" type="number" min="0" max="70" value={f.experience} onChange={(e) => set({ experience: e.target.value })} />
      <span className="label">Mutaxassislik</span>
      <div className="chips">
        {SPECS.map((s) => (
          <button key={s} className="chip" aria-pressed={f.specs.includes(s)}
            onClick={() => set({ specs: f.specs.includes(s) ? f.specs.filter((x) => x !== s) : [...f.specs, s] })}>{s}</button>
        ))}
      </div>
      <button className="btn primary wide" disabled={busy} onClick={save}>{busy ? "Saqlanmoqda…" : vet ? "Saqlash" : "Ro'yxatdan o'tish"}</button>
      {vet && <ConfirmButton confirmText="Ha, o'chirish" onConfirm={remove}>Veterinar profilini o'chirish</ConfirmButton>}
    </>
  );
}
