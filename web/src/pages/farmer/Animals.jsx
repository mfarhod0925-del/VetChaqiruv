import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { BREED_KINDS, GESTATION, animalName } from "../../lib/constants.js";
import { addDays, daysBetween, errText, fmtDate, todayIso } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ConfirmButton, ErrorNote, Icon, Loading, Pill, RawIcon } from "../../ui.jsx";

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const lastBreeding = (a) => [...(a.breedings || [])].sort((x, y) => (x.bred_on < y.bred_on ? 1 : -1))[0] || null;
const dueDate = (kind, b) => addDays(b.bred_on, GESTATION[kind] || 283);

/** Hayvonning hozirgi holati: [matn, rang] */
export function breedState(a) {
  const b = lastBreeding(a);
  const today = todayIso();
  if (!b) return ["Urug'lantirilmagan", "mute"];
  if (b.birth_on) return [`Tug'di: ${fmtDate(b.birth_on)}`, "mute"];
  if (b.pregnant === false) return ["Bo'g'oz emas — qayta urug'lantirish kerak", "bad"];
  const due = dueDate(a.kind, b);
  const left = daysBetween(today, due);
  if (b.pregnant === true) return [left >= 0 ? `Bo'g'oz · tug'ishiga ${left} kun (${fmtDate(due)})` : `Tug'ish kuni o'tdi (${fmtDate(due)})`, left <= 7 ? "warn" : "ok"];
  return [`Urug'lantirilgan ${fmtDate(b.bred_on)} · ${daysBetween(b.bred_on, today)}-kun, tekshirilmagan`, "warn"];
}

function AddAnimal({ uid, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ kind: "sigir", name: "", tag: "", birth: "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!f.name.trim()) { toast("Laqabini yoki raqamini yozing"); return; }
    setBusy(true);
    try {
      must(await supabase.from("animals").insert({ farmer_id: uid, kind: f.kind, name: f.name.trim().slice(0, 60), tag: f.tag.trim().slice(0, 40), birth_date: f.birth || null }));
      toast("Hayvon qo'shildi");
      onDone();
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }
  return (
    <div className="card">
      <b>Yangi hayvon</b>
      <div className="animals" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginTop: 8 }}>
        {BREED_KINDS.map((a) => (
          <button key={a.id} className="animal" aria-pressed={f.kind === a.id} onClick={() => setF({ ...f, kind: a.id })}><RawIcon paths={a.p} />{a.n}</button>
        ))}
      </div>
      <div className="grid2">
        <div><label className="label" htmlFor="anName">Laqabi</label>
          <input id="anName" type="text" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Masalan: Malika" /></div>
        <div><label className="label" htmlFor="anTag">Sirg'a raqami</label>
          <input id="anTag" type="text" maxLength={40} value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} placeholder="ixtiyoriy" /></div>
      </div>
      <label className="label" htmlFor="anBirth">Tug'ilgan sanasi (ixtiyoriy)</label>
      <input id="anBirth" type="date" max={todayIso()} value={f.birth} onChange={(e) => setF({ ...f, birth: e.target.value })} />
      <div className="grid2" style={{ marginTop: 10 }}>
        <button className="btn ghost" onClick={onDone}>Bekor qilish</button>
        <button className="btn dark" disabled={busy} onClick={save}>Qo'shish</button>
      </div>
    </div>
  );
}

