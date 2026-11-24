import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { uploadPhoto } from "../../lib/photos.js";
import { ANIMALS, BUTCHER_TASKS, HEAT_SIGNS, KIND_NAMES, PREG_METHODS, SERVICE, SERVICES, SYMPTOMS, URGENCY, VET_STATUS,
  animalName, providerWord } from "../../lib/constants.js";
import { AI_ERRORS, LEVELS, askAi, triage } from "../../lib/triage.js";
import { daysSince, fmtDate, todayStr } from "../../lib/animalcare.js";
import { errText, getPosition, localPhoneInput, phoneDigits, phoneE164 } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { Avatar, Icon, Pill, RawIcon } from "../../ui.jsx";
import RegionBar, { useArea } from "./RegionBar.jsx";

const DRAFT_KEY = "vc_draft";
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } };
const pad = (n) => String(n).padStart(2, "0");
const localDT = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDT = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;

const TITLES = {
  treatment: ["Hayvoningiz kasalmi?", "Izoh: masalan, 2 kundan beri yemayapti, burni quruq"],
  insemination: ["Sun'iy urug'lantirish", "Izoh: masalan, oldin ham urug'lantirilgan, 2-buzoqlashi"],
  pregnancy: ["Homiladorlik tekshiruvi", "Izoh: masalan, kuyga qaytmadi, qorni kattalashdi"],
  shearing: ["Jun olish (qirqim)", "Izoh: masalan, qo'ylar qo'rada, ertalab qulay"],
  butcher: ["Qassob chaqirish", "Izoh: masalan, hayit uchun, go'shtni 2 kg dan qadoqlash"],
};

