import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { supabase, must } from "../lib/supabase.js";
import { useDrugs, useLive } from "../lib/live.js";
import { uploadPhoto } from "../lib/photos.js";
import { CASE_STATUS, URGENCY, VET_STATUS, animalName } from "../lib/constants.js";
import { errText, googleMaps, jitsiUrl, som, when, yandexMaps } from "../lib/util.js";
import { useToast } from "../toast.jsx";
import { Avatar, ConfirmButton, ErrorNote, Icon, Loading, PhoneLine, Pill, StorageImage } from "../ui.jsx";
import { ReservationCard, cancelReservation } from "./farmer/MyCases.jsx";
import { StockPill, usePharmacies } from "./farmer/DrugSearch.jsx";

const STEPS_CALL = [["new", "Ariza yuborildi", "created_at"], ["accepted", "Veterinar qabul qildi", "accepted_at"],
  ["on_way", "Veterinar yo'lda", "on_way_at"], ["arrived", "Yetib keldi", "arrived_at"], ["done", "Yakunlandi", "done_at"]];
const STEPS_VIDEO = [["new", "Ariza yuborildi", "created_at"], ["accepted", "Veterinar qabul qildi", "accepted_at"], ["done", "Yakunlandi", "done_at"]];
const ACTIVE = ["accepted", "on_way", "arrived"];

