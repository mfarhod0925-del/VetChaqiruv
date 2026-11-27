import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { supabase, must } from "../../lib/supabase.js";
import { useLive } from "../../lib/live.js";
import { OFFER_STATUS, SALE_ANIMALS, saleAnimalName } from "../../lib/constants.js";
import { ago, som } from "../../lib/util.js";
import { ErrorNote, Loading, Pill } from "../../ui.jsx";
import { ListingCard } from "../farmer/Sell.jsx";

/** Qassob: viloyatdagi sotuvdagi chorva va o'z takliflari. */
export default function Market() {
  const { uid, master } = useAuth();
  const [tab, setTab] = useState("open");
  const [animal, setAnimal] = useState("");
  const isBuyer = master?.services?.includes("qassob");

  const open = useLive(
    async () => {
      if (!isBuyer) return [];
      let q = supabase.from("listings").select("*").eq("status", "open").neq("farmer_id", uid)
        .order("created_at", { ascending: false }).limit(100);
      if (animal) q = q.eq("animal", animal);
      const rows = must(await q);
      // O'z tumanidagilar birinchi
      return rows.sort((a, b) => Number(b.district === master.district) - Number(a.district === master.district));
    },
    [uid, master?.region, animal, isBuyer], [{ table: "listings" }],
  );
  const mine = useLive(
    async () => (isBuyer ? must(await supabase.from("offers").select("*, listings(id, animal, head_count, district, status)")
      .eq("buyer_id", uid).order("updated_at", { ascending: false }).limit(50)) : []),
    [uid, isBuyer], [{ table: "offers", filter: `buyer_id=eq.${uid}` }],
  );

  if (!isBuyer) {
    return (
      <>
        <h1>Chorva bozori</h1>
        <p className="lead">Sotuvdagi chorvani ko'rish va narx taklif qilish uchun usta profilida «Qassob» xizmatini belgilang.</p>
        <Link className="btn primary wide" to="/master-profile">Profilni ochish</Link>
      </>
    );
  }

  const list = open.data || [];
  const offers = mine.data || [];
  return (
    <>
      <h1>Chorva bozori</h1>
      <p className="lead">{master.region} bo'yicha sotuvdagi chorva. Yangi e'lon chiqsa, sizga xabar keladi.</p>
      <div className="seg" style={{ "--n": 2 }}>
        <button aria-pressed={tab === "open"} onClick={() => setTab("open")}>Sotuvda ({list.length})</button>
        <button aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>Takliflarim ({offers.length})</button>
      </div>

      {tab === "open" ? (
        <>
          <div className="chips" style={{ marginTop: 12 }}>
            <button className="chip" aria-pressed={!animal} onClick={() => setAnimal("")}>Hammasi</button>
            {SALE_ANIMALS.map((a) => (
              <button key={a.id} className="chip" aria-pressed={animal === a.id} onClick={() => setAnimal(a.id)}>{a.n}</button>
            ))}
          </div>
          <ErrorNote error={open.error} onRetry={open.reload} />
          {open.loading && !open.data ? <Loading /> : list.length === 0 ? (
            <div className="empty">Hozircha sotuvda chorva yo'q.</div>
          ) : (
            <div className="list" style={{ marginTop: 12 }}>{list.map((l) => <ListingCard key={l.id} l={l} showOwner />)}</div>
          )}
        </>
      ) : (
        <>
          <ErrorNote error={mine.error} onRetry={mine.reload} />
          {offers.length === 0 ? <div className="empty">Hali taklif bermagansiz.</div> : (
            <div className="list" style={{ marginTop: 12 }}>
              {offers.map((o) => (
                <Link key={o.id} className="card" to={`/listing/${o.listing_id}`}>
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <div className="grow">
                      <h3>{saleAnimalName(o.listings?.animal)} · {o.listings?.head_count} bosh</h3>
                      <div className="meta"><span>{o.listings?.district}</span><span>{ago(o.updated_at)}</span></div>
                      <div className="meta">Taklifingiz: <b style={{ color: "var(--ink)" }}>{som(o.price)}</b></div>
                    </div>
                    <Pill s={OFFER_STATUS[o.status]} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
