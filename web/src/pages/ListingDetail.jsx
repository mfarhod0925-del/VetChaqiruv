import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { supabase, must } from "../lib/supabase.js";
import { useLive } from "../lib/live.js";
import { LISTING_STATUS, OFFER_STATUS, saleAnimalName } from "../lib/constants.js";
import { ago, errText, parseSom, som, somInput, when } from "../lib/util.js";
import { useToast } from "../toast.jsx";
import { ConfirmButton, ErrorNote, Loading, PhoneLine, Pill, StorageImage } from "../ui.jsx";

export default function ListingDetail() {
  const { id } = useParams();
  const { uid, master } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [contact, setContact] = useState(null);

  const live = useLive(
    async () => must(await supabase.from("listings")
      .select("*, offers(id, buyer_id, price, note, status, created_at, updated_at, masters(full_name, phone, village, district, experience))")
      .eq("id", id).maybeSingle()),
    [id], [{ table: "listings", filter: `id=eq.${id}` }, { table: "offers", filter: `listing_id=eq.${id}` }],
  );
  const l = live.data;
  const isOwner = l?.farmer_id === uid;
  const myOffer = (l?.offers || []).find((o) => o.buyer_id === uid);

  // Taklif qabul qilingan qassobga chorvador telefoni
  useEffect(() => {
    if (myOffer?.status !== "accepted") return;
    supabase.rpc("listing_contact", { p_listing: id }).then(({ data }) => setContact(data?.[0] || null));
  }, [id, myOffer?.status]);

  if (live.loading && !l) return <Loading />;
  const back = isOwner || !master ? "/sell" : "/market";
  if (!l) {
    return (
      <>
        <Link className="linkbtn" to={back}>← Ortga</Link>
        <ErrorNote error={live.error} onRetry={live.reload} />
        {!live.error && <div className="empty">E'lon topilmadi yoki yopilgan.</div>}
      </>
    );
  }

  async function rpc(fn, args, ok) {
    setBusy(true);
    try { must(await supabase.rpc(fn, args)); if (ok) toast(ok); live.reload(); }
    catch (e) { toast(errText(e)); live.reload(); }
    setBusy(false);
  }

  async function offer() {
    const p = parseSom(price);
    if (!p) { toast("Narxni kiriting"); return; }
    await rpc("make_offer", { p_listing: id, p_price: p, p_note: note.trim() }, "Taklif yuborildi. Chorvadorga xabar ketdi.");
    setPrice(""); setNote("");
  }

  const offers = [...(l.offers || [])].filter((o) => isOwner ? o.status !== "withdrawn" : true)
    .sort((a, b) => (a.status === "accepted" ? -1 : b.status === "accepted" ? 1 : b.price - a.price));

  return (
    <>
      <Link className="linkbtn" to={back}>← {isOwner ? "E'lonlarim" : "Bozor"}</Link>
      <h1>{saleAnimalName(l.animal)} · {l.head_count} bosh</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <Pill s={LISTING_STATUS[l.status]} /><span className="meta">{when(l.created_at)}</span>
      </div>

      <div className="list">
        {l.photo_path && <StorageImage path={l.photo_path} alt="Hayvon rasmi" />}
        <div className="card">
          <div className="grid2">
            <div><div className="meta">Vazni (1 bosh)</div><div>{l.weight_kg ? `~${l.weight_kg} kg` : "—"}</div></div>
            <div><div className="meta">Yoshi</div><div>{l.age_text || "—"}</div></div>
          </div>
          <div className="meta" style={{ marginTop: 8 }}>So'ralgan narx (jami)</div>
          <div><b>{l.price ? som(l.price) : "Kelishiladi"}</b></div>
          <div className="meta" style={{ marginTop: 8 }}>Joyi</div>
          <div>{l.village ? `${l.village}, ` : ""}{l.district} tumani, {l.region}</div>
          {l.note && <><div className="meta" style={{ marginTop: 8 }}>Izoh</div><div style={{ whiteSpace: "pre-wrap" }}>{l.note}</div></>}
        </div>

        {/* E'lon egasi: takliflar */}
        {isOwner && (
          <>
            <h2 style={{ margin: "8px 0 0" }}>Takliflar ({offers.length})</h2>
            {offers.length === 0 && <div className="meta">Hali taklif yo'q. Qassoblar taklif bersa, shu yerda ko'rinadi va sizga xabar keladi.</div>}
            {offers.map((o) => (
              <div key={o.id} className="card">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <h3>{som(o.price)}</h3>
                    <div className="meta">{o.masters?.full_name} · {o.masters?.village || o.masters?.district}{o.masters?.experience ? ` · ${o.masters.experience} yil tajriba` : ""}</div>
                    {o.note && <div style={{ marginTop: 4 }}>{o.note}</div>}
                    <div className="meta">{ago(o.updated_at)}</div>
                  </div>
                  <Pill s={OFFER_STATUS[o.status]} />
                </div>
                {o.status === "accepted" && <PhoneLine phone={o.masters?.phone} label="Qassob telefoni" />}
                {o.status === "pending" && l.status === "open" && (
                  <div className="grid2" style={{ marginTop: 10 }}>
                    <button className="btn ghost sm" disabled={busy} onClick={() => rpc("answer_offer", { p_offer: o.id, p_accept: false }, "Taklif rad etildi")}>Rad etish</button>
                    <button className="btn dark sm" disabled={busy} onClick={() => rpc("answer_offer", { p_offer: o.id, p_accept: true }, "Taklif qabul qilindi. Qassobga telefoningiz yuborildi.")}>Qabul qilish</button>
                  </div>
                )}
              </div>
            ))}
            {l.status === "open" && (
              <ConfirmButton confirmText="Ha, yopish" disabled={busy} onConfirm={() => rpc("close_listing", { p_listing: id }, "E'lon yopildi")}>E'lonni yopish</ConfirmButton>
            )}
          </>
        )}

        {/* Qassob: o'z taklifi */}
        {!isOwner && (
          <>
            {myOffer && (
              <div className="card">
                <div className="row"><div className="grow"><div className="meta">Sizning taklifingiz</div><h3>{som(myOffer.price)}</h3></div><Pill s={OFFER_STATUS[myOffer.status]} /></div>
                {myOffer.status === "accepted" && contact && (
                  <>
                    <div className="note info" style={{ marginTop: 8 }}>Chorvador taklifingizni qabul qildi. Olib ketish vaqtini kelishing.</div>
                    <div className="meta">Chorvador: {contact.full_name}{contact.village ? `, ${contact.village}` : ""}</div>
                    <PhoneLine phone={contact.phone} />
                  </>
                )}
                {myOffer.status === "pending" && l.status === "open" && (
                  <button className="btn ghost sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => rpc("withdraw_offer", { p_offer: myOffer.id }, "Taklif qaytarib olindi")}>Taklifni qaytarib olish</button>
                )}
              </div>
            )}
            {l.status === "open" && master && (
              <div className="card">
                <b>{myOffer ? "Narxni o'zgartirish" : "Narx taklif qilish"}</b>
                <label className="label" htmlFor="ofPrice">Jami narx (so'm)</label>
                <input id="ofPrice" type="text" inputMode="numeric" value={price} onChange={(e) => setPrice(somInput(e.target.value))} placeholder="Masalan: 14 500 000" />
                <label className="label" htmlFor="ofNote">Izoh</label>
                <input id="ofNote" type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: ertaga o'zim olib ketaman" />
                <button className="btn primary wide" disabled={busy} onClick={offer}>Taklif yuborish</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
