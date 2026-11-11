import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, must } from "./lib/supabase.js";
import { askWriteAccess, forgetTgSession, inTelegram, sessionBelongsToTg, telegramSignIn } from "./lib/telegram.js";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = hali aniqlanmagan
  const [profile, setProfile] = useState(null);
  const [vet, setVet] = useState(null);
  const [pharmacy, setPharmacy] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // Telegram ichida kirish holati: "idle" | "loading" | "need_phone" | "error"
  const [tgState, setTgState] = useState({ status: inTelegram ? "loading" : "idle", error: "" });

  /** Telegram orqali kirish (initData → tg-auth funksiyasi → Supabase sessiyasi). */
  const telegramLogin = useCallback(async () => {
    setTgState({ status: "loading", error: "" });
    const r = await telegramSignIn();
    if (r.session) {
      const { error } = await supabase.auth.setSession(r.session);
      if (error) { setTgState({ status: "error", error: error.message }); return false; }
      setTgState({ status: "idle", error: "" });
      askWriteAccess();
      return true;
    }
    setTgState(r.needPhone ? { status: "need_phone", error: "" } : { status: "error", error: r.error });
    return false;
  }, []);

  useEffect(() => {
    let alive = true;
    let booted = false; // tekshiruv tugamaguncha eski sessiya ekranga chiqmasin
    (async () => {
      let { data } = await supabase.auth.getSession();
      if (inTelegram && !(data.session && sessionBelongsToTg())) {
        // Telegram'da: boshqa odamning eski sessiyasi qolmasin, yangisini olamiz
        if (data.session) await supabase.auth.signOut({ scope: "local" });
        await telegramLogin();
        ({ data } = await supabase.auth.getSession());
      } else if (inTelegram) {
        setTgState({ status: "idle", error: "" });
      }
      booted = true;
      if (alive) setSession(data.session ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (alive && booted) setSession(s ?? null); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [telegramLogin]);

  const uid = session?.user?.id ?? null;

  const reload = useCallback(async () => {
    if (!uid) { setProfile(null); setVet(null); setPharmacy(null); setLoaded(true); return; }
    try {
      const [p, v, ph] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle().then(must),
        supabase.from("vets").select("*").eq("id", uid).maybeSingle().then(must),
        supabase.from("pharmacies").select("*").eq("id", uid).maybeSingle().then(must),
      ]);
      setProfile(p); setVet(v); setPharmacy(ph);
    } catch (e) {
      console.error(e);
    } finally {
      setLoaded(true);
    }
  }, [uid]);

  useEffect(() => { if (session !== undefined) { setLoaded(false); reload(); } }, [uid, session === undefined, reload]);

  const updateProfile = useCallback(async (patch) => {
    const p = await supabase.from("profiles").update(patch).eq("id", uid).select().single().then(must);
    setProfile(p);
    return p;
  }, [uid]);

  const signOut = useCallback(async () => {
    forgetTgSession();
    await supabase.auth.signOut();
    if (inTelegram) setTgState({ status: "error", error: "" }); // Telegram'da "Qayta kirish" ekrani
    setProfile(null); setVet(null); setPharmacy(null);
  }, []);

  const value = {
    session, user: session?.user ?? null, uid, profile, vet, pharmacy,
    ready: session !== undefined && (session === null || loaded),
    reload, updateProfile, signOut,
    tgState, telegramLogin,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
