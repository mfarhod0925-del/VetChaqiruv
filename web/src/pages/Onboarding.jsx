import { useState } from "react";
import { useAuth } from "../auth.jsx";
import { supabase, must } from "../lib/supabase.js";
import { DEFAULT_REGION, REGIONS } from "../lib/constants.js";
import { errText, fmtPhone } from "../lib/util.js";
import { Icon, RegionSelect } from "../ui.jsx";

const ROLES = [
  ["farmer", "farm", "Chorvadorman", "Hayvonim uchun veterinar va dori kerak"],
  ["vet", "vet", "Veterinarman", "Chaqiruvlarni qabul qilaman, maslahat beraman"],
  ["pharmacy", "pharm", "Vet-dorixonaman", "Dorilar qoldig'ini ko'rsataman, buyurtma olaman"],
];

export default function Onboarding() {
  const { uid, user, profile, reload, signOut } = useAuth();
  const [role, setRole] = useState(profile?.role || "farmer");
  const [name, setName] = useState(profile?.full_name || "");
  const [region, setRegion] = useState(profile?.region || DEFAULT_REGION);
  const [district, setDistrict] = useState(profile?.district || REGIONS[DEFAULT_REGION][0]);
  const [village, setVillage] = useState(profile?.village || "");
  const [phName, setPhName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const phone = "+" + String(user?.phone || profile?.phone || "").replace(/\D/g, "");

  async function save(e) {
    e.preventDefault();
    if (name.trim().length < 2) { setErr("Ism-familiyangizni kiriting"); return; }
    if (role === "pharmacy" && (phName.trim().length < 2 || address.trim().length < 2)) { setErr("Dorixona nomi va manzilini kiriting"); return; }
    setBusy(true); setErr("");
    try {
      if (role === "vet") {
        must(await supabase.from("vets").upsert({
          id: uid, full_name: name.trim(), phone, region, district, village: village.trim(), status: "online",
        }));
      }
      if (role === "pharmacy") {
        must(await supabase.from("pharmacies").upsert({
          id: uid, name: phName.trim(), phone, region, district, address: address.trim(), hours: "08:00–18:00",
        }));
      }
      must(await supabase.from("profiles").update({
        role, full_name: name.trim(), region, district, village: village.trim(),
      }).eq("id", uid));
      await reload();
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app bare">
      <div className="hero" style={{ paddingTop: 24 }}>
        <div className="brand">Vet<span>Chaqiruv</span></div>
        <h1 style={{ marginTop: 18 }}>Xush kelibsiz!</h1>
        <p className="lead">{fmtPhone(phone)} · Ilovadan kim sifatida foydalanasiz?</p>
        <form onSubmit={save}>
          <div className="rolecards">
            {ROLES.map(([k, ic, t, d]) => (
              <button type="button" key={k} className="rolecard" aria-pressed={role === k} onClick={() => setRole(k)}>
                <Icon name={ic} size={30} /><div><b>{t}</b><span>{d}</span></div>
              </button>
            ))}
          </div>
          <label className="label" htmlFor="obName">Ism-familiya</label>
          <input id="obName" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Alisher Karimov" />
          <RegionSelect idPrefix="ob" region={region} district={district} onChange={(r, d) => { setRegion(r); setDistrict(d); }} />
          <label className="label" htmlFor="obVillage">{role === "vet" ? "Ish joyi / qishloq" : "Qishloq, mahalla"}</label>
          <input id="obVillage" type="text" value={village} onChange={(e) => setVillage(e.target.value)} placeholder="Masalan: Qorako'l qishlog'i" />
          {role === "pharmacy" && (
            <>
              <label className="label" htmlFor="obPh">Dorixona nomi</label>
              <input id="obPh" type="text" value={phName} onChange={(e) => setPhName(e.target.value)} placeholder="Masalan: Agrovet dorixonasi" />
              <label className="label" htmlFor="obAddr">Dorixona manzili</label>
              <input id="obAddr" type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Masalan: Urgut bozori yonida" />
            </>
          )}
          {err && <div className="note bad">{err}</div>}
          <button className="btn primary wide" disabled={busy}>{busy ? "Saqlanmoqda…" : "Davom etish"}</button>
          <button type="button" className="btn ghost wide" onClick={signOut}>Chiqish</button>
        </form>
      </div>
    </div>
  );
}
