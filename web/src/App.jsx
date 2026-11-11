import { Component, useEffect, useRef } from "react";
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.jsx";
import { configured } from "./lib/supabase.js";
import { inTelegram, openExternal, startPath, tg } from "./lib/telegram.js";
import { ROLE_HOME, ROLE_NAMES } from "./lib/constants.js";
import { ToastProvider } from "./toast.jsx";
import { Icon } from "./ui.jsx";
import Login from "./pages/Login.jsx";
import TelegramLogin from "./pages/TelegramLogin.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Settings from "./pages/Settings.jsx";
import CaseDetail from "./pages/CaseDetail.jsx";
import NewCase from "./pages/farmer/NewCase.jsx";
import MyCases from "./pages/farmer/MyCases.jsx";
import VetsList from "./pages/farmer/VetsList.jsx";
import DrugSearch from "./pages/farmer/DrugSearch.jsx";
import Inbox from "./pages/vet/Inbox.jsx";
import VetProfile from "./pages/vet/VetProfile.jsx";
import Orders from "./pages/pharmacy/Orders.jsx";
import Stock from "./pages/pharmacy/Stock.jsx";
import PharmacyProfile from "./pages/pharmacy/PharmacyProfile.jsx";

const TABS = {
  farmer: [["/new", "Ariza", "plus"], ["/cases", "Arizalarim", "list"], ["/vets", "Vetlar", "user"], ["/drugs", "Dorilar", "pharm"]],
  vet: [["/inbox", "Chaqiruvlar", "bell"], ["/vet-profile", "Profil", "user"]],
  pharmacy: [["/orders", "Buyurtmalar", "bell"], ["/stock", "Ombor", "box"], ["/pharmacy-profile", "Profil", "user"]],
};

function Layout() {
  const { profile } = useAuth();
  const tabs = TABS[profile.role] || TABS.farmer;
  return (
    <div className="app">
      <header className="top">
        <div className="toprow">
          <Link to="/" className="brand">Vet<span>Chaqiruv</span></Link>
          <Link to="/settings" className="rolechip" aria-label="Sozlamalar">
            {ROLE_NAMES[profile.role]} <Icon name="gear" size={20} />
          </Link>
        </div>
      </header>
      <main><Outlet /></main>
      <nav className="tabs" aria-label="Bo'limlar">
        <div style={{ "--n": tabs.length }}>
          {tabs.map(([to, t, i]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
              <Icon name={i} />{t}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

const TAB_ROOTS = new Set(["/", ...Object.values(TABS).flat().map(([to]) => to)]);

/** Telegram ichida: orqaga tugmasi, /start havolasi bo'yicha sahifa, tashqi havolalar. */
function TelegramBridge() {
  const loc = useLocation();
  const nav = useNavigate();
  const startHandled = useRef(false);

  // Bot xabaridagi "Arizani ochish" yoki t.me/...?startapp=case_<id> → kerakli sahifa
  useEffect(() => {
    if (startHandled.current) return;
    startHandled.current = true;
    const p = startPath();
    if (p && p !== loc.pathname) nav(p, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Telegram'ning "Orqaga" tugmasi: asosiy bo'limlardan tashqari sahifalarda ko'rinadi
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return;
    const back = () => (window.history.length > 1 ? nav(-1) : nav("/", { replace: true }));
    if (TAB_ROOTS.has(loc.pathname)) bb.hide(); else bb.show();
    bb.onClick(back);
    return () => bb.offClick(back);
  }, [loc.pathname, nav]);

  // target="_blank" havolalar (xarita, video qo'ng'iroq) Telegram ichida bo'sh oyna ochmasin
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest?.("a[target=_blank]");
      if (!a || !/^https?:/i.test(a.href)) return;
      e.preventDefault();
      openExternal(a.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}

function Gate() {
  const { ready, session, profile } = useAuth();
  if (!ready) return <div className="center">Yuklanmoqda…</div>;
  if (!session) return inTelegram ? <TelegramLogin /> : <Login />;
  if (!profile) return <div className="center">Profil yuklanmoqda… Internetni tekshiring.</div>;
  if (!profile.role || !profile.full_name) return <Onboarding />;
  const home = ROLE_HOME[profile.role] || "/new";
  return (
    <>
    {inTelegram && <TelegramBridge />}
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/new" element={<NewCase />} />
        <Route path="/cases" element={<MyCases />} />
        <Route path="/vets" element={<VetsList />} />
        <Route path="/drugs" element={<DrugSearch />} />
        <Route path="/case/:id" element={<CaseDetail />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/vet-profile" element={<VetProfile />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/pharmacy-profile" element={<PharmacyProfile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
    </>
  );
}

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app bare"><div className="empty" style={{ paddingTop: 80 }}>
        <h1>Kutilmagan xatolik</h1>
        <p>Ilovani qayta yuklang. Xato takrorlansa, administratorga xabar bering.</p>
        <button className="btn dark" onClick={() => location.reload()}>Qayta yuklash</button>
      </div></div>
    );
  }
}

function NotConfigured() {
  return (
    <div className="app bare"><div className="hero">
      <div className="brand">Vet<span>Chaqiruv</span></div>
      <h1>Sozlash kerak</h1>
      <p className="lead">Ilova Supabase'ga ulanmagan. <code>web/.env</code> faylida
        <code> VITE_SUPABASE_URL</code> va <code>VITE_SUPABASE_ANON_KEY</code> qiymatlarini kiriting va qayta ishga tushiring.
        Batafsil: README.md.</p>
    </div></div>
  );
}

export default function App() {
  if (!configured) return <NotConfigured />;
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
