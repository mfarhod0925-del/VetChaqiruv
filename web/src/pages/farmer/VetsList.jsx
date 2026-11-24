import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { KIND_NAMES, SERVICES, VET_STATUS, serviceName } from "../../lib/constants.js";
import { Avatar, ErrorNote, Loading, PhoneLine, Pill } from "../../ui.jsx";
import RegionBar, { useArea } from "./RegionBar.jsx";

const ORDER = { online: 0, busy: 1, offline: 2 };

/** Tumandagi mutaxassislar: veterinarlar va ustalar, xizmat bo'yicha saralanadi */
export default function VetsList() {
  const { region, district } = useArea();
  const [svc, setSvc] = useState("");
  const vets = useLive(
    async () => must(await supabase.from("vets").select("*").eq("region", region).eq("district", district)),
    [region, district], [{ table: "vets" }],
  );
  const vs = (vets.data || [])
    .filter((v) => !svc || (v.services || ["treatment"]).includes(svc))
    .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || a.full_name.localeCompare(b.full_name));

  return (
    <>
      <RegionBar />
      <h1>Mutaxassislar</h1>
      <p className="lead">{district} tumani · {vs.length} ta</p>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className="chip" aria-pressed={!svc} onClick={() => setSvc("")}>Barchasi</button>
        {SERVICES.map((s) => <button key={s.id} className="chip" aria-pressed={svc === s.id} onClick={() => setSvc(s.id)}>{s.n}</button>)}
      </div>
      <ErrorNote error={vets.error} onRetry={vets.reload} />
      {vets.loading && !vets.data ? <Loading /> : vs.length === 0 ? (
        <div className="empty">Bu tumanda {svc ? `«${serviceName(svc)}» bo'yicha ` : ""}hali ro'yxatdan o'tgan mutaxassis yo'q.<span>Tanish veterinar yoki ustangiz bo'lsa, unga ilovani tavsiya qiling.</span></div>
      ) : (
        <div className="list">
          {vs.map((v) => {
            const services = v.services || ["treatment"];
            const to = svc && services.includes(svc) ? svc : services[0];
            return (
              <div className="card" key={v.id}>
                <div className="person">
                  <Avatar name={v.full_name} status={v.status} />
                  <div style={{ minWidth: 0 }}>
                    <h3>{v.full_name}</h3>
                    <div className="meta"><span>{KIND_NAMES[v.kind] || "Veterinar"}</span><span>{v.village || v.district}</span>{v.experience > 0 && <span>{v.experience} yil tajriba</span>}</div>
                    <div className="tags"><Pill s={VET_STATUS[v.status]} />
                      {services.map((s) => <span key={s} className="pill">{serviceName(s)}</span>)}
                      {v.has_ultrasound && <span className="pill ok">UZI apparati bor</span>}</div>
                    {(v.specs || []).length > 0 && <div className="meta">{v.specs.join(", ")}</div>}
                    {v.price_note && <div className="meta" style={{ whiteSpace: "pre-wrap" }}>{v.price_note}</div>}
                  </div>
                </div>
                <PhoneLine phone={v.phone} />
                <Link className="btn primary sm" style={{ width: "100%", marginTop: 8 }} to={`/new?service=${to}&vet=${v.id}`}>Shu mutaxassisga ariza ({serviceName(to)})</Link>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
