import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { SALE_ANIMALS, SERVICES, VET_STATUS } from "../../lib/constants.js";
import { errText, getPosition, localPhoneInput, phoneDigits, phoneE164, todayIso } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { Avatar, Icon, Pill, RawIcon } from "../../ui.jsx";
import RegionBar, { useArea } from "./RegionBar.jsx";

const HINT = {
  jun: "Bahor va yoz boshida, havo isiganda qirqtiring. Qirqishdan 12 soat oldin och qoldiring, jun quruq bo'lsin.",
  qassob: "So'yishdan 12–24 soat oldin ozuqa bermang, suv bering. Kasal hayvonni so'yishdan oldin veterinarga ko'rsating.",
  urug: "Sigir kuyikish boshlanganidan 12–18 soat o'tib urug'lantiriladi. Kuyikish belgilarini ko'rgan vaqtingizni izohda yozing.",
  homila: "Sigirda urug'lantirishdan 35–60 kun, qo'y-echkida 30–45 kun o'tib tekshirish ma'qul.",
};

export default function NewOrder() {
  const { uid, profile } = useAuth();
  const { region, district } = useArea();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const service = SERVICES[params.get("s")] ? params.get("s") : null;
  const svc = SERVICES[service];
  const animalsAllowed = svc ? SALE_ANIMALS.filter((a) => svc.animals.includes(a.id)) : [];
  const preAnimal = params.get("animal");

  const [f, setF] = useState({
    animal: animalsAllowed[0]?.id || "sigir", count: 1, animal_id: preAnimal || "", date: todayIso(), note: "",
    name: profile.full_name || "", phone: localPhoneInput(profile.phone || ""), village: profile.village || "",
  });
  const [target, setTarget] = useState(null);
  const [pick, setPick] = useState(false);
  const [geo, setGeo] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  const masters = useLive(
    async () => (service ? must(await supabase.from("masters").select("id, full_name, village, status, services, experience, about")
      .eq("region", region).eq("district", district).contains("services", [service]).order("full_name")) : []),
    [region, district, service], [{ table: "masters" }],
  );
  const withCalendar = service === "urug" || service === "homila";
  const myAnimals = useLive(
    async () => (withCalendar ? must(await supabase.from("animals").select("id, kind, name, tag").eq("farmer_id", uid).order("name")) : []),
    [uid, withCalendar],
  );

  // Taqvimdan kelgan hayvon: turini avtomatik qo'yamiz
  const chosen = (myAnimals.data || []).find((a) => a.id === f.animal_id);
  const animal = chosen ? chosen.kind : f.animal;

  if (!svc) {
    return (
      <>
        <RegionBar />
        <h1>Qaysi usta kerak?</h1>
        <div className="list">
          {Object.entries(SERVICES).map(([k, s]) => (
            <Link key={k} className="card row" to={`/order/new?s=${k}`}>
              <span className="svc-ic"><Icon name={s.icon} /></span>
              <div className="grow"><h3>{s.n}</h3><div className="meta">{s.d}</div></div>
            </Link>
          ))}
        </div>
      </>
    );
  }

  const ms = masters.data || [];
  const online = ms.filter((m) => m.status === "online").length;

  async function addGeo() {
    try { setGeo(await getPosition()); toast("Joylashuv qo'shildi"); } catch (e) { toast(e.message); }
  }

  async function submit() {
    if (f.name.trim().length < 2) { toast("Ismingizni kiriting"); return; }
    if (!phoneDigits(f.phone)) { toast("Telefon raqamini to'liq kiriting"); return; }
    setBusy(true);
    try {
      const row = must(await supabase.from("service_orders").insert({
        farmer_id: uid, master_id: target?.id ?? null, service, region, district,
        animal, animal_count: Math.max(1, Math.floor(+f.count || 1)), animal_id: chosen?.id ?? null,
        preferred_date: f.date || null, note: f.note.trim(),
        contact_name: f.name.trim(), phone: phoneE164(f.phone), village: f.village.trim(),
        lat: geo?.lat ?? null, lng: geo?.lng ?? null,
      }).select("id").single());
      toast("Buyurtma yuborildi");
      nav(`/order/${row.id}`);
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  if (pick) {
    return (
      <>
        <button className="linkbtn" onClick={() => setPick(false)}>← Buyurtmaga qaytish</button>
        <h1>Ustani tanlang</h1>
        <div className="list">
          <div className={`card pick ${!target ? "sel" : ""}`} onClick={() => { setTarget(null); setPick(false); }}>
            <b>Tumandagi barcha ustalarga</b><div className="meta">Birinchi qabul qilgan usta keladi</div>
          </div>
          {ms.map((m) => (
            <div key={m.id} className={`card pick ${target?.id === m.id ? "sel" : ""}`} onClick={() => { setTarget(m); setPick(false); }}>
              <div className="person"><Avatar name={m.full_name} status={m.status} />
                <div><h3>{m.full_name}</h3>
                  <div className="meta">{m.village}{m.experience ? ` · ${m.experience} yil tajriba` : ""}</div>
                  {m.about && <div className="meta">{m.about}</div>}
                  <div className="tags"><Pill s={VET_STATUS[m.status]} /></div></div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <RegionBar />
      <Link className="linkbtn" to="/services">← Xizmatlar</Link>
      <h1>{svc.n}</h1>
      <p className="lead">Buyurtma {district} tumanidagi ustalarga boradi.</p>
      <div className="note info">{HINT[service]}</div>

      {withCalendar && (myAnimals.data || []).length > 0 && (
        <>
          <label className="label" htmlFor="noAnimal">Taqvimdagi hayvon</label>
          <select id="noAnimal" className="field" value={f.animal_id} onChange={(e) => set({ animal_id: e.target.value })}>
            <option value="">— Tanlanmagan —</option>
            {(myAnimals.data || []).filter((a) => svc.animals.includes(a.kind)).map((a) => (
              <option key={a.id} value={a.id}>{a.name}{a.tag ? ` (${a.tag})` : ""}</option>
            ))}
          </select>
          <div className="meta">Tanlasangiz, usta ishni bajargach natija taqvimga o'zi yoziladi va eslatmalar keladi.</div>
        </>
      )}

      {!chosen && (
        <>
          <span className="label">Hayvon turi</span>
          <div className="animals" style={{ "--cols": animalsAllowed.length }}>
            {animalsAllowed.map((a) => (
              <button key={a.id} className="animal" aria-pressed={f.animal === a.id} onClick={() => set({ animal: a.id })}>
                <RawIcon paths={a.p} />{a.n}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label htmlFor="noCount" className="meta grow" style={{ margin: 0 }}>Necha bosh?</label>
            <input id="noCount" className="qty" type="number" min="1" max="10000" value={f.count} onChange={(e) => set({ count: e.target.value })} />
          </div>
        </>
      )}

      <label className="label" htmlFor="noDate">Qaysi kuni kerak?</label>
      <input id="noDate" type="date" min={todayIso()} value={f.date} onChange={(e) => set({ date: e.target.value })} />

      <label className="label" htmlFor="noNote">Izoh</label>
      <textarea id="noNote" value={f.note} onChange={(e) => set({ note: e.target.value })}
        placeholder={service === "qassob" ? "Masalan: 1 ta buqa, go'shtni bo'laklab berish kerak" : "Qo'shimcha ma'lumot"} />

      <div className="stack" style={{ marginTop: 8 }}>
        {geo ? (
          <div className="row"><span className="pill ok">Joylashuv qo'shildi</span><button className="linkbtn" onClick={() => setGeo(null)}>Olib tashlash</button></div>
        ) : (
          <button className="btn ghost sm" onClick={addGeo}><Icon name="pin" size={18} />Joylashuvimni qo'shish</button>
        )}
      </div>

      <span className="label">Aloqa ma'lumotlari</span>
      <div className="stack">
        <input type="text" aria-label="Ismingiz" placeholder="Ismingiz" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        <div className="phonein"><span>+998</span>
          <input type="tel" aria-label="Telefon" inputMode="numeric" placeholder="90 123 45 67" value={f.phone} onChange={(e) => set({ phone: localPhoneInput(e.target.value) })} />
        </div>
        <input type="text" aria-label="Qishloq" placeholder="Qishloq / mahalla, mo'ljal" value={f.village} onChange={(e) => set({ village: e.target.value })} />
      </div>

      <span className="label">Kimga yuborilsin?</span>
      <div className="card">
        {target ? (
          <><b>{target.full_name}</b><div className="meta">Faqat shu ustaga yuboriladi</div></>
        ) : (
          <><b>Tumandagi barcha ustalarga</b>
            <div className="meta">{masters.loading ? "Yuklanmoqda…" : ms.length ? `${ms.length} ta usta, hozir ${online} tasi bo'sh` : "Bu tumanda hali bu xizmat ustasi ro'yxatdan o'tmagan"}</div></>
        )}
        {ms.length > 0 && <button className="linkbtn" onClick={() => setPick(true)}>{target ? "O'zgartirish" : "Aniq ustani tanlash"}</button>}
      </div>
      {!masters.loading && ms.length === 0 && (
        <div className="note">Buyurtma saqlanadi. Tumanda usta ro'yxatdan o'tishi bilan u buyurtmani ko'radi. Qo'shni tumanni ham tanlab ko'rishingiz mumkin.</div>
      )}

      <div className="sticky-cta">
        <button className="btn primary wide" style={{ marginTop: 0 }} disabled={busy} onClick={submit}>
          {busy ? "Yuborilmoqda…" : "Buyurtma berish"}
        </button>
      </div>
    </>
  );
}
