import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { VET_STATUS } from "../../lib/constants.js";
import { beep, errText } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ErrorNote, Loading } from "../../ui.jsx";
import { CaseCard } from "../farmer/MyCases.jsx";

export default function Inbox() {
  const { uid, vet, reload } = useAuth();
  const toast = useToast();
  const cases = useLive(
    async () => {
      if (!vet) return [];
      // RLS faqat ruxsat etilganlarni qaytaradi: o'z tumanidagi ochiq arizalar + o'ziga biriktirilganlar
      const rows = must(await supabase.from("cases").select("*").neq("farmer_id", uid)
        .order("created_at", { ascending: false }).limit(150));
      return rows.filter((c) => c.vet_id === uid || (!c.vet_id && c.status === "new"));
    },
    [uid, vet?.district], [{ table: "cases" }],
  );

  const list = cases.data || [];
  const fresh = list.filter((c) => c.status === "new");
  const active = list.filter((c) => ["accepted", "on_way", "arrived"].includes(c.status));
  const old = list.filter((c) => ["done", "cancelled", "declined"].includes(c.status));

  // Yangi ariza kelganda signal
  const seen = useRef(null);
  useEffect(() => {
    if (!cases.data) return;
    const ids = fresh.map((c) => c.id);
    if (seen.current && ids.some((i) => !seen.current.includes(i))) { toast("Yangi chaqiruv keldi!"); beep(); }
    seen.current = ids;
    document.title = ids.length ? `(${ids.length}) VetChaqiruv` : "VetChaqiruv";
    return () => { document.title = "VetChaqiruv"; };
  }, [cases.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(status) {
    try { must(await supabase.from("vets").update({ status }).eq("id", uid)); await reload(); toast(`Holat: ${VET_STATUS[status][0]}`); }
    catch (e) { toast(errText(e)); }
  }

  if (!vet) {
    return (
      <>
        <h1>Veterinar kabineti</h1>
        <p className="lead">Chorvadorlar sizni topishi va chaqiruvlar kelishi uchun avval veterinar profilini yarating.</p>
        <Link className="btn primary wide" to="/vet-profile">Profil yaratish</Link>
      </>
    );
  }

  return (
    <>
      <h1>Chaqiruvlar</h1>
      <div className="card" style={{ marginBottom: 6 }}>
        <div className="row"><div className="grow"><b>{vet.full_name}</b><div className="meta">{vet.district} tumani · {vet.region}</div></div></div>
        <div className="seg" style={{ marginTop: 10 }}>
          {Object.entries(VET_STATUS).map(([k, [t]]) => (
            <button key={k} aria-pressed={vet.status === k} onClick={() => setStatus(k)}>{t}</button>
          ))}
        </div>
        {vet.status === "offline" && <div className="meta" style={{ marginTop: 6 }}>«Ishda emas» holatida yangi arizalar haqida SMS kelmaydi.</div>}
      </div>
      <ErrorNote error={cases.error} onRetry={cases.reload} />
      {cases.loading && !cases.data ? <Loading /> : (
        <>
          <h2>Yangi ({fresh.length})</h2>
          {fresh.length ? <div className="list">{fresh.map((c) => <CaseCard key={c.id} c={c} forVet />)}</div>
            : <div className="meta">Yangi ariza yo'q. Ariza kelsa shu yerda chiqadi va telefoningizga SMS keladi.</div>}
          <h2>Faol ({active.length})</h2>
          {active.length ? <div className="list">{active.map((c) => <CaseCard key={c.id} c={c} forVet />)}</div>
            : <div className="meta">Faol chaqiruv yo'q.</div>}
          {old.length > 0 && <><h2>Tarix</h2><div className="list">{old.slice(0, 30).map((c) => <CaseCard key={c.id} c={c} forVet />)}</div></>}
        </>
      )}
    </>
  );
}
