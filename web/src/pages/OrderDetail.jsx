import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { supabase, must } from "../lib/supabase.js";
import { useLive } from "../lib/live.js";
import { ORDER_STATUS, VET_STATUS, saleAnimalName, serviceName } from "../lib/constants.js";
import { errText, fmtDate, googleMaps, when, yandexMaps } from "../lib/util.js";
import { useToast } from "../toast.jsx";
import { Avatar, ConfirmButton, ErrorNote, Icon, Loading, PhoneLine, Pill } from "../ui.jsx";

const STEPS = [["new", "Buyurtma yuborildi", "created_at"], ["accepted", "Usta qabul qildi", "accepted_at"],
  ["on_way", "Usta yo'lda", "on_way_at"], ["done", "Bajarildi", "done_at"]];

const RESULT_PLACEHOLDER = {
  urug: "Buqa zoti va urug' raqami, masalan: Golshteyn, №4512",
  homila: "Izoh, masalan: taxminan 2 oylik",
  jun: "Masalan: 40 bosh qirqildi, 95 kg jun",
  qassob: "Masalan: go'sht 180 kg, bo'laklab berildi",
};

export default function OrderDetail() {
  const { id } = useParams();
  const { uid, master } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [finish, setFinish] = useState(false);
  const [result, setResult] = useState("");
  const [pregnant, setPregnant] = useState(null);

  const live = useLive(
    async () => must(await supabase.from("service_orders")
      .select("*, masters(id, full_name, phone, village, district, status, experience, about)")
      .eq("id", id).maybeSingle()),
    [id], [{ table: "service_orders", filter: `id=eq.${id}` }],
  );
  const o = live.data;

  if (live.loading && !o) return <Loading />;
  const isFarmer = o?.farmer_id === uid;
  const back = isFarmer || !master ? "/cases" : "/jobs";
  if (!o) {
    return (
      <>
        <Link className="linkbtn" to={back}>← Ortga</Link>
        <ErrorNote error={live.error} onRetry={live.reload} />
        {!live.error && <div className="empty">Buyurtma topilmadi. Uni boshqa usta qabul qilgan yoki bekor qilingan bo'lishi mumkin.</div>}
      </>
    );
  }

  const mine = o.master_id === uid;
  const isMaster = !isFarmer && Boolean(master);
  const idx = STEPS.findIndex((s) => s[0] === o.status);
  const closed = ["cancelled", "declined"].includes(o.status);

  async function rpc(fn, args, ok, after) {
    setBusy(true);
    try { must(await supabase.rpc(fn, args)); if (ok) toast(ok); after ? after() : live.reload(); }
    catch (e) { toast(errText(e)); live.reload(); }
    setBusy(false);
  }

  let actions = null;
  if (isMaster) {
    if (o.status === "new" && (!o.master_id || mine)) {
      actions = (
        <div className="grid2">
          <button className="btn dark" disabled={busy} onClick={() => rpc("accept_order", { p_order: id }, "Qabul qilindi. Chorvadorga xabar ketdi.")}>Qabul qilish</button>
          <button className="btn danger" disabled={busy} onClick={() => rpc("decline_order", { p_order: id }, "Rad etildi", () => nav("/jobs"))}>Rad etish</button>
        </div>
      );
    } else if (mine && ["accepted", "on_way"].includes(o.status)) {
      actions = finish ? (
        <div className="card">
          <b>Ish natijasi</b>
          {o.service === "homila" && (
            <div className="seg" style={{ "--n": 2, marginTop: 8 }}>
              <button className="t-ok" aria-pressed={pregnant === true} onClick={() => setPregnant(true)}>Bo'g'oz</button>
              <button className="t-bad" aria-pressed={pregnant === false} onClick={() => setPregnant(false)}>Bo'g'oz emas</button>
            </div>
          )}
          <textarea style={{ marginTop: 8 }} value={result} maxLength={500} onChange={(e) => setResult(e.target.value)}
            placeholder={RESULT_PLACEHOLDER[o.service]} aria-label="Natija" />
          <div className="grid2" style={{ marginTop: 8 }}>
            <button className="btn ghost" onClick={() => setFinish(false)}>Ortga</button>
            <button className="btn dark" disabled={busy || (o.service === "homila" && pregnant === null)}
              onClick={() => rpc("advance_order", { p_order: id, p_status: "done", p_result: result.trim(), p_pregnant: pregnant },
                "Bajarildi. Chorvadorga xabar ketdi.", () => { setFinish(false); live.reload(); })}>Yakunlash</button>
          </div>
        </div>
      ) : (
        <>
          {o.status === "accepted" && (
            <button className="btn dark wide" disabled={busy} onClick={() => rpc("advance_order", { p_order: id, p_status: "on_way" }, "Chorvadorga «yo'lda» deb xabar berildi")}>Yo'lga chiqdim</button>
          )}
          <button className={`btn ${o.status === "on_way" ? "dark" : "ghost"} wide`} onClick={() => setFinish(true)}>Ish bajarildi</button>
          {o.status === "accepted" && (
            <ConfirmButton className="btn ghost wide" confirmText="Ha, qaytarish" disabled={busy}
              onConfirm={() => rpc("decline_order", { p_order: id }, "Buyurtma chorvadorga qaytarildi", () => nav("/jobs"))}>Bora olmayman — qaytarish</ConfirmButton>
          )}
        </>
      );
    }
  }
  if (isFarmer) {
    actions = (
      <>
        {o.status === "declined" && (
          <>
            <div className="note">Usta bu buyurtmani qabul qila olmadi.</div>
            <button className="btn dark wide" disabled={busy} onClick={() => rpc("resend_order", { p_order: id }, "Tumandagi barcha ustalarga yuborildi")}>Barcha ustalarga yuborish</button>
          </>
        )}
        {["new", "accepted", "on_way"].includes(o.status) && (
          <ConfirmButton confirmText="Ha, bekor qilish" disabled={busy} onConfirm={() => rpc("cancel_order", { p_order: id }, "Buyurtma bekor qilindi")}>Buyurtmani bekor qilish</ConfirmButton>
        )}
      </>
    );
  }

  return (
    <>
      <Link className="linkbtn" to={back}>← {isFarmer ? "Arizalarim" : "Buyurtmalar"}</Link>
      <h1>{serviceName(o.service)}</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <Pill s={ORDER_STATUS[o.status]} /><span className="meta">{when(o.created_at)}</span>
      </div>

      <div className="list">
        {!isFarmer ? (
          <div className="card">
            <div className="meta">Chorvador</div>
            <h3>{o.contact_name}</h3>
            <div className="meta">{o.village ? `${o.village}, ` : ""}{o.district} tumani</div>
            <PhoneLine phone={o.phone} />
            {o.lat && (
              <div className="row" style={{ marginTop: 8 }}>
                <a className="btn ghost sm grow" href={googleMaps(o.lat, o.lng)} target="_blank" rel="noreferrer"><Icon name="pin" size={18} />Google xarita</a>
                <a className="btn ghost sm grow" href={yandexMaps(o.lat, o.lng)} target="_blank" rel="noreferrer"><Icon name="pin" size={18} />Yandex xarita</a>
              </div>
            )}
          </div>
        ) : o.masters ? (
          <div className="card">
            <div className="person">
              <Avatar name={o.masters.full_name} status={o.masters.status} />
              <div style={{ minWidth: 0 }}>
                <h3>{o.masters.full_name}</h3>
                <div className="meta"><span>{o.masters.village || o.masters.district}</span>{o.masters.experience > 0 && <span>{o.masters.experience} yil tajriba</span>}</div>
                {o.masters.about && <div className="meta">{o.masters.about}</div>}
                <div className="tags"><Pill s={VET_STATUS[o.masters.status]} /></div>
              </div>
            </div>
            <PhoneLine phone={o.masters.phone} />
          </div>
        ) : (
          <div className="card"><b>Usta kutilmoqda</b>
            <div className="meta">{o.district} tumanidagi ustalarga yuborildi. Birinchi qabul qilgan usta shu yerda ko'rinadi va sizga xabar keladi.</div></div>
        )}

        <div className="card">
          <div className="meta">Hayvon</div>
          <div>{saleAnimalName(o.animal)}{o.animal_count > 1 ? ` · ${o.animal_count} bosh` : ""}</div>
          {o.preferred_date && <><div className="meta" style={{ marginTop: 6 }}>Kerakli kun</div><div>{fmtDate(o.preferred_date)}</div></>}
          {o.note && <><div className="meta" style={{ marginTop: 6 }}>Izoh</div><div style={{ whiteSpace: "pre-wrap" }}>{o.note}</div></>}
          {o.animal_id && isFarmer && <Link className="linkbtn" to={`/animals/${o.animal_id}`}>Taqvimda ko'rish</Link>}
        </div>

        {o.status === "done" && (o.result || o.pregnant !== null) && (
          <div className="card">
            <div className="meta">Natija</div>
            {o.pregnant !== null && <Pill s={o.pregnant ? ["Bo'g'oz", "ok"] : ["Bo'g'oz emas", "bad"]} />}
            {o.result && <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{o.result}</div>}
          </div>
        )}

        {!closed && (
          <div className="card">
            <ol className="steps">
              {STEPS.map(([k, t, at], i) => (
                <li key={k} className={i < idx || o.status === "done" ? "done" : i === idx ? "now" : ""}>
                  <span className="dot">{i < idx || o.status === "done" ? "✓" : i + 1}</span>
                  <div><b>{t}</b>{o[at] && <small>{when(o[at])}</small>}</div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      {actions}
    </>
  );
}
