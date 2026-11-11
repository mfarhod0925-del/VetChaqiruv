import { Link } from "react-router-dom";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { VET_STATUS } from "../../lib/constants.js";
import { Avatar, ErrorNote, Loading, PhoneLine, Pill } from "../../ui.jsx";
import RegionBar, { useArea } from "./RegionBar.jsx";

const ORDER = { online: 0, busy: 1, offline: 2 };

export default function VetsList() {
  const { region, district } = useArea();
  const vets = useLive(
    async () => must(await supabase.from("vets").select("*").eq("region", region).eq("district", district)),
    [region, district], [{ table: "vets" }],
  );
  const vs = (vets.data || []).slice().sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || a.full_name.localeCompare(b.full_name));

  return (
    <>
      <RegionBar />
      <h1>Veterinarlar</h1>
      <p className="lead">{district} tumani · {vs.length} ta</p>
      <ErrorNote error={vets.error} onRetry={vets.reload} />
      {vets.loading && !vets.data ? <Loading /> : vs.length === 0 ? (
        <div className="empty">Bu tumanda hali ro'yxatdan o'tgan veterinar yo'q.<span>Tanish veterinaringiz bo'lsa, unga ilovani tavsiya qiling.</span></div>
      ) : (
        <div className="list">
          {vs.map((v) => (
            <div className="card" key={v.id}>
              <div className="person">
                <Avatar name={v.full_name} status={v.status} />
                <div style={{ minWidth: 0 }}>
                  <h3>{v.full_name}</h3>
                  <div className="meta"><span>{v.village || v.district}</span>{v.experience > 0 && <span>{v.experience} yil tajriba</span>}</div>
                  <div className="tags"><Pill s={VET_STATUS[v.status]} />{(v.specs || []).map((s) => <span key={s} className="pill">{s}</span>)}</div>
                </div>
              </div>
              <PhoneLine phone={v.phone} />
              <Link className="btn primary sm" style={{ width: "100%", marginTop: 8 }} to={`/new?vet=${v.id}`}>Shu veterinarga ariza yuborish</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
