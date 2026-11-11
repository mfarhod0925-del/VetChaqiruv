import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useDrugs, useLive } from "../../lib/live.js";
import { RES_STATUS } from "../../lib/constants.js";
import { ago, beep, errText, som } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ErrorNote, Loading, PhoneLine, Pill } from "../../ui.jsx";

export default function Orders() {
  const { uid, pharmacy } = useAuth();
  const { byId } = useDrugs();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const res = useLive(
    async () => must(await supabase.from("reservations").select("*, reservation_items(drug_id, qty, price)")
      .eq("pharmacy_id", uid).order("created_at", { ascending: false }).limit(100)),
    [uid], [{ table: "reservations", filter: `pharmacy_id=eq.${uid}` }],
  );
  const list = res.data || [];
  const open = list.filter((r) => ["new", "ready"].includes(r.status));
  const closed = list.filter((r) => !["new", "ready"].includes(r.status));

  const seen = useRef(null);
  useEffect(() => {
    if (!res.data) return;
    const ids = res.data.filter((r) => r.status === "new").map((r) => r.id);
    if (seen.current && ids.some((i) => !seen.current.includes(i))) { toast("Yangi buyurtma keldi!"); beep(); }
    seen.current = ids;
  }, [res.data, toast]);

  async function setStatus(id, st) {
    setBusy(id);
    try {
      must(await supabase.rpc("set_reservation_status", { p_res: id, p_status: st }));
      toast({ ready: "Chorvadorga «tayyor» deb xabar berildi", done: "Berildi, qoldiqdan ayirildi", cancelled: "Buyurtma rad etildi" }[st]);
      res.reload();
    } catch (e) { toast(errText(e)); }
    setBusy(null);
  }

  if (!pharmacy) {
    return (
      <>
        <h1>Dorixona kabineti</h1>
        <p className="lead">Chorvadorlar dorini qidirib, band qila olishi uchun dorixonangizni ro'yxatdan o'tkazing.</p>
        <Link className="btn primary wide" to="/pharmacy-profile">Ro'yxatdan o'tish</Link>
      </>
    );
  }

  const Card = ({ r }) => (
    <div className="card">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow"><h3>{r.contact_name || "Mijoz"}</h3><div className="meta">{ago(r.created_at)}{r.case_id ? " · retsept bo'yicha" : ""}</div></div>
        <Pill s={RES_STATUS[r.status]} />
      </div>
      <table className="stock"><tbody>
        {(r.reservation_items || []).map((i) => (
          <tr key={i.drug_id}><td>{byId[i.drug_id]?.name || i.drug_id}</td><td>× {i.qty} · {som(i.price * i.qty)}</td></tr>
        ))}
        <tr><td><b>Jami</b></td><td><b>{som(r.total)}</b></td></tr>
      </tbody></table>
      <PhoneLine phone={r.phone} />
      {r.status === "new" && (
        <div className="grid2" style={{ marginTop: 8 }}>
          <button className="btn danger sm" disabled={busy === r.id} onClick={() => setStatus(r.id, "cancelled")}>Rad etish</button>
          <button className="btn dark sm" disabled={busy === r.id} onClick={() => setStatus(r.id, "ready")}>Tayyor</button>
        </div>
      )}
      {r.status === "ready" && (
        <div className="grid2" style={{ marginTop: 8 }}>
          <button className="btn ghost sm" disabled={busy === r.id} onClick={() => setStatus(r.id, "cancelled")}>Olib ketmadi</button>
          <button className="btn dark sm" disabled={busy === r.id} onClick={() => setStatus(r.id, "done")}>Berildi</button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <h1>Buyurtmalar</h1>
      <p className="lead">{pharmacy.name} · {pharmacy.district} tumani</p>
      <ErrorNote error={res.error} onRetry={res.reload} />
      {res.loading && !res.data ? <Loading /> : (
        <>
          {open.length ? <div className="list">{open.map((r) => <Card key={r.id} r={r} />)}</div>
            : <div className="meta">Faol buyurtma yo'q. Chorvador dori band qilsa shu yerda chiqadi va SMS keladi.</div>}
          {closed.length > 0 && <><h2>Tarix</h2><div className="list">{closed.slice(0, 40).map((r) => <Card key={r.id} r={r} />)}</div></>}
        </>
      )}
      <div className="note info" style={{ marginTop: 16 }}>«Berildi» bosilganda dorilar ombordagi qoldiqdan avtomatik ayiriladi.</div>
    </>
  );
}
