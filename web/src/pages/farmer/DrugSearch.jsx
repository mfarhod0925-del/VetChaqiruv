import { useState } from "react";
import { supabase, must } from "../../lib/supabase.js";
import { useDrugs, useLive } from "../../lib/live.js";
import { errText, som } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { ErrorNote, Loading, Pill } from "../../ui.jsx";
import RegionBar, { useArea } from "./RegionBar.jsx";

export function StockPill({ s }) {
  const q = s?.qty || 0;
  if (!q) return <Pill s={["Yo'q", "bad"]} />;
  return <Pill s={[q <= 3 ? `Kam · ${q}` : `Bor · ${q}`, q <= 3 ? "warn" : "ok"]} />;
}

export function usePharmacies(region, district) {
  return useLive(
    async () => must(await supabase.from("pharmacies")
      .select("id, name, address, phone, hours, lat, lng, pharmacy_stock(drug_id, qty, price)")
      .eq("region", region).eq("district", district).order("name")),
    [region, district],
    [{ table: "pharmacy_stock" }, { table: "pharmacies" }],
  );
}

export default function DrugSearch() {
  const { region, district } = useArea();
  const { drugs } = useDrugs();
  const toast = useToast();
  const ph = usePharmacies(region, district);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null); // {drug, pharmacy, qty}
  const [busy, setBusy] = useState(false);

  const ps = (ph.data || []).map((p) => ({ ...p, stock: Object.fromEntries((p.pharmacy_stock || []).map((s) => [s.drug_id, s])) }));
  const list = drugs.filter((d) => !q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function reserve() {
    const qty = Math.floor(+open.qty || 0);
    if (qty < 1) { toast("Sonini kiriting"); return; }
    setBusy(true);
    try {
      must(await supabase.rpc("create_reservation", { p_pharmacy: open.pharmacy, p_items: [{ drug_id: open.drug, qty }], p_case: null }));
      toast("Band qilindi. Holatini «Arizalarim» bo'limida kuzatasiz.");
      setOpen(null);
      ph.reload();
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  return (
    <>
      <RegionBar />
      <h1>Dori qidirish</h1>
      <p className="lead">{district} tumanidagi {ps.length} ta vet-dorixona qoldig'i.</p>
      <input type="text" aria-label="Dori nomi" placeholder="Dori nomini yozing, masalan: ivermektin" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorNote error={ph.error} onRetry={ph.reload} />
      {ph.loading && !ph.data ? <Loading /> : ps.length === 0 ? (
        <div className="empty">Bu tumanda hali ro'yxatdan o'tgan dorixona yo'q. Qo'shni tumanni tanlab ko'ring.</div>
      ) : (
        <div className="list" style={{ marginTop: 12 }}>
          {list.length === 0 && <div className="empty">«{q}» topilmadi.</div>}
          {list.map((d) => {
            const where = ps.filter((p) => (p.stock[d.id]?.qty || 0) > 0);
            const shown = [...ps].sort((a, b) => (b.stock[d.id]?.qty || 0) - (a.stock[d.id]?.qty || 0)).slice(0, 6);
            return (
              <div className="card" key={d.id}>
                <div className="row">
                  <div className="grow"><b>{d.name}</b><div className="meta">{d.form}</div></div>
                  <Pill s={where.length ? [`${where.length}/${ps.length} dorixonada`, "ok"] : ["Hech qayerda yo'q", "bad"]} />
                </div>
                <table className="stock"><tbody>
                  {shown.map((p) => {
                    const s = p.stock[d.id];
                    const isOpen = open && open.drug === d.id && open.pharmacy === p.id;
                    return (
                      <tr key={p.id}>
                        <td>{p.name}<br /><small className="meta">{p.address}{p.hours ? ` · ${p.hours}` : ""}</small></td>
                        <td>
                          {isOpen ? (
                            <div className="row" style={{ justifyContent: "flex-end" }}>
                              <input className="qty" type="number" min="1" max={s.qty} aria-label="Soni" value={open.qty}
                                onChange={(e) => setOpen({ ...open, qty: e.target.value })} />
                              <button className="btn dark sm" disabled={busy} onClick={reserve}>OK</button>
                              <button className="linkbtn" onClick={() => setOpen(null)}>Yopish</button>
                            </div>
                          ) : (
                            <>
                              <StockPill s={s} />
                              {s?.qty > 0 && <><br /><small className="meta">{som(s.price)}</small><br />
                                <button className="linkbtn" onClick={() => setOpen({ drug: d.id, pharmacy: p.id, qty: 1 })}>Band qilish</button></>}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody></table>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
