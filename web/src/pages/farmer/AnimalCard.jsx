import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { EVENT_TYPES, FARMER_EVENTS } from "../../lib/constants.js";
import { careStatus, sortEvents, todayStr } from "../../lib/animalcare.js";
import { errText } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ConfirmButton, ErrorNote, Loading } from "../../ui.jsx";
import { AnimalForm } from "./Animals.jsx";
import { AnimalBadge, EventList, animalTitle } from "./AnimalParts.jsx";

export default function AnimalCard() {
  const { id } = useParams();
  const { uid } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [ev, setEv] = useState(null); // yangi voqea shakli
  const [busy, setBusy] = useState(false);

  const animal = useLive(async () => must(await supabase.from("animals").select("*").eq("id", id).maybeSingle()), [id], [{ table: "animals", filter: `id=eq.${id}` }]);
  const events = useLive(
    async () => must(await supabase.from("animal_events").select("*").eq("animal_id", id).order("event_date", { ascending: false }).order("id", { ascending: false })),
    [id], [{ table: "animal_events", filter: `animal_id=eq.${id}` }],
  );
  const a = animal.data;

  if (animal.loading && !a) return <Loading />;
  if (!a) return (<><Link className="linkbtn" to="/animals">← Hayvonlar</Link><ErrorNote error={animal.error} onRetry={animal.reload} />
    {!animal.error && <div className="empty">Hayvon topilmadi.</div>}</>);

  const evs = sortEvents(events.data);
  const status = careStatus(a, evs);
  const mine = a.farmer_id === uid;

  async function addEvent() {
    setBusy(true);
    try {
      must(await supabase.from("animal_events").insert({ animal_id: id, farmer_id: uid, type: ev.type, event_date: ev.date, note: ev.note.trim() }));
      toast("Tarixga yozildi"); setEv(null); events.reload();
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }
  async function delEvent(eid) {
    try { must(await supabase.from("animal_events").delete().eq("id", eid)); events.reload(); toast("O'chirildi"); }
    catch (e) { toast(errText(e)); }
  }
  async function archive() {
    try { must(await supabase.from("animals").update({ active: false }).eq("id", id)); toast("Hayvon ro'yxatdan olindi"); nav("/animals"); }
    catch (e) { toast(errText(e)); }
  }
  const call = (service) => nav(`/new?service=${service}&animal=${id}`);

  return (
    <>
      <Link className="linkbtn" to="/animals">← Hayvonlar</Link>
      {editing ? (
        <AnimalForm initial={a} onSaved={() => { setEditing(false); animal.reload(); }} onCancel={() => setEditing(false)} />
      ) : (
        <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", margin: "6px 0 4px" }}>
          <AnimalBadge species={a.species} />
          <div className="grow" style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0 }}>{animalTitle(a)}</h1>
            <div className="meta">{a.breed && <span>{a.breed}</span>}{a.birth_year && <span>{a.birth_year}-yil</span>}<span>{a.sex === "m" ? "Erkak" : "Urg'ochi"}</span></div>
            {a.note && <div className="meta">{a.note}</div>}
          </div>
          {mine && <button className="btn ghost sm" onClick={() => setEditing(true)}>Tahrirlash</button>}
        </div>
      )}

      {status.length > 0 && (
        <div className="list" style={{ marginTop: 10 }}>
          {status.map((s) => (
            <div key={s.title} className={`remind t-${s.tone}`}>
              <b>{s.title}</b><div>{s.text}</div>
              {s.action && mine && <button className="btn dark sm" style={{ marginTop: 8 }} onClick={() => call(s.action.service)}>{s.action.label}</button>}
            </div>
          ))}
        </div>
      )}

      {mine && (
        <>
          <h2>Xizmat chaqirish</h2>
          <div className="grid2">
            {a.sex !== "m" && ["sigir", "qoy", "echki", "ot"].includes(a.species) && <>
              <button className="btn ghost sm" onClick={() => call("insemination")}>Urug'lantirish</button>
              <button className="btn ghost sm" onClick={() => call("pregnancy")}>Homiladorlik tekshiruvi</button>
            </>}
            <button className="btn ghost sm" onClick={() => call("treatment")}>Veterinar (davolash)</button>
            {["qoy", "echki"].includes(a.species) && <button className="btn ghost sm" onClick={() => call("shearing")}>Jun olish</button>}
            {a.species !== "boshqa" && <button className="btn ghost sm" onClick={() => call("butcher")}>Qassob</button>}
          </div>
        </>
      )}

      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Tarix</h2>
        {mine && !ev && <button className="linkbtn" onClick={() => setEv({ type: "heat", date: todayStr(), note: "" })}>+ Yozuv qo'shish</button>}
      </div>
      {ev && (
        <div className="card" style={{ marginBottom: 10 }}>
          <label className="label" htmlFor="evType" style={{ marginTop: 0 }}>Nima bo'ldi?</label>
          <select id="evType" className="field" value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value })}>
            {FARMER_EVENTS.map((t) => <option key={t} value={t}>{EVENT_TYPES[t]}</option>)}
          </select>
          <label className="label" htmlFor="evDate">Sana</label>
          <input id="evDate" className="field" type="date" max={todayStr()} value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} />
          <label className="label" htmlFor="evNote">Izoh</label>
          <input id="evNote" type="text" maxLength={500} value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder="Masalan: buzoq tug'di, urg'ochi" />
          <div className="grid2" style={{ marginTop: 10 }}>
            <button className="btn ghost" onClick={() => setEv(null)}>Bekor</button>
            <button className="btn dark" disabled={busy || !ev.date} onClick={addEvent}>{busy ? "…" : "Saqlash"}</button>
          </div>
          <div className="meta" style={{ marginTop: 6 }}>Urug'lantirish va homiladorlik natijasini mutaxassis ilova orqali kiritadi.</div>
        </div>
      )}
      <ErrorNote error={events.error} onRetry={events.reload} />
      <div className="card"><EventList events={evs} onDelete={mine ? delEvent : null} /></div>

      {mine && <ConfirmButton confirmText="Ha, olib tashlash" onConfirm={archive}>Hayvonni ro'yxatdan olib tashlash</ConfirmButton>}
    </>
  );
}