export default function CaseDetail() {
  const { id } = useParams();
  const { uid, profile, vet } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const live = useLive(
    async () => must(await supabase.from("cases")
      .select("*, vets(id, full_name, phone, village, district, status, specs, experience), prescription_items(id, drug_id, dose, position)")
      .eq("id", id).maybeSingle()),
    [id], [{ table: "cases", filter: `id=eq.${id}` }, { table: "prescription_items", filter: `case_id=eq.${id}` }],
  );
  const c = live.data;
  const back = profile.role === "vet" ? "/inbox" : "/cases";

  if (live.loading && !c) return <Loading />;
  if (!c) {
    return (
      <>
        <Link className="linkbtn" to={back}>← Ortga</Link>
        <ErrorNote error={live.error} onRetry={live.reload} />
        {!live.error && <div className="empty">Ariza topilmadi. Uni boshqa veterinar qabul qilgan yoki bekor qilingan bo'lishi mumkin.</div>}
      </>
    );
  }

  const isFarmer = c.farmer_id === uid;
  const isVet = !isFarmer && Boolean(vet);
  const mine = c.vet_id === uid;
  const steps = c.kind === "video" ? STEPS_VIDEO : STEPS_CALL;
  const idx = steps.findIndex((s) => s[0] === c.status);
  const closed = ["cancelled", "declined"].includes(c.status);
  const canTalk = Boolean(c.vet_id) && !closed && (isFarmer || mine);

  async function rpc(fn, args, ok, after) {
    setBusy(true);
    try { must(await supabase.rpc(fn, args)); if (ok) toast(ok); after ? after() : live.reload(); }
    catch (e) { toast(errText(e)); live.reload(); }
    setBusy(false);
  }

  let actions = null;
  if (isVet) {
    if (c.status === "new" && (!c.vet_id || mine)) {
      actions = (
        <div className="grid2">
          <button className="btn dark" disabled={busy} onClick={() => rpc("accept_case", { p_case: id }, "Ariza qabul qilindi. Chorvadorga xabar ketdi.")}>Qabul qilish</button>
          <button className="btn danger" disabled={busy} onClick={() => rpc("decline_case", { p_case: id }, "Rad etildi", () => nav("/inbox"))}>Rad etish</button>
        </div>
      );
    } else if (mine && c.status === "accepted" && c.kind === "call") {
      actions = <button className="btn dark wide" disabled={busy} onClick={() => rpc("advance_case", { p_case: id, p_status: "on_way" }, "Chorvadorga «yo'lda» deb xabar berildi")}>Yo'lga chiqdim</button>;
    } else if (mine && c.status === "on_way") {
      actions = <button className="btn dark wide" disabled={busy} onClick={() => rpc("advance_case", { p_case: id, p_status: "arrived" }, "«Yetib keldi» belgilandi")}>Yetib keldim</button>;
    } else if (mine && (c.status === "arrived" || (c.status === "accepted" && c.kind === "video"))) {
      actions = <button className="btn dark wide" disabled={busy} onClick={() => rpc("advance_case", { p_case: id, p_status: "done" }, "Chaqiruv yakunlandi")}>Yakunlash</button>;
    }
    if (mine && c.status === "accepted") {
      actions = <>{actions}<ConfirmButton className="btn ghost wide" confirmText="Ha, qaytarish" disabled={busy}
        onConfirm={() => rpc("decline_case", { p_case: id }, "Ariza chorvadorga qaytarildi", () => nav("/inbox"))}>Bora olmayman — qaytarish</ConfirmButton></>;
    }
  }
  if (isFarmer) {
    actions = (
      <>
        {c.status === "declined" && (
          <>
            <div className="note">Veterinar bu arizani qabul qila olmadi.</div>
            <button className="btn dark wide" disabled={busy} onClick={() => rpc("resend_case", { p_case: id }, "Tumandagi barcha veterinarlarga yuborildi")}>Barcha veterinarlarga yuborish</button>
          </>
        )}
        {["new", "accepted", "on_way"].includes(c.status) && (
          <ConfirmButton confirmText="Ha, bekor qilish" disabled={busy} onConfirm={() => rpc("cancel_case", { p_case: id }, "Ariza bekor qilindi")}>Arizani bekor qilish</ConfirmButton>
        )}
      </>
    );
  }

  return (
    <>
      <Link className="linkbtn" to={back}>← {isVet ? "Chaqiruvlar" : "Arizalarim"}</Link>
      <h1>{animalName(c.animal)}{c.animal_count > 1 ? ` × ${c.animal_count}` : ""} · {c.kind === "video" ? "Video maslahat" : "Fermaga chaqiruv"}</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <Pill s={CASE_STATUS[c.status]} /><Pill s={URGENCY[c.urgency]} /><span className="meta">{when(c.created_at)}</span>
      </div>

      <div className="list">
        {isVet ? (
          <div className="card">
            <div className="meta">Chorvador</div>
            <h3>{c.contact_name}</h3>
            <div className="meta">{c.village ? `${c.village}, ` : ""}{c.district} tumani</div>
            <PhoneLine phone={c.phone} />
            {c.lat && (
              <div className="row" style={{ marginTop: 8 }}>
                <a className="btn ghost sm grow" href={googleMaps(c.lat, c.lng)} target="_blank" rel="noreferrer"><Icon name="pin" size={18} />Google xarita</a>
                <a className="btn ghost sm grow" href={yandexMaps(c.lat, c.lng)} target="_blank" rel="noreferrer"><Icon name="pin" size={18} />Yandex xarita</a>
              </div>
            )}
          </div>
        ) : c.vets ? (
          <div className="card">
            <div className="person">
              <Avatar name={c.vets.full_name} status={c.vets.status} />
              <div style={{ minWidth: 0 }}>
                <h3>{c.vets.full_name}</h3>
                <div className="meta"><span>{c.vets.village || c.vets.district}</span>{c.vets.experience > 0 && <span>{c.vets.experience} yil tajriba</span>}</div>
                <div className="tags"><Pill s={VET_STATUS[c.vets.status]} />{(c.vets.specs || []).map((s) => <span key={s} className="pill">{s}</span>)}</div>
              </div>
            </div>
            <PhoneLine phone={c.vets.phone} />
          </div>
        ) : (
          <div className="card"><b>Veterinar kutilmoqda</b>
            <div className="meta">{c.district} tumanidagi veterinarlarga yuborildi. Birinchi qabul qilgan veterinar shu yerda ko'rinadi va sizga SMS keladi.</div></div>
        )}

        <div className="card">
          <div className="meta">Alomatlar</div>
          <div style={{ margin: "4px 0 6px" }}>{(c.symptoms || []).join(", ") || "—"}</div>
          {c.note && <><div className="meta">Izoh</div><div style={{ whiteSpace: "pre-wrap" }}>{c.note}</div></>}
          {c.photo_path && <div style={{ marginTop: 10 }}><StorageImage path={c.photo_path} alt="Hayvon rasmi" /></div>}
        </div>

        {!closed && (
          <div className="card">
            <ol className="steps">
              {steps.map(([k, label, tcol], i) => {
                const done = i < idx || c.status === "done";
                return (
                  <li key={k} className={done ? "done" : i === idx ? "now" : ""}>
                    <span className="dot">{done ? "✓" : i + 1}</span>
                    <div><b>{label}</b>{c[tcol] && <small>{when(c[tcol])}</small>}</div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {actions && <div>{actions}</div>}

        {canTalk && ACTIVE.includes(c.status) && (
          <>
            <a className="btn primary" href={jitsiUrl(c.id)} target="_blank" rel="noreferrer"><Icon name="video" size={20} />Video qo'ng'iroqqa kirish</a>
            <div className="meta" style={{ marginTop: -4 }}>Video yangi oynada ochiladi. Ikkala tomon ham shu tugmani bossin.</div>
          </>
        )}

        <Prescription c={c} canEdit={mine && [...ACTIVE, "done"].includes(c.status)} reload={live.reload} />
        {isFarmer && c.prescription_items?.length > 0 && <PharmacyPanel c={c} />}
        {canTalk && <Chat caseId={c.id} />}
      </div>
    </>
  );
}

function Prescription({ c, canEdit, reload }) {
  const { byId, drugs } = useDrugs();
  const toast = useToast();
  const items = (c.prescription_items || []).slice().sort((a, b) => a.position - b.position);
  const [edit, setEdit] = useState(false);
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  const [k, setK] = useState("");
  const [dose, setDose] = useState("");
  const [busy, setBusy] = useState(false);

  const start = () => { setRows(items.map((i) => ({ drug_id: i.drug_id, dose: i.dose }))); setNote(c.rx_note || ""); setEdit(true); };
  const add = () => { if (!k) { toast("Dorini tanlang"); return; } setRows([...rows, { drug_id: k, dose: dose.trim() }]); setK(""); setDose(""); };
  async function save() {
    setBusy(true);
    try {
      must(await supabase.rpc("save_prescription", { p_case: c.id, p_items: rows, p_note: note.trim() }));
      toast("Retsept chorvadorga yuborildi"); setEdit(false); reload();
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  return (
    <>
      {items.length > 0 && !edit && (
        <>
          <h2>Retsept</h2>
          <div className="rx">
            <header><b>{c.vets?.full_name || "Veterinar"}</b><span>{when(c.rx_at)}</span></header>
            <ol>{items.map((i) => (
              <li key={i.id}><b>{byId[i.drug_id]?.name || i.drug_id}</b><small>{byId[i.drug_id]?.form}{i.dose ? ` — ${i.dose}` : ""}</small></li>
            ))}</ol>
            {c.rx_note && <div style={{ padding: "0 14px 12px", fontSize: 14, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{c.rx_note}</div>}
          </div>
        </>
      )}
      {canEdit && !edit && (
        <button className="btn ghost" onClick={start}>{items.length ? "Retseptni tahrirlash" : "Retsept yozish"}</button>
      )}
      {edit && (
        <>
          <h2>Retsept</h2>
          <div className="card">
            {rows.length ? (
              <div className="list" style={{ gap: 6, marginBottom: 10 }}>
                {rows.map((r, n) => (
                  <div className="row" key={n}>
                    <div className="grow"><b>{byId[r.drug_id]?.name}</b><div className="meta">{r.dose || "Doza ko'rsatilmagan"}</div></div>
                    <button className="btn ghost sm" onClick={() => setRows(rows.filter((_, i) => i !== n))}>O'chirish</button>
                  </div>
                ))}
              </div>
            ) : <div className="meta" style={{ marginBottom: 8 }}>Hali dori qo'shilmagan.</div>}
            <select className="field" aria-label="Dori" value={k} onChange={(e) => setK(e.target.value)}>
              <option value="">Dorini tanlang…</option>
              {drugs.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.form})</option>)}
            </select>
            <div className="row" style={{ marginTop: 8 }}>
              <input className="grow" type="text" aria-label="Doza" placeholder="Doza: 1 ml / 10 kg, 3 kun" value={dose} onChange={(e) => setDose(e.target.value)} style={{ flex: 1 }} />
              <button className="btn ghost sm" onClick={add}>Qo'shish</button>
            </div>
            <textarea aria-label="Tavsiya" placeholder="Qo'shimcha tavsiya: parvarish, ovqatlantirish" value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: 8 }} />
            <div className="grid2" style={{ marginTop: 10 }}>
              <button className="btn ghost" onClick={() => setEdit(false)}>Bekor</button>
              <button className="btn dark" disabled={busy || !rows.length} onClick={save}>{busy ? "Yuborilmoqda…" : "Yuborish"}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function PharmacyPanel({ c }) {
  const { uid } = useAuth();
  const { byId } = useDrugs();
  const toast = useToast();
  const ph = usePharmacies(c.region, c.district);
  const res = useLive(
    async () => must(await supabase.from("reservations").select("*, pharmacies(name, address, phone), reservation_items(drug_id, qty, price)")
      .eq("case_id", c.id).eq("farmer_id", uid).order("created_at", { ascending: false })),
    [c.id], [{ table: "reservations", filter: `farmer_id=eq.${uid}` }],
  );
  const [open, setOpen] = useState(null); // {pharmacy, qty:{drug:n}}
  const [busy, setBusy] = useState(false);
  const items = c.prescription_items || [];
  const ps = (ph.data || []).map((p) => {
    const stock = Object.fromEntries((p.pharmacy_stock || []).map((s) => [s.drug_id, s]));
    return { ...p, stock, have: items.filter((i) => (stock[i.drug_id]?.qty || 0) > 0).length };
  }).sort((a, b) => b.have - a.have);

  async function reserve(p) {
    const list = items.filter((i) => (p.stock[i.drug_id]?.qty || 0) > 0)
      .map((i) => ({ drug_id: i.drug_id, qty: Math.floor(+(open.qty[i.drug_id] ?? 1) || 0) }))
      .filter((i) => i.qty > 0);
    if (!list.length) { toast("Kamida bitta dori sonini kiriting"); return; }
    setBusy(true);
    try {
      must(await supabase.rpc("create_reservation", { p_pharmacy: p.id, p_items: list, p_case: c.id }));
      toast("Dorilar band qilindi. Dorixona tayyorlaganda SMS keladi.");
      setOpen(null); res.reload(); ph.reload();
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  }

  return (
    <>
      <h2>Dorilar qayerda bor?</h2>
      {(res.data || []).length > 0 && (
        <div className="list" style={{ marginBottom: 10 }}>
          {res.data.map((r) => <ReservationCard key={r.id} r={r} onCancel={(rid) => cancelReservation(rid, toast, res.reload)} />)}
        </div>
      )}
      <ErrorNote error={ph.error} onRetry={ph.reload} />
      {ph.loading && !ph.data ? <Loading /> : ps.length === 0 ? (
        <div className="note info">{c.district} tumanida ro'yxatdan o'tgan dorixona hali yo'q. «Dorilar» bo'limida qo'shni tumanlarni ko'rishingiz mumkin.</div>
      ) : (
        <div className="list">
          {ps.map((p) => {
            const isOpen = open?.pharmacy === p.id;
            const total = items.reduce((s, i) => {
              const st = p.stock[i.drug_id];
              if (!st?.qty) return s;
              const q = isOpen ? Math.floor(+(open.qty[i.drug_id] ?? 1) || 0) : 1;
              return s + q * st.price;
            }, 0);
            return (
              <div className="card" key={p.id}>
                <div className="row">
                  <div className="grow"><h3>{p.name}</h3><div className="meta"><span>{p.address}</span>{p.hours && <span>{p.hours}</span>}</div></div>
                  <Pill s={[`${p.have}/${items.length}`, p.have === items.length ? "ok" : p.have ? "warn" : "bad"]} />
                </div>
                <table className="stock"><tbody>
                  {items.map((i) => {
                    const st = p.stock[i.drug_id];
                    return (
                      <tr key={i.id}>
                        <td>{byId[i.drug_id]?.name || i.drug_id}{st?.qty > 0 && <><br /><small className="meta">{som(st.price)}</small></>}</td>
                        <td>{isOpen && st?.qty > 0 ? (
                          <input className="qty" type="number" min="0" max={st.qty} aria-label="Soni" value={open.qty[i.drug_id] ?? 1}
                            onChange={(e) => setOpen({ ...open, qty: { ...open.qty, [i.drug_id]: e.target.value } })} />
                        ) : <StockPill s={st} />}</td>
                      </tr>
                    );
                  })}
                </tbody></table>
                {p.have > 0 && <div className="meta" style={{ marginTop: 6 }}>Taxminiy jami: <b style={{ color: "var(--ink)" }}>{som(total)}</b></div>}
                <PhoneLine phone={p.phone} />
                {isOpen ? (
                  <div className="grid2" style={{ marginTop: 8 }}>
                    <button className="btn ghost sm" onClick={() => setOpen(null)}>Yopish</button>
                    <button className="btn dark sm" disabled={busy} onClick={() => reserve(p)}>{busy ? "…" : "Tasdiqlash"}</button>
                  </div>
                ) : (
                  <button className="btn primary sm" style={{ width: "100%", marginTop: 8 }} disabled={!p.have}
                    onClick={() => setOpen({ pharmacy: p.id, qty: {} })}>Band qilish</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Chat({ caseId }) {
  const { uid } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const box = useRef(null);
  const msgs = useLive(
    async () => must(await supabase.from("messages").select("*").eq("case_id", caseId).order("created_at").limit(300)),
    [caseId], [{ table: "messages", filter: `case_id=eq.${caseId}` }],
  );
  const list = msgs.data || [];

  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [list.length]);

  async function send(photo_path = null) {
    const body = text.trim();
    if (!body && !photo_path) return;
    setText("");
    try {
      must(await supabase.from("messages").insert({ case_id: caseId, sender_id: uid, body, photo_path }));
      msgs.reload();
    } catch (e) { setText(body); toast(errText(e)); }
  }
  async function onPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try { await send(await uploadPhoto(uid, f)); } catch (err) { toast(errText(err)); }
    setUploading(false);
  }

  return (
    <>
      <h2>Yozishma</h2>
      <div className="card">
        <div className="chat" ref={box}>
          {list.length === 0 && <div className="meta" style={{ justifyContent: "center", padding: 12 }}>Savol yozing yoki rasm yuboring.</div>}
          {list.map((m) => (
            <div key={m.id} className={`msg ${m.sender_id === uid ? "me" : "them"}`}>
              {m.body}
              {m.photo_path && <StorageImage path={m.photo_path} className="" />}
              <small>{when(m.created_at)}</small>
            </div>
          ))}
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="iconbtn" title="Rasm yuborish">
            <input type="file" accept="image/*" onChange={onPhoto} disabled={uploading} />
            <Icon name="cam" size={20} />
          </label>
          <input type="text" aria-label="Xabar" placeholder={uploading ? "Rasm yuklanmoqda…" : "Xabar yozing"} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="iconbtn dark" aria-label="Yuborish"><Icon name="send" size={20} /></button>
        </form>
      </div>
    </>
  );
}
