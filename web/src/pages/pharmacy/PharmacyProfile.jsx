import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { DEFAULT_REGION, REGIONS } from "../../lib/constants.js";
import { errText, getPosition, localPhoneInput, phoneE164 } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ConfirmButton, Icon, RegionSelect } from "../../ui.jsx";

export default function PharmacyProfile() {
  const { uid, user, profile, pharmacy, reload, updateProfile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const region0 = pharmacy?.region || profile.region || DEFAULT_REGION;
  const [f, setF] = useState({
    name: pharmacy?.name || "",
    phone: localPhoneInput(pharmacy?.phone || user?.phone || ""),
    region: region0,
    district: pharmacy?.district || profile.district || REGIONS[region0]?.[0],
    address: pharmacy?.address || "",
    hours: pharmacy?.hours || "08:00–18:00",
    lat: pharmacy?.lat ?? null,
    lng: pharmacy?.lng ?? null,
  });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  async function save() {
    if (f.name.trim().length < 2 || f.address.trim().length < 2) { toast("Nom va manzilni kiriting"); return; }
    setBusy(true);
    try {
      must(await supabase.from("pharmacies").upsert({
        id: uid, name: f.name.trim(), phone: phoneE164(f.phone) || "", region: f.region, district: f.district,
        address: f.address.trim(), hours: f.hours.trim(), lat: f.lat, lng: f.lng,
      }));
      if (profile.role !== "pharmacy") await updateProfile({ role: "pharmacy" });
      await reload();
      toast(pharmacy ? "Saqlandi" : "Dorixona ro'yxatdan o'tdi. Endi qoldiqni kiriting.");
      if (!pharmacy) nav("/stock");
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  async function remove() {
    try {
      must(await supabase.from("pharmacies").delete().eq("id", uid));
      await updateProfile({ role: "farmer" });
      await reload();
      toast("Dorixona o'chirildi");
      nav("/new");
    } catch (e) { toast(errText(e)); }
  }

  return (
    <>
      <h1>{pharmacy ? "Dorixona profili" : "Dorixonani ro'yxatdan o'tkazish"}</h1>
      <p className="lead">Chorvadorlar dori qidirganda dorixonangiz ko'rinadi.</p>
      <label className="label" htmlFor="ppName">Dorixona nomi</label>
      <input id="ppName" type="text" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Masalan: Agrovet dorixonasi" />
      <label className="label" htmlFor="ppPhone">Telefon</label>
      <div className="phonein"><span>+998</span>
        <input id="ppPhone" type="tel" inputMode="numeric" value={f.phone} onChange={(e) => set({ phone: localPhoneInput(e.target.value) })} placeholder="90 123 45 67" />
      </div>
      <RegionSelect idPrefix="pp" region={f.region} district={f.district} onChange={(region, district) => set({ region, district })} />
      <label className="label" htmlFor="ppAddr">Manzil</label>
      <input id="ppAddr" type="text" value={f.address} onChange={(e) => set({ address: e.target.value })} placeholder="Masalan: Urgut bozori yonida" />
      <label className="label" htmlFor="ppHours">Ish vaqti</label>
      <input id="ppHours" type="text" value={f.hours} onChange={(e) => set({ hours: e.target.value })} />
      <div className="row" style={{ marginTop: 10 }}>
        {f.lat ? <span className="pill ok">Xaritadagi joy saqlangan</span> : <span className="meta grow">Xaritadagi joy (ixtiyoriy)</span>}
        <button className="btn ghost sm" onClick={async () => { try { set(await getPosition()); toast("Joylashuv olindi. Saqlashni bosing."); } catch (e) { toast(e.message); } }}>
          <Icon name="pin" size={18} />{f.lat ? "Yangilash" : "Hozirgi joyni olish"}
        </button>
      </div>
      <button className="btn primary wide" disabled={busy} onClick={save}>{busy ? "Saqlanmoqda…" : pharmacy ? "Saqlash" : "Ro'yxatdan o'tish"}</button>
      {pharmacy && <ConfirmButton confirmText="Ha, o'chirish" onConfirm={remove}>Dorixonani o'chirish</ConfirmButton>}
    </>
  );
}
