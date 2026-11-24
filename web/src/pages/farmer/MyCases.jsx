import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useDrugs, useLive } from "../../lib/live.js";
import { CASE_STATUS, RES_STATUS, animalName, providerWord, serviceName } from "../../lib/constants.js";
import { fmtDate } from "../../lib/animalcare.js";
import { ago, errText, som } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ErrorNote, Loading, Pill } from "../../ui.jsx";

const STATUS_TOAST = {
  accepted: (w) => `${w} arizangizni qabul qildi`,
  on_way: (w) => `${w} yo'lga chiqdi`,
  arrived: (w) => `${w} yetib keldi`,
  declined: (w) => `${w} arizani qabul qila olmadi`,
};
const Cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ariza sarlavhasi: davolashda "Sigir · Fermaga chaqiruv", boshqa xizmatda "Jun olish · Qo'y × 25" */
export function caseTitle(c) {
  const cnt = c.animal_count > 1 ? ` × ${c.animal_count}` : "";
  if (!c.service || c.service === "treatment") return `${animalName(c.animal)}${cnt} · ${c.kind === "video" ? "Video maslahat" : "Fermaga chaqiruv"}`;
  return `${serviceName(c.service)} · ${animalName(c.animal)}${cnt}`;
}
function caseLine(c) {
  const d = c.details || {};
  if (!c.service || c.service === "treatment") return (c.symptoms || []).join(", ") || c.note || "Alomat ko'rsatilmagan";
  const parts = [];
  if (c.preferred_date) parts.push(`Sana: ${fmtDate(c.preferred_date)}`);
  if (d.tasks?.length) parts.push(d.tasks.join(", "));
  if (d.heat_signs?.length) parts.push(d.heat_signs.join(", "));
  if (d.ins_date) parts.push(`Urug'lantirilgan: ${fmtDate(d.ins_date)}`);
  return parts.join(" · ") || c.note || "";
}

export function CaseCard({ c, forVet }) {
  return (
    <Link className="card" to={`/case/${c.id}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <h3>{caseTitle(c)}</h3>
          {caseLine(c) && <div className="meta">{caseLine(c)}</div>}
          <div className="meta">
            <span>{forVet ? `${c.contact_name} · ${c.village || c.district}` : c.vets?.full_name || `Barcha ${providerWord(c.service, true)}ga`}</span>
            <span>{ago(c.created_at)}</span>
          </div>
        </div>
        <div className="right">
          <Pill s={CASE_STATUS[c.status]} />
          {c.urgency === "shoshilinch" && c.status === "new" && <Pill s={["Shoshilinch", "bad"]} />}
          {c.rx_at && <Pill s={["Retsept", "mute"]} />}
          {c.result_at && <Pill s={["Natija", "mute"]} />}
        </div>
      </div>
    </Link>
  );
}

export function ReservationCard({ r, onCancel }) {
  const { byId } = useDrugs();
  return (
    <div className="card">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <h3>{r.pharmacies?.name || "Dorixona"}</h3>
          <div className="meta">{r.pharmacies?.address}</div>
          <div className="meta">{(r.reservation_items || []).map((i) => `${byId[i.drug_id]?.name || i.drug_id} × ${i.qty}`).join(", ")}</div>
          <div className="meta"><b style={{ color: "var(--ink)" }}>{som(r.total)}</b><span>{ago(r.created_at)}</span></div>
        </div>
        <Pill s={RES_STATUS[r.status]} />
      </div>
      {r.status === "ready" && <div className="note info">Dorilar tayyor. Dorixonaga borib olishingiz mumkin.</div>}
      {onCancel && ["new", "ready"].includes(r.status) && (
        <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => onCancel(r.id)}>Buyurtmani bekor qilish</button>
      )}
    </div>
  );
}

export async function cancelReservation(id, toast, reload) {
  try { must(await supabase.rpc("set_reservation_status", { p_res: id, p_status: "cancelled" })); toast("Buyurtma bekor qilindi"); reload(); }
  catch (e) { toast(errText(e)); }
}

export default function MyCases() {
  const { uid } = useAuth();
  const toast = useToast();
  const cases = useLive(
    async () => must(await supabase.from("cases").select("*, vets(full_name)").eq("farmer_id", uid).order("created_at", { ascending: false }).limit(50)),
    [uid], [{ table: "cases", filter: `farmer_id=eq.${uid}` }],
  );
  const res = useLive(
    async () => must(await supabase.from("reservations").select("*, pharmacies(name, address, phone), reservation_items(drug_id, qty, price)")
      .eq("farmer_id", uid).order("created_at", { ascending: false }).limit(30)),
    [uid], [{ table: "reservations", filter: `farmer_id=eq.${uid}` }],
  );

  // Holat o'zgarganda xabar beramiz
  const prev = useRef(null);
  useEffect(() => {
    if (!cases.data) return;
    const now = Object.fromEntries(cases.data.map((c) => [c.id, c.status]));
    if (prev.current) {
      for (const c of cases.data) {
        const st = c.status;
        if (prev.current[c.id] && prev.current[c.id] !== st && STATUS_TOAST[st]) toast(STATUS_TOAST[st](Cap(providerWord(c.service))));
      }
    }
    prev.current = now;
  }, [cases.data, toast]);

  const list = cases.data || [];
  const active = list.filter((c) => ["new", "accepted", "on_way", "arrived", "declined"].includes(c.status));
  const old = list.filter((c) => !active.includes(c));
  const rs = res.data || [];

  return (
    <>
      <h1>Arizalarim</h1>
      <ErrorNote error={cases.error} onRetry={cases.reload} />
      {cases.loading && !cases.data ? <Loading /> : list.length === 0 ? (
        <div className="empty">Hozircha ariza yo'q.<Link className="btn dark" to="/new">Yangi ariza</Link></div>
      ) : (
        <>
          {active.length > 0 && <div className="list">{active.map((c) => <CaseCard key={c.id} c={c} />)}</div>}
          {old.length > 0 && <><h2>Tarix</h2><div className="list">{old.map((c) => <CaseCard key={c.id} c={c} />)}</div></>}
        </>
      )}
      {rs.length > 0 && (
        <>
          <h2>Dori buyurtmalari</h2>
          <div className="list">{rs.map((r) => <ReservationCard key={r.id} r={r} onCancel={(id) => cancelReservation(id, toast, res.reload)} />)}</div>
        </>
      )}
    </>
  );
}
