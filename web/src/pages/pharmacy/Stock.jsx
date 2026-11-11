import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useDrugs, useLive } from "../../lib/live.js";
import { errText } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ErrorNote, Loading } from "../../ui.jsx";

export default function Stock() {
  const { uid, pharmacy } = useAuth();
  const { drugs } = useDrugs();
  const toast = useToast();
  const stock = useLive(
    async () => must(await supabase.from("pharmacy_stock").select("drug_id, qty, price").eq("pharmacy_id", uid)),
    [uid], [],
  );
  const [edit, setEdit] = useState({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const saved = Object.fromEntries((stock.data || []).map((s) => [s.drug_id, s]));

  const val = (d, k) => edit[d.id]?.[k] ?? saved[d.id]?.[k] ?? (k === "price" ? d.default_price : 0);
  const changed = Object.keys(edit).filter((id) => {
    const d = drugs.find((x) => x.id === id);
    return d && (String(val(d, "qty")) !== String(saved[id]?.qty ?? 0) || String(val(d, "price")) !== String(saved[id]?.price ?? d.default_price));
  });
  const setV = (id, k, v) => setEdit((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));

  async function save() {
    const rows = changed.map((id) => {
      const d = drugs.find((x) => x.id === id);
      return { drug_id: id, qty: Math.max(0, Math.floor(+val(d, "qty") || 0)), price: Math.max(0, Math.round(+val(d, "price") || 0)) };
    });
    if (!rows.length) { toast("O'zgarish yo'q"); return; }
    setBusy(true);
    try { must(await supabase.rpc("save_stock", { p_rows: rows })); toast(`${rows.length} ta dori saqlandi`); await stock.reload(); setEdit({}); }
    catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  if (!pharmacy) {
    return (<><h1>Ombor</h1><p className="lead">Avval dorixonani ro'yxatdan o'tkazing.</p><Link className="btn primary wide" to="/pharmacy-profile">Ro'yxatdan o'tish</Link></>);
  }

  const inStock = drugs.filter((d) => (saved[d.id]?.qty || 0) > 0).length;
  const list = drugs.filter((d) => !q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <h1>Ombor qoldig'i</h1>
      <p className="lead">{inStock} xil dori mavjud. Sonini va narxini (so'm) kiriting, so'ng saqlang.</p>
      <input type="text" aria-label="Qidirish" placeholder="Dorini qidirish" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      <ErrorNote error={stock.error} onRetry={stock.reload} />
      {stock.loading && !stock.data ? <Loading /> : (
        <div className="card">
          <div className="stockedit">
            <span className="h">Dori</span><span className="h" style={{ textAlign: "right" }}>Soni</span><span className="h" style={{ textAlign: "right" }}>Narxi</span>
            {list.map((d) => {
              const ch = changed.includes(d.id);
              return [
                <div key={`${d.id}n`} style={{ minWidth: 0 }}><b style={{ fontWeight: 500 }}>{d.name}</b><div className="meta" style={{ fontSize: 12 }}>{d.form}</div></div>,
                <input key={`${d.id}q`} className={ch ? "changed" : ""} type="number" min="0" inputMode="numeric" aria-label={`${d.name} soni`}
                  value={val(d, "qty")} onChange={(e) => setV(d.id, "qty", e.target.value)} />,
                <input key={`${d.id}p`} className={ch ? "changed" : ""} type="number" min="0" step="500" inputMode="numeric" aria-label={`${d.name} narxi`}
                  value={val(d, "price")} onChange={(e) => setV(d.id, "price", e.target.value)} />,
              ];
            })}
          </div>
        </div>
      )}
      <div className="sticky-cta">
        <button className="btn primary wide" style={{ marginTop: 0 }} disabled={busy || !changed.length} onClick={save}>
          {busy ? "Saqlanmoqda…" : changed.length ? `Saqlash (${changed.length})` : "Saqlangan"}
        </button>
      </div>
    </>
  );
}
