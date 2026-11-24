import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { ANIMALS } from "../../lib/constants.js";
import { careStatus } from "../../lib/animalcare.js";
import { errText } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ErrorNote, Loading, Pill, RawIcon } from "../../ui.jsx";
import { AnimalBadge, animalTitle } from "./AnimalParts.jsx";

const TONE = { info: "mute" };

/** Hayvon qo'shish / tahrirlash shakli (Animals va AnimalCard sahifalarida) */
export function AnimalForm({ initial, onSaved, onCancel }) {
  const { uid } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({
    species: initial?.species || "sigir", name: initial?.name || "", tag: initial?.tag || "", breed: initial?.breed || "",
    sex: initial?.sex || "f", birth_year: initial?.birth_year ?? "", note: initial?.note || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  async function save() {
    const y = String(f.birth_year).trim();
    if (y && !(+y >= 1990 && +y <= new Date().getFullYear())) { toast("Tug'ilgan yilni to'g'ri kiriting"); return; }
    const row = { species: f.species, name: f.name.trim(), tag: f.tag.trim(), breed: f.breed.trim(), sex: f.sex,
      birth_year: y ? +y : null, note: f.note.trim() };
    setBusy(true);
    try {
      const saved = initial
        ? must(await supabase.from("animals").update(row).eq("id", initial.id).select().single())
        : must(await supabase.from("animals").insert({ ...row, farmer_id: uid }).select().single());
      toast(initial ? "Saqlandi" : "Hayvon qo'shildi");
      onSaved?.(saved);
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  return (
    <div className="card">
      <span className="label" style={{ marginTop: 0 }}>Turi</span>
      <div className="animals">
        {ANIMALS.map((a) => (
          <button key={a.id} className="animal" aria-pressed={f.species === a.id} onClick={() => set({ species: a.id })}>
            <RawIcon paths={a.p} />{a.n}
          </button>
        ))}
      </div>
      <div className="grid2">
        <div><label className="label" htmlFor="afName">Nomi / laqabi</label>
          <input id="afName" type="text" maxLength={60} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Oqbosh" /></div>
        <div><label className="label" htmlFor="afTag">Sirg'a raqami</label>
          <input id="afTag" type="text" maxLength={40} value={f.tag} onChange={(e) => set({ tag: e.target.value })} placeholder="UZ-0012" /></div>
      </div>
      <div className="grid2">
        <div><label className="label" htmlFor="afBreed">Zoti</label>
          <input id="afBreed" type="text" maxLength={60} value={f.breed} onChange={(e) => set({ breed: e.target.value })} placeholder="Golshtin" /></div>
        <div><label className="label" htmlFor="afYear">Tug'ilgan yili</label>
          <input id="afYear" type="number" min="1990" max={new Date().getFullYear()} value={f.birth_year} onChange={(e) => set({ birth_year: e.target.value })} /></div>
      </div>
      <span className="label">Jinsi</span>
      <div className="seg" style={{ "--n": 2 }}>
        <button aria-pressed={f.sex === "f"} onClick={() => set({ sex: "f" })}>Urg'ochi</button>
        <button aria-pressed={f.sex === "m"} onClick={() => set({ sex: "m" })}>Erkak</button>
      </div>
      <label className="label" htmlFor="afNote">Izoh</label>
      <textarea id="afNote" maxLength={500} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Masalan: 3-buzoqlashi, sut 18 l/kun" />
      <div className="grid2" style={{ marginTop: 10 }}>
        {onCancel ? <button className="btn ghost" onClick={onCancel}>Bekor</button> : <span />}
        <button className="btn dark" disabled={busy} onClick={save}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
      </div>
    </div>
  );
}

export default function Animals() {
  const { uid } = useAuth();
  const [adding, setAdding] = useState(false);
  const animals = useLive(
    async () => must(await supabase.from("animals").select("*").eq("farmer_id", uid).eq("active", true).order("created_at", { ascending: false })),
    [uid], [{ table: "animals", filter: `farmer_id=eq.${uid}` }],
  );
  const events = useLive(
    async () => must(await supabase.from("animal_events").select("id, animal_id, type, event_date, result").eq("farmer_id", uid)
      .order("event_date", { ascending: false }).limit(500)),
    [uid], [{ table: "animal_events", filter: `farmer_id=eq.${uid}` }],
  );
  const list = animals.data || [];
  const byAnimal = {};
  for (const e of events.data || []) (byAnimal[e.animal_id] ||= []).push(e);

  return (
    <>
      <h1>Hayvonlarim</h1>
      <p className="lead">Har bir hayvonning kartasi: urug'lantirish, homiladorlik, tug'ish, emlash va davolash tarixi hamda eslatmalar.</p>
      {adding ? (
        <AnimalForm onSaved={() => { setAdding(false); animals.reload(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button className="btn primary wide" style={{ marginTop: 0 }} onClick={() => setAdding(true)}>+ Hayvon qo'shish</button>
      )}
      <ErrorNote error={animals.error} onRetry={animals.reload} />
      {animals.loading && !animals.data ? <Loading /> : list.length === 0 ? (
        !adding && <div className="empty">Hali hayvon qo'shilmagan.<span>Sigir, qo'y yoki echkini qo'shing — ilova urug'lantirish, tekshiruv va tug'ish vaqtini eslatib turadi.</span></div>
      ) : (
        <div className="list" style={{ marginTop: 14 }}>
          {list.map((a) => {
            const st = careStatus(a, byAnimal[a.id])[0];
            return (
              <Link className="card" key={a.id} to={`/animal/${a.id}`}>
                <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                  <AnimalBadge species={a.species} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <h3>{animalTitle(a)}</h3>
                    <div className="meta">{a.breed && <span>{a.breed}</span>}{a.birth_year && <span>{a.birth_year}-yil</span>}<span>{a.sex === "m" ? "Erkak" : "Urg'ochi"}</span></div>
                    {st && <div style={{ marginTop: 6 }}><Pill s={[st.title, TONE[st.tone] || st.tone]} /></div>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
