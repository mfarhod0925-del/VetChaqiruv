import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { uploadPhoto } from "../../lib/photos.js";
import { LISTING_STATUS, SALE_ANIMALS, saleAnimalName } from "../../lib/constants.js";
import { ago, errText, parseSom, som, somInput } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ErrorNote, Icon, Loading, Pill, RawIcon } from "../../ui.jsx";
import RegionBar, { useArea } from "./RegionBar.jsx";

export function ListingCard({ l, showOwner }) {
  const offers = l.offers || [];
  const pending = offers.filter((o) => o.status === "pending");
  const best = offers.reduce((m, o) => (o.status !== "withdrawn" && o.price > m ? o.price : m), 0);
  return (
    <Link className="card" to={`/listing/${l.id}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <h3>{saleAnimalName(l.animal)} · {l.head_count} bosh{l.weight_kg ? ` · ~${l.weight_kg} kg` : ""}</h3>
          <div className="meta">{l.price ? `So'ralgan narx: ${som(l.price)}` : "Narx: kelishiladi"}</div>
          <div className="meta">
            <span>{showOwner ? `${l.village || ""}${l.village ? ", " : ""}${l.district}` : pending.length ? `${pending.length} ta yangi taklif` : offers.length ? `${offers.length} ta taklif` : "Hali taklif yo'q"}</span>
            <span>{ago(l.created_at)}</span>
          </div>
          {!showOwner && best > 0 && <div className="meta">Eng yuqori taklif: <b style={{ color: "var(--ink)" }}>{som(best)}</b></div>}
        </div>
        <div className="right">
          <Pill s={LISTING_STATUS[l.status]} />
          {!showOwner && pending.length > 0 && <Pill s={[`${pending.length} yangi`, "warn"]} />}
        </div>
      </div>
    </Link>
  );
}

/** Chorvador: chorva sotish e'loni va o'z e'lonlari. */
export default function Sell() {
  const { uid, profile } = useAuth();
  const { region, district } = useArea();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState(false);
  const [f, setF] = useState({ animal: "buqa", count: 1, weight: "", age: "", price: "", note: "", village: profile.village || "" });
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  const mine = useLive(
    async () => must(await supabase.from("listings").select("*, offers(id, price, status)").eq("farmer_id", uid)
      .order("created_at", { ascending: false }).limit(50)),
    [uid], [{ table: "listings", filter: `farmer_id=eq.${uid}` }, { table: "offers" }],
  );
  const buyers = useLive(
    async () => (await supabase.from("masters").select("id", { count: "exact", head: true }).eq("region", region).contains("services", ["qassob"])).count ?? 0,
    [region],
  );

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try { setPhoto({ path: await uploadPhoto(uid, file), preview: URL.createObjectURL(file) }); } catch (err) { toast(errText(err)); }
    setUploading(false);
  }

  async function submit() {
    const count = Math.floor(+f.count || 0);
    if (count < 1) { toast("Bosh sonini kiriting"); return; }
    const weight = f.weight ? Math.floor(+f.weight) : null;
    if (weight !== null && !(weight > 0 && weight <= 2000)) { toast("Vaznni kilogrammda to'g'ri kiriting"); return; }
    setBusy(true);
    try {
      const row = must(await supabase.from("listings").insert({
        farmer_id: uid, region, district, village: f.village.trim(), animal: f.animal, head_count: count,
        weight_kg: weight, age_text: f.age.trim(), price: parseSom(f.price) || null, note: f.note.trim(),
        photo_path: photo?.path ?? null,
      }).select("id").single());
      toast("E'lon joylandi. Qassoblarga xabar ketdi.");
      nav(`/listing/${row.id}`);
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  const list = mine.data || [];

  if (!form) {
    return (
      <>
        <Link className="linkbtn" to="/services">← Xizmatlar</Link>
        <h1>Chorva sotish</h1>
        <p className="lead">E'lon bering — viloyatingizdagi qassoblar narx taklif qiladi. Ma'qul taklifni o'zingiz tanlaysiz.</p>
        <button className="btn primary wide" style={{ marginTop: 0 }} onClick={() => setForm(true)}>+ Yangi e'lon</button>
        <ErrorNote error={mine.error} onRetry={mine.reload} />
        {mine.loading && !mine.data ? <Loading /> : list.length > 0 && (
          <>
            <h2>Mening e'lonlarim</h2>
            <div className="list">{list.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <RegionBar />
      <button className="linkbtn" onClick={() => setForm(false)}>← E'lonlarim</button>
      <h1>Yangi e'lon</h1>
      <p className="lead">{buyers.data ? `${region}da ${buyers.data} ta qassob ro'yxatdan o'tgan.` : "Viloyatda qassob ro'yxatdan o'tishi bilan e'loningizni ko'radi."}</p>

      <span className="label">Hayvon turi</span>
      <div className="animals">
        {SALE_ANIMALS.map((a) => (
          <button key={a.id} className="animal" aria-pressed={f.animal === a.id} onClick={() => set({ animal: a.id })}>
            <RawIcon paths={a.p} />{a.n}
          </button>
        ))}
      </div>
      <div className="grid2">
        <div><label className="label" htmlFor="slCount">Necha bosh</label>
          <input id="slCount" type="number" min="1" max="1000" value={f.count} onChange={(e) => set({ count: e.target.value })} /></div>
        <div><label className="label" htmlFor="slW">Vazni (1 bosh, kg)</label>
          <input id="slW" type="number" min="1" max="2000" value={f.weight} onChange={(e) => set({ weight: e.target.value })} placeholder="taxminan" /></div>
      </div>
      <label className="label" htmlFor="slAge">Yoshi</label>
      <input id="slAge" type="text" maxLength={40} value={f.age} onChange={(e) => set({ age: e.target.value })} placeholder="Masalan: 2 yosh" />
      <label className="label" htmlFor="slPrice">So'ralgan narx, jami (ixtiyoriy)</label>
      <input id="slPrice" type="text" inputMode="numeric" value={f.price} onChange={(e) => set({ price: somInput(e.target.value) })} placeholder="Masalan: 15 000 000" />
      <label className="label" htmlFor="slNote">Izoh</label>
      <textarea id="slNote" maxLength={500} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Zoti, semizligi, qachon olib ketish mumkin" />
      <label className="label" htmlFor="slVillage">Qishloq / mahalla</label>
      <input id="slVillage" type="text" value={f.village} onChange={(e) => set({ village: e.target.value })} />
      <div className="stack" style={{ marginTop: 10 }}>
        {photo ? (
          <>
            <img className="thumb" src={photo.preview} alt="Hayvon rasmi" />
            <button className="btn ghost sm" onClick={() => setPhoto(null)}>Rasmni olib tashlash</button>
          </>
        ) : (
          <label className="file">
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} disabled={uploading} />
            <Icon name="cam" /><span>{uploading ? "Yuklanmoqda…" : "Rasm qo'shish — taklif ko'proq keladi"}</span>
          </label>
        )}
      </div>
      <div className="note info">Telefon raqamingiz qassobga faqat siz uning taklifini qabul qilganingizdan keyin ko'rinadi.</div>
      <div className="sticky-cta">
        <button className="btn primary wide" style={{ marginTop: 0 }} disabled={busy || uploading} onClick={submit}>
          {busy ? "Joylanmoqda…" : "E'lonni joylash"}
        </button>
      </div>
    </>
  );
}