function ReminderList({ items }) {
  if (!items.length) return null;
  const today = todayIso();
  return (
    <div className="list">
      {items.map((r) => {
        const d = daysBetween(today, r.due_on);
        return (
          <div key={r.id} className="card calrow">
            <div className="caldate"><b>{+r.due_on.slice(8, 10)}</b><span>{MONTHS[+r.due_on.slice(5, 7) - 1]}</span></div>
            <div style={{ minWidth: 0 }}>
              <b>{r.title}</b>
              <div className="meta">{d === 0 ? "Bugun" : d === 1 ? "Ertaga" : d > 0 ? `${d} kundan keyin` : "O'tib ketdi"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Hayvon taqvimi: ro'yxat va yaqin eslatmalar. */
export default function Animals() {
  const { uid } = useAuth();
  const [adding, setAdding] = useState(false);
  const animals = useLive(
    async () => must(await supabase.from("animals").select("*, breedings(id, bred_on, pregnant, checked_on, birth_on)")
      .eq("farmer_id", uid).order("created_at", { ascending: false })),
    [uid], [{ table: "breedings" }],
  );
  const rem = useLive(
    async () => must(await supabase.from("reminders").select("id, title, due_on").eq("user_id", uid)
      .gte("due_on", todayIso()).order("due_on").limit(6)),
    [uid], [{ table: "reminders" }],
  );
  const list = animals.data || [];

  return (
    <>
      <h1>Hayvon taqvimi</h1>
      <p className="lead">Urug'lantirish sanasini yozing — homiladorlikni tekshirish va tug'ish kunini Telegram orqali eslatib turamiz.</p>
      <ErrorNote error={animals.error} onRetry={animals.reload} />

      {(rem.data || []).length > 0 && (<><h2>Yaqin kunlarda</h2><ReminderList items={rem.data} /></>)}

      <h2>Hayvonlarim ({list.length})</h2>
      {adding ? <AddAnimal uid={uid} onDone={() => { setAdding(false); animals.reload(); }} />
        : <button className="btn primary wide" style={{ marginTop: 0 }} onClick={() => setAdding(true)}>+ Hayvon qo'shish</button>}
      {animals.loading && !animals.data ? <Loading /> : list.length === 0 && !adding ? (
        <div className="empty">Hali hayvon qo'shilmagan. Sigir, qo'y, echki yoki otingizni qo'shing.</div>
      ) : (
        <div className="list" style={{ marginTop: 12 }}>
          {list.map((a) => {
            const st = breedState(a);
            return (
              <Link key={a.id} className="card" to={`/animals/${a.id}`}>
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div className="grow"><h3>{a.name}{a.tag ? ` · ${a.tag}` : ""}</h3><div className="meta">{animalName(a.kind)}</div></div>
                </div>
                <div style={{ marginTop: 6 }}><Pill s={st} /></div>
              </Link>
            );
          })}
        </div>
      )}
      <p className="meta" style={{ marginTop: 16 }}>Muddatlar o'rtacha: sigir 283 kun, qo'y va echki 150 kun, ot 340 kun. Aniq sanani veterinar bilan kelishing.</p>
    </>
  );
}

export function AnimalDetail() {
  const { id } = useParams();
  const { uid } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [bf, setBf] = useState({ date: todayIso(), method: "suniy", sire: "" });
  const [birth, setBirth] = useState(todayIso());

  const live = useLive(
    async () => must(await supabase.from("animals").select("*, breedings(*)").eq("id", id).maybeSingle()),
    [id], [{ table: "breedings", filter: `animal_id=eq.${id}` }],
  );
  const rem = useLive(
    async () => {
      const ids = (live.data?.breedings || []).map((b) => b.id);
      if (!ids.length) return [];
      return must(await supabase.from("reminders").select("id, title, due_on").in("breeding_id", ids).gte("due_on", todayIso()).order("due_on"));
    },
    [id, (live.data?.breedings || []).map((b) => `${b.id}${b.pregnant}${b.birth_on}${b.bred_on}`).join()], [{ table: "reminders" }],
  );
  const a = live.data;
  if (live.loading && !a) return <Loading />;
  if (!a) return (<><Link className="linkbtn" to="/animals">← Taqvim</Link><ErrorNote error={live.error} onRetry={live.reload} />{!live.error && <div className="empty">Hayvon topilmadi.</div>}</>);

  const history = [...(a.breedings || [])].sort((x, y) => (x.bred_on < y.bred_on ? 1 : -1));
  const open = history.find((b) => !b.birth_on && b.pregnant !== false) || null;
  const st = breedState(a);

  async function run(fn, ok) {
    setBusy(true);
    let done = false;
    try { must(await fn()); if (ok) toast(ok); live.reload(); done = true; } catch (e) { toast(errText(e)); }
    setBusy(false);
    return done;
  }
  const addBreeding = () => run(() => supabase.from("breedings").insert({
    animal_id: id, farmer_id: uid, bred_on: bf.date, method: bf.method, sire: bf.sire.trim().slice(0, 120),
  }), "Yozildi. Eslatmalar tuzildi.").then((ok) => ok && setForm(false));
  const setPregnant = (v) => run(() => supabase.from("breedings").update({ pregnant: v, checked_on: todayIso() }).eq("id", open.id),
    v ? "Bo'g'oz deb belgilandi" : "Bo'g'oz emas deb belgilandi");
  const setBirthDone = () => run(() => supabase.from("breedings").update({ birth_on: birth }).eq("id", open.id), "Tabriklaymiz! Tug'ish sanasi yozildi.");
  const remove = () => run(() => supabase.from("animals").delete().eq("id", id), "Hayvon o'chirildi").then((ok) => ok && nav("/animals"));

  return (
    <>
      <Link className="linkbtn" to="/animals">← Taqvim</Link>
      <h1>{a.name}</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="meta">{animalName(a.kind)}{a.tag ? ` · ${a.tag}` : ""}{a.birth_date ? ` · tug'ilgan ${fmtDate(a.birth_date)}` : ""}</span>
      </div>
      <div className="card"><div className="meta">Hozirgi holati</div><div style={{ marginTop: 4 }}><Pill s={st} /></div>
        {open && open.pregnant === null && (
          <>
            <div className="meta" style={{ marginTop: 10 }}>Tekshiruv natijasini o'zingiz belgilashingiz mumkin:</div>
            <div className="grid2" style={{ marginTop: 6 }}>
              <button className="btn ghost sm" disabled={busy} onClick={() => setPregnant(true)}>Bo'g'oz</button>
              <button className="btn ghost sm" disabled={busy} onClick={() => setPregnant(false)}>Bo'g'oz emas</button>
            </div>
          </>
        )}
        {open && open.pregnant === true && (
          <>
            <label className="label" htmlFor="adBirth">Tug'di</label>
            <div className="grid2">
              <input id="adBirth" type="date" min={open.bred_on} max={todayIso()} value={birth} onChange={(e) => setBirth(e.target.value)} />
              <button className="btn dark sm" disabled={busy} onClick={setBirthDone}>Belgilash</button>
            </div>
          </>
        )}
      </div>

      <div className="grid2" style={{ marginTop: 10 }}>
        <Link className="btn ghost sm" to={`/order/new?s=urug&animal=${a.id}`}><Icon name="drop" size={18} />Urug'lantiruvchi</Link>
        <Link className="btn ghost sm" to={`/order/new?s=homila&animal=${a.id}`}><Icon name="heart" size={18} />Tekshirtirish</Link>
      </div>

      {(rem.data || []).length > 0 && (<><h2>Eslatmalar</h2><ReminderList items={rem.data} /></>)}

      <h2>Urug'lantirish tarixi</h2>
      {form ? (
        <div className="card">
          <label className="label" htmlFor="bfDate">Sana</label>
          <input id="bfDate" type="date" max={todayIso()} value={bf.date} onChange={(e) => setBf({ ...bf, date: e.target.value })} />
          <span className="label">Usul</span>
          <div className="seg" style={{ "--n": 2 }}>
            <button aria-pressed={bf.method === "suniy"} onClick={() => setBf({ ...bf, method: "suniy" })}>Sun'iy</button>
            <button aria-pressed={bf.method === "tabiiy"} onClick={() => setBf({ ...bf, method: "tabiiy" })}>Tabiiy</button>
          </div>
          <label className="label" htmlFor="bfSire">Buqa / urug' (zoti, raqami)</label>
          <input id="bfSire" type="text" maxLength={120} value={bf.sire} onChange={(e) => setBf({ ...bf, sire: e.target.value })} placeholder="ixtiyoriy" />
          <div className="grid2" style={{ marginTop: 10 }}>
            <button className="btn ghost" onClick={() => setForm(false)}>Bekor qilish</button>
            <button className="btn dark" disabled={busy} onClick={addBreeding}>Saqlash</button>
          </div>
        </div>
      ) : (
        <button className="btn primary wide" style={{ marginTop: 0 }} onClick={() => setForm(true)}>+ Urug'lantirishni yozish</button>
      )}
      <div className="list" style={{ marginTop: 12 }}>
        {history.map((b) => (
          <div key={b.id} className="card">
            <b>{fmtDate(b.bred_on)} · {b.method === "suniy" ? "sun'iy" : "tabiiy"}</b>
            {b.sire && <div className="meta">{b.sire}</div>}
            <div className="meta">
              {b.birth_on ? `Tug'di: ${fmtDate(b.birth_on)}` : b.pregnant === true ? `Bo'g'oz · taxminiy tug'ish ${fmtDate(dueDate(a.kind, b))}`
                : b.pregnant === false ? "Bo'g'oz emas" : `Taxminiy tug'ish ${fmtDate(dueDate(a.kind, b))} (tekshirilmagan)`}
            </div>
          </div>
        ))}
        {!history.length && <div className="meta">Hali yozuv yo'q.</div>}
      </div>

      <ConfirmButton confirmText="Ha, o'chirish" disabled={busy} onConfirm={remove}>Hayvonni o'chirish</ConfirmButton>
    </>
  );
}
