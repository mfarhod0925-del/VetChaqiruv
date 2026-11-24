import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { DEFAULT_REGION, KIND_NAMES, REGIONS, SERVICES, SPECS } from "../../lib/constants.js";
import { errText, localPhoneInput, phoneDigits, phoneE164 } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ConfirmButton, Icon, RegionSelect } from "../../ui.jsx";

/** Veterinar yoki usta (urug'lantirish texnigi, jun qirquvchi, qassob) profili */
export default function VetProfile() {
  const { uid, user, profile, vet, reload, updateProfile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const region0 = vet?.region || profile.region || DEFAULT_REGION;
  const kind0 = profile.role === "master" || profile.role === "vet" ? profile.role : (vet?.kind || "vet");
  const [f, setF] = useState({
    kind: kind0,
    full_name: vet?.full_name || profile.full_name || "",
    phone: localPhoneInput(vet?.phone || user?.phone || ""),
    region: region0,
    district: vet?.district || profile.district || REGIONS[region0]?.[0],
    village: vet?.village || profile.village || "",
    experience: vet?.experience ?? "",
    specs: vet?.specs || [],
    services: (vet?.services || []).filter((x) => SERVICES.some((s) => s.id === x && s.kinds.includes(kind0))).length
      ? vet.services.filter((x) => SERVICES.some((s) => s.id === x && s.kinds.includes(kind0)))
      : (kind0 === "master" ? ["shearing"] : ["treatment"]),
    has_ultrasound: Boolean(vet?.has_ultrasound),
    price_note: vet?.price_note || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const allowed = SERVICES.filter((s) => s.kinds.includes(f.kind));
  const isVet = f.kind === "vet";

  function setKind(kind) {
    const ok = SERVICES.filter((s) => s.kinds.includes(kind)).map((s) => s.id);
    const services = f.services.filter((s) => ok.includes(s));
    set({ kind, services: services.length ? services : [ok[0]] });
  }
  const toggle = (id) => set({ services: f.services.includes(id) ? f.services.filter((x) => x !== id) : [...f.services, id] });

  async function save() {
    if (f.full_name.trim().length < 2) { toast("Ism-familiyani kiriting"); return; }
    if (!phoneDigits(f.phone)) { toast("Telefon raqamini to'liq kiriting"); return; }
    const services = f.services.filter((s) => allowed.some((a) => a.id === s));
    if (!services.length) { toast("Kamida bitta xizmatni tanlang"); return; }
    setBusy(true);
    try {
      must(await supabase.from("vets").upsert({
        id: uid, kind: f.kind, full_name: f.full_name.trim(), phone: phoneE164(f.phone), region: f.region, district: f.district,
        village: f.village.trim(), experience: Math.max(0, Math.min(70, Math.floor(+f.experience || 0))),
        specs: isVet ? f.specs : [], services, has_ultrasound: isVet && services.includes("pregnancy") && f.has_ultrasound,
        price_note: f.price_note.trim().slice(0, 300),
        ...(vet ? {} : { status: "online" }),
      }));
      if (profile.role !== f.kind) await updateProfile({ role: f.kind });
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
      toast("Mutaxassis profili o'chirildi");
      nav("/new");
    } catch (e) { toast(errText(e)); }
  }

  const title = vet ? `${KIND_NAMES[f.kind]} profili` : "Mutaxassis sifatida ro'yxatdan o'tish";
  return (
    <>
      <h1>{title}</h1>
      <p className="lead">Bu ma'lumotlar tumaningizdagi chorvadorlarga ko'rinadi. Arizalar faqat siz tanlagan xizmatlar bo'yicha keladi.</p>

      <span className="label">Kimsiz?</span>
      <div className="seg" style={{ "--n": 2 }}>
        <button aria-pressed={f.kind === "vet"} onClick={() => setKind("vet")}>Veterinar</button>
        <button aria-pressed={f.kind === "master"} onClick={() => setKind("master")}>Usta</button>
      </div>
      <div className="meta">{isVet ? "Davolash va homiladorlik tekshiruvi faqat veterinarlar uchun." : "Urug'lantirish texnigi, jun qirquvchi yoki qassob."}</div>

      <span className="label">Qaysi xizmatlarni ko'rsatasiz?</span>
      <div className="services">
        {allowed.map((s) => (
          <button key={s.id} className="service" aria-pressed={f.services.includes(s.id)} onClick={() => toggle(s.id)}>
            <Icon name={s.icon} size={22} /><b>{s.n}</b><span>{s.d}</span>
          </button>
        ))}
      </div>
      {isVet && f.services.includes("pregnancy") && (
        <label className="check">
          <input type="checkbox" checked={f.has_ultrasound} onChange={(e) => set({ has_ultrasound: e.target.checked })} />
          <span>Menda UZI (ultratovush) apparati bor</span>
        </label>
      )}

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
      <label className="label" htmlFor="vpPrice">Narxlar (ixtiyoriy)</label>
      <textarea id="vpPrice" maxLength={300} value={f.price_note} onChange={(e) => set({ price_note: e.target.value })}
        placeholder={isVet ? "Masalan: chaqiruv — kelishiladi, UZI tekshiruv — ..." : "Masalan: qirqim — bosh boshiga ..., so'yish — ..."} />
      {isVet && (
        <>
          <span className="label">Mutaxassislik</span>
          <div className="chips">
            {SPECS.map((s) => (
              <button key={s} className="chip" aria-pressed={f.specs.includes(s)}
                onClick={() => set({ specs: f.specs.includes(s) ? f.specs.filter((x) => x !== s) : [...f.specs, s] })}>{s}</button>
            ))}
          </div>
        </>
      )}
      <button className="btn primary wide" disabled={busy} onClick={save}>{busy ? "Saqlanmoqda…" : vet ? "Saqlash" : "Ro'yxatdan o'tish"}</button>
      {vet && <ConfirmButton confirmText="Ha, o'chirish" onConfirm={remove}>Mutaxassis profilini o'chirish</ConfirmButton>}
    </>
  );
}
