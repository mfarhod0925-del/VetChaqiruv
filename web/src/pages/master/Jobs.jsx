import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { ORDER_STATUS, VET_STATUS, saleAnimalName, serviceName } from "../../lib/constants.js";
import { ago, beep, errText, fmtDate } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ErrorNote, Loading, Pill } from "../../ui.jsx";

export function OrderCard({ o, forMaster }) {
  return (
    <Link className="card" to={`/order/${o.id}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <h3>{serviceName(o.service)}</h3>
          <div className="meta">{saleAnimalName(o.animal)}{o.animal_count > 1 ? `, ${o.animal_count} bosh` : ""}{o.preferred_date ? ` · ${fmtDate(o.preferred_date)}` : ""}</div>
          <div className="meta">
            <span>{forMaster ? `${o.contact_name} · ${o.village || o.district}` : o.masters?.full_name || "Barcha ustalarga"}</span>
            <span>{ago(o.created_at)}</span>
          </div>
        </div>
        <div className="right">
          <Pill s={ORDER_STATUS[o.status]} />
          {o.pregnant !== null && o.pregnant !== undefined && <Pill s={o.pregnant ? ["Bo'g'oz", "ok"] : ["Bo'g'oz emas", "bad"]} />}
        </div>
      </div>
    </Link>
  );
}

export default function Jobs() {
  const { uid, master, reload } = useAuth();
  const toast = useToast();
  const orders = useLive(
    async () => {
      if (!master) return [];
      // RLS faqat ruxsat etilganlarni qaytaradi: tumandagi ochiq buyurtmalar (o'z xizmatlari bo'yicha) + o'ziga biriktirilganlar
      const rows = must(await supabase.from("service_orders").select("*").neq("farmer_id", uid)
        .order("created_at", { ascending: false }).limit(150));
      return rows.filter((o) => o.master_id === uid || (!o.master_id && o.status === "new"));
    },
    [uid, master?.district, (master?.services || []).join()], [{ table: "service_orders" }],
  );

  const list = orders.data || [];
  const fresh = list.filter((o) => o.status === "new");
  const active = list.filter((o) => ["accepted", "on_way"].includes(o.status));
  const old = list.filter((o) => ["done", "cancelled", "declined"].includes(o.status));

  const seen = useRef(null);
  useEffect(() => {
    if (!orders.data) return;
    const ids = fresh.map((o) => o.id);
    if (seen.current && ids.some((i) => !seen.current.includes(i))) { toast("Yangi buyurtma keldi!"); beep(); }
    seen.current = ids;
  }, [orders.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(status) {
    try { must(await supabase.from("masters").update({ status }).eq("id", uid)); await reload(); toast(`Holat: ${VET_STATUS[status][0]}`); }
    catch (e) { toast(errText(e)); }
  }

  if (!master) {
    return (
      <>
        <h1>Usta kabineti</h1>
        <p className="lead">Tumaningizdagi chorvadorlar sizni topishi va buyurtmalar kelishi uchun avval usta profilini yarating.</p>
        <Link className="btn primary wide" to="/master-profile">Profil yaratish</Link>
      </>
    );
  }

  return (
    <>
      <h1>Buyurtmalar</h1>
      <div className="card" style={{ marginBottom: 6 }}>
        <div className="row"><div className="grow"><b>{master.full_name}</b>
          <div className="meta">{master.district} tumani · {(master.services || []).map(serviceName).join(", ")}</div></div></div>
        <div className="seg" style={{ marginTop: 10 }}>
          {Object.entries(VET_STATUS).map(([k, [t]]) => (
            <button key={k} aria-pressed={master.status === k} onClick={() => setStatus(k)}>{t}</button>
          ))}
        </div>
        {master.status === "offline" && <div className="meta" style={{ marginTop: 6 }}>«Ishda emas» holatida yangi buyurtmalar haqida xabar kelmaydi.</div>}
      </div>
      <ErrorNote error={orders.error} onRetry={orders.reload} />
      {orders.loading && !orders.data ? <Loading /> : (
        <>
          <h2>Yangi ({fresh.length})</h2>
          {fresh.length ? <div className="list">{fresh.map((o) => <OrderCard key={o.id} o={o} forMaster />)}</div>
            : <div className="meta">Yangi buyurtma yo'q. Buyurtma kelsa shu yerda chiqadi va Telegram yoki SMS orqali xabar keladi.</div>}
          <h2>Faol ({active.length})</h2>
          {active.length ? <div className="list">{active.map((o) => <OrderCard key={o.id} o={o} forMaster />)}</div>
            : <div className="meta">Faol buyurtma yo'q.</div>}
          {old.length > 0 && <><h2>Tarix</h2><div className="list">{old.slice(0, 30).map((o) => <OrderCard key={o.id} o={o} forMaster />)}</div></>}
        </>
      )}
    </>
  );
}
