import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { uploadPhoto } from "../../lib/photos.js";
import { ANIMALS, SYMPTOMS, URGENCY, VET_STATUS } from "../../lib/constants.js";
import { errText, getPosition, localPhoneInput, phoneDigits, phoneE164 } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { Avatar, Icon, Pill, RawIcon } from "../../ui.jsx";
import RegionBar, { useArea } from "./RegionBar.jsx";

const DRAFT_KEY = "vc_draft";
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } };

export default function NewCase() {
  const { uid, profile, updateProfile } = useAuth();
  const { region, district } = useArea();
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const draft = loadDraft();

  const [f, setF] = useState({
    animal: draft.animal || "sigir", count: draft.count || 1, sym: draft.sym || [], urg: draft.urg || "bugun",
    kind: draft.kind || "call", note: draft.note || "",
    name: profile.full_name || "", phone: localPhoneInput(profile.phone || ""), village: profile.village || "",
  });
  const [geo, setGeo] = useState(null);
  const [photo, setPhoto] = useState(null); // {path, preview}
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pick, setPick] = useState(false);
  const target = params.get("vet");
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ animal: f.animal, count: f.count, sym: f.sym, urg: f.urg, kind: f.kind, note: f.note })); } catch { /* yo'q */ }
  }, [f.animal, f.count, f.sym, f.urg, f.kind, f.note]);

  const vets = useLive(
    async () => must(await supabase.from("vets").select("id, full_name, village, status, specs, experience").eq("region", region).eq("district", district).order("full_name")),
    [region, district], [{ table: "vets" }],
  );
  const vs = vets.data || [];
  const online = vs.filter((v) => v.status === "online").length;
  const targetVet = vs.find((v) => v.id === target);

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadPhoto(uid, file);
      setPhoto({ path, preview: URL.createObjectURL(file) });
    } catch (err) { toast(errText(err)); }
    setUploading(false);
  }

  async function addGeo() {
    try { setGeo(await getPosition()); toast("Joylashuv qo'shildi"); } catch (e) { toast(e.message); }
  }

  async function submit() {
    if (!f.sym.length && !f.note.trim()) { toast("Kamida bitta alomatni belgilang yoki izoh yozing"); return; }
    if (f.name.trim().length < 2) { toast("Ismingizni kiriting"); return; }
    if (!phoneDigits(f.phone)) { toast("Telefon raqamini to'liq kiriting"); return; }
    setBusy(true);
    try {
      const row = must(await supabase.from("cases").insert({
        farmer_id: uid, vet_id: targetVet ? targetVet.id : null, region, district,
        animal: f.animal, animal_count: Math.max(1, +f.count || 1), symptoms: f.sym, urgency: f.urg, kind: f.kind,
        note: f.note.trim(), contact_name: f.name.trim(), phone: phoneE164(f.phone), village: f.village.trim(),
        lat: geo?.lat ?? null, lng: geo?.lng ?? null, photo_path: photo?.path ?? null,
      }).select("id").single());
      if (!profile.village && f.village.trim()) updateProfile({ village: f.village.trim() }).catch(() => {});
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* yo'q */ }
      toast("Ariza yuborildi");
      nav(`/case/${row.id}`);
    } catch (e) {
      toast(errText(e));
    }
    setBusy(false);
  }

  if (pick) {
    return (
      <>
        <button className="linkbtn" onClick={() => setPick(false)}>← Arizaga qaytish</button>
        <h1>Veterinarni tanlang</h1>
        <div className="list">
          <div className={`card pick ${!targetVet ? "sel" : ""}`} onClick={() => { setParams({}); setPick(false); }}>
            <b>Tumandagi barcha veterinarlarga</b><div className="meta">Birinchi qabul qilgan veterinar keladi</div>
          </div>
          {vs.map((v) => (
            <div key={v.id} className={`card pick ${target === v.id ? "sel" : ""}`} onClick={() => { setParams({ vet: v.id }); setPick(false); }}>
              <div className="person"><Avatar name={v.full_name} status={v.status} />
                <div><h3>{v.full_name}</h3><div className="meta">{v.village}{v.experience ? ` · ${v.experience} yil tajriba` : ""}</div>
                  <div className="tags"><Pill s={VET_STATUS[v.status]} />{(v.specs || []).map((s) => <span key={s} className="pill">{s}</span>)}</div></div>
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
      <h1>Hayvoningiz kasalmi?</h1>
      <p className="lead">Ariza {district} tumanidagi veterinarlarga boradi.</p>

      <span className="label">Hayvon turi</span>
      <div className="animals">
        {ANIMALS.map((a) => (
          <button key={a.id} className="animal" aria-pressed={f.animal === a.id} onClick={() => set({ animal: a.id })}>
            <RawIcon paths={a.p} />{a.n}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <label htmlFor="ncCount" className="meta grow" style={{ margin: 0 }}>Nechta hayvon kasal?</label>
        <input id="ncCount" className="qty" type="number" min="1" max="10000" value={f.count} onChange={(e) => set({ count: e.target.value })} />
      </div>

      <span className="label">Alomatlar</span>
      <div className="chips">
        {SYMPTOMS.map((s) => (
          <button key={s} className="chip" aria-pressed={f.sym.includes(s)}
            onClick={() => set({ sym: f.sym.includes(s) ? f.sym.filter((x) => x !== s) : [...f.sym, s] })}>{s}</button>
        ))}
      </div>

      <span className="label">Qanchalik tezkor?</span>
      <div className="seg">
        {Object.entries(URGENCY).map(([k, [t, tone]]) => (
          <button key={k} className={`t-${tone}`} aria-pressed={f.urg === k} onClick={() => set({ urg: k })}>{t}</button>
        ))}
      </div>

      <span className="label">Yordam turi</span>
      <div className="seg" style={{ "--n": 2 }}>
        <button aria-pressed={f.kind === "call"} onClick={() => set({ kind: "call" })}>Fermaga chaqirish</button>
        <button aria-pressed={f.kind === "video"} onClick={() => set({ kind: "video" })}>Video maslahat</button>
      </div>

      <label className="label" htmlFor="ncNote">Izoh</label>
      <textarea id="ncNote" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Masalan: 2 kundan beri yemayapti, burni quruq" />

      <div className="stack" style={{ marginTop: 8 }}>
        {photo ? (
          <>
            <img className="thumb" src={photo.preview} alt="Hayvon rasmi" />
            <button className="btn ghost sm" onClick={() => setPhoto(null)}>Rasmni olib tashlash</button>
          </>
        ) : (
          <label className="file">
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} disabled={uploading} />
            <Icon name="cam" /><span>{uploading ? "Yuklanmoqda…" : "Rasm qo'shish (ixtiyoriy)"}</span>
          </label>
        )}
        {geo ? (
          <div className="row"><span className="pill ok">Joylashuv qo'shildi</span><button className="linkbtn" onClick={() => setGeo(null)}>Olib tashlash</button></div>
        ) : (
          <button className="btn ghost sm" onClick={addGeo}><Icon name="pin" size={18} />Joylashuvimni qo'shish</button>
        )}
      </div>

      <span className="label">Aloqa ma'lumotlari</span>
      <div className="stack">
        <input type="text" aria-label="Ismingiz" placeholder="Ismingiz" autoComplete="name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        <div className="phonein"><span>+998</span>
          <input type="tel" aria-label="Telefon" inputMode="numeric" placeholder="90 123 45 67" value={f.phone} onChange={(e) => set({ phone: localPhoneInput(e.target.value) })} />
        </div>
        <input type="text" aria-label="Qishloq" placeholder="Qishloq / mahalla, mo'ljal" value={f.village} onChange={(e) => set({ village: e.target.value })} />
      </div>

      <span className="label">Kimga yuborilsin?</span>
      <div className="card">
        {targetVet ? (
          <><b>{targetVet.full_name}</b><div className="meta">Faqat shu veterinarga yuboriladi</div></>
        ) : (
          <><b>Tumandagi barcha veterinarlarga</b>
            <div className="meta">{vets.loading ? "Yuklanmoqda…" : vs.length ? `${vs.length} ta veterinar, hozir ${online} tasi bo'sh` : "Bu tumanda hali ro'yxatdan o'tgan veterinar yo'q"}</div></>
        )}
        {vs.length > 0 && <button className="linkbtn" onClick={() => setPick(true)}>{targetVet ? "O'zgartirish" : "Aniq veterinarni tanlash"}</button>}
      </div>
      {!vets.loading && vs.length === 0 && (
        <div className="note">Ariza saqlanadi. Tumanda veterinar ro'yxatdan o'tishi bilan u arizani ko'radi. Qo'shni tumanni ham tanlab ko'rishingiz mumkin.</div>
      )}

      <div className="sticky-cta">
        <button className="btn primary wide" style={{ marginTop: 0 }} disabled={busy || uploading} onClick={submit}>
          {busy ? "Yuborilmoqda…" : "Arizani yuborish"}
        </button>
      </div>
    </>
  );
}
