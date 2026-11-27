import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { SERVICES } from "../lib/constants.js";
import { Icon } from "../ui.jsx";
import RegionBar from "./farmer/RegionBar.jsx";

const Tile = ({ to, icon, title, text }) => (
  <Link className="card svc" to={to}>
    <span className="svc-ic"><Icon name={icon} size={24} /></span>
    <b>{title}</b>
    <span>{text}</span>
  </Link>
);

/** Chorvador uchun barcha xizmatlar bitta joyda. */
export default function Services() {
  const { master } = useAuth();
  return (
    <>
      <RegionBar />
      <h1>Xizmatlar</h1>
      <p className="lead">Tumaningizdagi mutaxassislarni chaqiring yoki chorvangizni soting.</p>

      <h2>Veterinariya</h2>
      <div className="svcgrid">
        <Tile to="/new" icon="vet" title="Veterinar chaqirish" text="Kasal hayvon uchun ariza" />
        <Tile to="/vets" icon="user" title="Veterinarlar" text="Tumandagi veterinarlar ro'yxati" />
        <Tile to="/drugs" icon="pharm" title="Dorilar" text="Qaysi dorixonada borligini bilish" />
        <Tile to="/ai" icon="spark" title="AI maslahatchi" text="Boqish va parvarish bo'yicha savol" />
      </div>

      <h2>Ustalar</h2>
      <div className="svcgrid">
        {Object.entries(SERVICES).map(([k, s]) => (
          <Tile key={k} to={`/order/new?s=${k}`} icon={s.icon} title={s.n} text={s.d} />
        ))}
      </div>

      <h2>Bozor va taqvim</h2>
      <div className="svcgrid">
        <Tile to="/sell" icon="tag" title="Chorva sotish" text="E'lon bering, qassoblar narx taklif qiladi" />
        <Tile to="/animals" icon="cal" title="Hayvon taqvimi" text="Urug'lantirish, tekshiruv va tug'ish kunlari" />
      </div>

      {!master && (
        <div className="card" style={{ marginTop: 18 }}>
          <b>O'zingiz ustamisiz?</b>
          <div className="meta">Jun olsangiz, qassob bo'lsangiz yoki urug'lantirsangiz — ro'yxatdan o'ting, tumandagi buyurtmalar sizga keladi.</div>
          <Link className="btn ghost sm" style={{ marginTop: 8 }} to="/master-profile">Usta sifatida ro'yxatdan o'tish</Link>
        </div>
      )}
    </>
  );
}
