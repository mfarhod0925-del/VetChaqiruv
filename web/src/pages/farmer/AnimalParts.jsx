import { Link } from "react-router-dom";
import { ANIMALS, EVENT_TYPES, PREG_METHODS, PREG_RESULT, animalName } from "../../lib/constants.js";
import { fmtDate } from "../../lib/animalcare.js";
import { Pill, RawIcon } from "../../ui.jsx";

/** Hayvon nomi: "Sigir · Oqbosh · UZ-001" */
export const animalTitle = (a) => [animalName(a.species), a.name, a.tag].filter(Boolean).join(" · ");
export const animalIcon = (species) => (ANIMALS.find((x) => x.id === species) || ANIMALS[ANIMALS.length - 1]).p;

/** Voqea tafsilotlari bir qatorda */
export function eventDetail(e) {
  const d = e.details || {};
  const parts = [];
  if (d.bull_breed) parts.push(`Buqa zoti: ${d.bull_breed}`);
  if (d.batch) parts.push(`partiya ${d.batch}`);
  if (d.method) parts.push(PREG_METHODS[d.method] || d.method);
  if (d.term_days) parts.push(`muddat ~${d.term_days} kun`);
  if (d.heads) parts.push(`${d.heads} bosh`);
  if (d.wool_kg) parts.push(`${d.wool_kg} kg jun`);
  if (d.signs?.length) parts.push(d.signs.join(", "));
  if (e.note) parts.push(e.note);
  return parts.join(" · ");
}

export function EventList({ events, onDelete, linkCases = true }) {
  if (!events?.length) return <div className="meta">Hali yozuv yo'q.</div>;
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <span className="tdate">{fmtDate(e.event_date)}</span>
          <div>
            <b>{EVENT_TYPES[e.type] || e.type}</b> {e.result && <Pill s={PREG_RESULT[e.result]} />}
            {eventDetail(e) && <small>{eventDetail(e)}</small>}
            <div className="row" style={{ gap: 12 }}>
              {linkCases && e.case_id && <Link className="linkbtn" to={`/case/${e.case_id}`}>Arizani ochish</Link>}
              {onDelete && !e.case_id && <button className="linkbtn" onClick={() => onDelete(e.id)}>O'chirish</button>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AnimalBadge({ species }) {
  return <span className="abadge"><RawIcon paths={animalIcon(species)} size={24} /></span>;
}