export default function NewCase() {
  const { uid, profile, updateProfile } = useAuth();
  const { region, district } = useArea();
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const draft = loadDraft();
  const svcParam = SERVICE[params.get("service")] ? params.get("service") : null;

  const [f, setF] = useState({
    service: svcParam || draft.service || "treatment",
    animal: draft.animal || "sigir", count: draft.count || 1, sym: draft.sym || [], urg: draft.urg || "bugun",
    kind: draft.kind || "call", note: params.get("note") || draft.note || "",
    animalId: params.get("animal") || "",
    heatSigns: [], heatAt: "", bull: "", insDate: "", method: "any",
    tasks: ["So'yish"], inspection: false, date: "",
    name: profile.full_name || "", phone: localPhoneInput(profile.phone || ""), village: profile.village || "",
  });
  const [geo, setGeo] = useState(null);
  const [photo, setPhoto] = useState(null); // {path, preview}
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pick, setPick] = useState(false);
  const target = params.get("vet");
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const svc = SERVICE[f.service];
  const isTreat = f.service === "treatment";

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ service: f.service, animal: f.animal, count: f.count, sym: f.sym, urg: f.urg, kind: f.kind, note: f.note })); } catch { /* yo'q */ }
  }, [f.service, f.animal, f.count, f.sym, f.urg, f.kind, f.note]);

  // Havola orqali kelgan xizmat yoki hayvon (masalan, hayvon kartasidan) ochiq sahifada ham qo'llansin
  const animalParam = params.get("animal") || "";
  useEffect(() => { if (svcParam) set({ service: svcParam }); }, [svcParam]);
  useEffect(() => { if (animalParam) set({ animalId: animalParam }); }, [animalParam]);

  // Hayvon turi xizmatga mos bo'lsin
  useEffect(() => {
    if (!svc.animals.includes(f.animal)) set({ animal: svc.animals[0] });
  }, [f.service]); // eslint-disable-line react-hooks/exhaustive-deps

  const vets = useLive(
    async () => must(await supabase.from("vets").select("id, full_name, village, status, specs, experience, kind, services, has_ultrasound")
      .eq("region", region).eq("district", district).contains("services", [f.service]).order("full_name")),
    [region, district, f.service], [{ table: "vets" }],
  );
  const vs = vets.data || [];
  const online = vs.filter((v) => v.status === "online").length;
  const targetVet = vs.find((v) => v.id === target);

  const herd = useLive(
    async () => must(await supabase.from("animals").select("id, species, name, tag, sex").eq("farmer_id", uid).eq("active", true).order("created_at")),
    [uid], [],
  );
  const myAnimals = (herd.data || []).filter((a) => svc.animals.includes(a.species));
  const chosen = (herd.data || []).find((a) => a.id === f.animalId);

  // Hayvon kartasi tanlanganda: turi va oxirgi urug'lantirish sanasi
  useEffect(() => {
    if (!chosen) return;
    set({ animal: chosen.species, count: 1 });
    if (f.service !== "pregnancy") return;
    (async () => {
      const { data } = await supabase.from("animal_events").select("event_date").eq("animal_id", chosen.id)
        .eq("type", "insemination").order("event_date", { ascending: false }).limit(1);
      if (data?.[0]) set({ insDate: data[0].event_date });
    })();
  }, [chosen?.id, f.service]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function details() {
    switch (f.service) {
      case "insemination": return { heat_signs: f.heatSigns, heat_at: f.heatAt || null, bull_wish: f.bull.trim().slice(0, 60) };
      case "pregnancy": return { ins_date: f.insDate || null, method_wish: f.method };
      case "butcher": return { tasks: f.tasks, inspection: f.inspection };
      default: return {};
    }
  }

  async function submit() {
    if (isTreat && !f.sym.length && !f.note.trim()) { toast("Kamida bitta alomatni belgilang yoki izoh yozing"); return; }
    if (f.service === "butcher" && !f.tasks.length) { toast("Qanday ish kerakligini belgilang"); return; }
    if (f.name.trim().length < 2) { toast("Ismingizni kiriting"); return; }
    if (!phoneDigits(f.phone)) { toast("Telefon raqamini to'liq kiriting"); return; }
    setBusy(true);
    try {
      const row = must(await supabase.from("cases").insert({
        farmer_id: uid, vet_id: targetVet ? targetVet.id : null, region, district,
        service: f.service, animal_id: chosen?.id ?? null, details: details(),
        preferred_date: ["shearing", "butcher"].includes(f.service) && f.date ? f.date : null,
        animal: f.animal, animal_count: Math.max(1, +f.count || 1), symptoms: isTreat ? f.sym : [],
        urgency: isTreat ? f.urg : "bugun", kind: isTreat ? f.kind : "call",
        note: f.note.trim(), contact_name: f.name.trim(), phone: phoneE164(f.phone), village: f.village.trim(),
        lat: geo?.lat ?? null, lng: geo?.lng ?? null, photo_path: photo?.path ?? null,
      }).select("id").single());
      // Kuyikish hayvon kartasi tarixiga ham yoziladi
      if (chosen && f.service === "insemination" && (f.heatAt || f.heatSigns.length)) {
        await supabase.from("animal_events").insert({
          animal_id: chosen.id, farmer_id: uid, type: "heat", event_date: (f.heatAt || todayStr()).slice(0, 10),
          details: { signs: f.heatSigns }, note: "",
        });
      }
      if (!profile.village && f.village.trim()) updateProfile({ village: f.village.trim() }).catch(() => {});
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* yo'q */ }
      toast("Ariza yuborildi");
      nav(`/case/${row.id}`);
    } catch (e) {
      toast(errText(e));
    }
    setBusy(false);
  }

  const who = providerWord(f.service);
  const whoMany = providerWord(f.service, true);

  if (pick) {
    return (
      <>
        <button className="linkbtn" onClick={() => setPick(false)}>← Arizaga qaytish</button>
        <h1>{who === "veterinar" ? "Veterinarni" : "Mutaxassisni"} tanlang</h1>
        <div className="list">
          <div className={`card pick ${!targetVet ? "sel" : ""}`} onClick={() => { setParams({}); setPick(false); }}>
            <b>Tumandagi barcha {whoMany}ga</b><div className="meta">Birinchi qabul qilgan {who} keladi</div>
          </div>
          {vs.map((v) => (
            <div key={v.id} className={`card pick ${target === v.id ? "sel" : ""}`} onClick={() => { setParams({ vet: v.id }); setPick(false); }}>
              <div className="person"><Avatar name={v.full_name} status={v.status} />
                <div><h3>{v.full_name}</h3><div className="meta"><span>{KIND_NAMES[v.kind] || "Veterinar"}</span><span>{v.village}</span>{v.experience ? <span>{v.experience} yil tajriba</span> : null}</div>
                  <div className="tags"><Pill s={VET_STATUS[v.status]} />{v.has_ultrasound && f.service === "pregnancy" && <span className="pill">UZI apparati bor</span>}
                    {(v.specs || []).map((s) => <span key={s} className="pill">{s}</span>)}</div></div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  const heatTime = f.heatAt ? new Date(f.heatAt) : null;
  const shownAnimals = ANIMALS.filter((a) => svc.animals.includes(a.id));

  return (
    <>
      <RegionBar />
      <h1>{TITLES[f.service][0]}</h1>
      <p className="lead">Ariza {district} tumanidagi {whoMany}ga boradi.</p>

      <span className="label">Xizmat</span>
      <div className="services">
        {SERVICES.map((s) => (
          <button key={s.id} className="service" aria-pressed={f.service === s.id}
            onClick={() => { set({ service: s.id }); if (target) setParams({}); }}>
            <Icon name={s.icon} size={24} /><b>{s.n}</b><span>{s.d}</span>
          </button>
        ))}
      </div>

      {(herd.data || []).length > 0 && (
        <>
          <label className="label" htmlFor="ncAnimal">Hayvon kartasi (ixtiyoriy)</label>
          <select id="ncAnimal" className="field" value={f.animalId} onChange={(e) => set({ animalId: e.target.value })}>
            <option value="">Kartasiz — umumiy ariza</option>
            {myAnimals.map((a) => <option key={a.id} value={a.id}>{animalName(a.species)}{a.name ? ` · ${a.name}` : ""}{a.tag ? ` · ${a.tag}` : ""}</option>)}
          </select>
          <div className="meta">Karta tanlansa, natija hayvon tarixiga yoziladi va eslatmalar keladi. <Link to="/animals">Hayvonlar</Link></div>
        </>
      )}

      {!chosen && (
        <>
          <span className="label">Hayvon turi</span>
          <div className="animals" style={{ "--n": shownAnimals.length }}>
            {shownAnimals.map((a) => (
              <button key={a.id} className="animal" aria-pressed={f.animal === a.id} onClick={() => set({ animal: a.id })}>
                <RawIcon paths={a.p} />{a.n}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label htmlFor="ncCount" className="meta grow" style={{ margin: 0 }}>{isTreat ? "Nechta hayvon kasal?" : "Nechta bosh?"}</label>
            <input id="ncCount" className="qty" type="number" min="1" max="10000" value={f.count} onChange={(e) => set({ count: e.target.value })} />
          </div>
        </>
      )}

      {isTreat && (
        <>
          <span className="label">Alomatlar</span>
          <div className="chips">
            {SYMPTOMS.map((s) => (
              <button key={s} className="chip" aria-pressed={f.sym.includes(s)}
                onClick={() => set({ sym: f.sym.includes(s) ? f.sym.filter((x) => x !== s) : [...f.sym, s] })}>{s}</button>
            ))}
          </div>

          <AiHelp f={f} onLevel={(urg) => set({ urg })} />

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
        </>
      )}

      {f.service === "insemination" && (
        <>
          <span className="label">Kuyikish belgilari</span>
          <div className="chips">
            {HEAT_SIGNS.map((s) => (
              <button key={s} className="chip" aria-pressed={f.heatSigns.includes(s)}
                onClick={() => set({ heatSigns: f.heatSigns.includes(s) ? f.heatSigns.filter((x) => x !== s) : [...f.heatSigns, s] })}>{s}</button>
            ))}
          </div>
          <label className="label" htmlFor="ncHeat">Kuyikish qachon boshlandi?</label>
          <div className="row">
            <input id="ncHeat" className="field grow" type="datetime-local" value={f.heatAt} max={localDT(new Date())}
              onChange={(e) => set({ heatAt: e.target.value })} style={{ flex: 1 }} />
            <button className="btn ghost sm" onClick={() => set({ heatAt: localDT(new Date()) })}>Hozir</button>
          </div>
          {heatTime && !isNaN(heatTime) && (
            <div className="note info">
              {f.animal === "sigir"
                ? <>Taxminiy qulay vaqt: <b>{fmtDT(new Date(heatTime.getTime() + 12 * 3600000))}</b> atrofida. Odatiy qoida: kuyikish ertalab ko'rilsa — shu kuni kechqurun, kechqurun ko'rilsa — ertasi ertalab.</>
                : <>Mutaxassisni imkon qadar tezroq chaqiring.</>}
              {" "}Aniq vaqtni mutaxassis belgilaydi.
            </div>
          )}
          <label className="label" htmlFor="ncBull">Istalgan buqa zoti (ixtiyoriy)</label>
          <input id="ncBull" type="text" maxLength={60} value={f.bull} onChange={(e) => set({ bull: e.target.value })} placeholder="Masalan: Golshtin, Simmental" />
        </>
      )}

      {f.service === "pregnancy" && (
        <>
          <label className="label" htmlFor="ncIns">Qachon urug'lantirilgan?</label>
          <input id="ncIns" className="field" type="date" value={f.insDate} max={todayStr()} onChange={(e) => set({ insDate: e.target.value })} />
          {f.insDate && <div className="meta">{daysSince(f.insDate)} kun oldin ({fmtDate(f.insDate)}). Tekshiruv muddatini veterinar belgilaydi.</div>}
          <span className="label">Tekshiruv usuli</span>
          <div className="seg">
            {Object.entries(PREG_METHODS).map(([k, t]) => (
              <button key={k} aria-pressed={f.method === k} onClick={() => set({ method: k })}>{t}</button>
            ))}
          </div>
        </>
      )}

      {f.service === "butcher" && (
        <>
          <span className="label">Qanday ish kerak?</span>
          <div className="chips">
            {BUTCHER_TASKS.map((s) => (
              <button key={s} className="chip" aria-pressed={f.tasks.includes(s)}
                onClick={() => set({ tasks: f.tasks.includes(s) ? f.tasks.filter((x) => x !== s) : [...f.tasks, s] })}>{s}</button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={f.inspection} onChange={(e) => set({ inspection: e.target.checked })} />
            <span>Go'sht sotuvga chiqadi — veterinar ko'rigi ham kerak</span>
          </label>
        </>
      )}

      {["shearing", "butcher"].includes(f.service) && (
        <>
          <label className="label" htmlFor="ncDate">Qulay sana</label>
          <input id="ncDate" className="field" type="date" min={todayStr()} value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </>
      )}

      <label className="label" htmlFor="ncNote">Izoh</label>
      <textarea id="ncNote" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder={TITLES[f.service][1]} />

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
          <><b>{targetVet.full_name}</b><div className="meta">Faqat shu {who}ga yuboriladi</div></>
        ) : (
          <><b>Tumandagi barcha {whoMany}ga</b>
            <div className="meta">{vets.loading ? "Yuklanmoqda…" : vs.length ? `${vs.length} ta ${who}, hozir ${online} tasi bo'sh` : `Bu tumanda «${svc.n}» xizmati bo'yicha hali ${who} yo'q`}</div></>
        )}
        {vs.length > 0 && <button className="linkbtn" onClick={() => setPick(true)}>{targetVet ? "O'zgartirish" : `Aniq ${who}ni tanlash`}</button>}
      </div>
      {!vets.loading && vs.length === 0 && (
        <div className="note">Ariza saqlanadi. Tumanda shu xizmat bo'yicha {who} ro'yxatdan o'tishi bilan u arizani ko'radi. Qo'shni tumanni ham tanlab ko'rishingiz mumkin.</div>
      )}

      <div className="sticky-cta">
        <button className="btn primary wide" style={{ marginTop: 0 }} disabled={busy || uploading} onClick={submit}>
          {busy ? "Yuborilmoqda…" : "Arizani yuborish"}
        </button>
      </div>
    </>
  );
}

/** Sun'iy intellekt yordamchisi: avval oddiy tahlil, xohlasa — server orqali SI tahlili. */
function AiHelp({ f, onLevel }) {
  const toast = useToast();
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = { animal: f.animal, count: Math.max(1, +f.count || 1), symptoms: f.sym, note: f.note };
  const key = JSON.stringify(input);
  useEffect(() => { setAi(null); }, [key]);
  if (!f.sym.length && !f.note.trim()) return null;

  const base = triage(input);
  const r = ai || base;
  const L = LEVELS[r.level];

  async function ask() {
    setBusy(true);
    try { setAi({ ...(await askAi(input)), fromAi: true }); }
    catch (e) { toast(AI_ERRORS[e.code] || "Sun'iy intellekt hozir javob bermadi. Oddiy tahlil ko'rsatildi."); }
    setBusy(false);
  }

  return (
    <div className={`ai t-${L.tone}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b><Icon name="spark" size={18} /> {r.fromAi ? "Sun'iy intellekt baholashi" : "Dastlabki baholash"}</b>
        <Pill s={[L.t, L.tone]} />
      </div>
      <p>{r.fromAi ? r.summary : `${L.text} ${r.reasons.join(" ")}`}</p>
      <ul>{r.advice.map((a) => <li key={a}>{a}</li>)}</ul>
      <div className="row">
        {f.urg !== L.urgency && <button className="btn ghost sm" onClick={() => onLevel(L.urgency)}>«{URGENCY[L.urgency][0]}» ni tanlash</button>}
        {!r.fromAi && <button className="btn ghost sm" disabled={busy} onClick={ask}><Icon name="spark" size={16} />{busy ? "Tahlil qilinmoqda…" : "Sun'iy intellektdan so'rash"}</button>}
      </div>
      <small>Bu tashxis emas. Yakuniy qarorni veterinar qiladi.</small>
    </div>
  );
}
