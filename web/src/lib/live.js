import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, must } from "./supabase.js";

/**
 * Ma'lumotni yuklaydi va yangilab turadi:
 *  • Supabase Realtime orqali jadval o'zgarganda darhol,
 *  • har 30 soniyada (internet uzilib qolsa ham),
 *  • ilova qayta ochilganda / internet qaytganda.
 * @param {() => Promise<any>} fetcher
 * @param {any[]} deps  — o'zgarsa qayta yuklanadi
 * @param {{table: string, filter?: string}[]} channels — kuzatiladigan jadvallar
 */
export function useLive(fetcher, deps, channels = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fref = useRef(fetcher);
  fref.current = fetcher;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const d = await fref.current();
      if (my === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (my === seq.current) setError(e);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  const key = JSON.stringify(deps);
  const chKey = JSON.stringify(channels.filter(Boolean));

  useEffect(() => {
    setLoading(true);
    reload();
    let t;
    const bump = () => { clearTimeout(t); t = setTimeout(reload, 250); };
    const timer = setInterval(reload, 30000);
    const onVis = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", reload);

    let ch = null;
    const subs = JSON.parse(chKey);
    if (subs.length) {
      ch = supabase.channel(`live-${Math.random().toString(36).slice(2)}`);
      for (const s of subs) {
        ch.on("postgres_changes", { event: "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) }, bump);
      }
      ch.subscribe();
    }
    return () => {
      clearTimeout(t);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", reload);
      if (ch) supabase.removeChannel(ch);
    };
  }, [key, chKey, reload]);

  return { data, error, loading, reload, setData };
}

let drugsCache = null;
/** Dorilar ro'yxati (kam o'zgaradi — bir marta yuklanadi). */
export function useDrugs() {
  const [drugs, setDrugs] = useState(drugsCache || []);
  useEffect(() => {
    if (drugsCache) return;
    supabase.from("drugs").select("*").eq("active", true).order("sort")
      .then((r) => { drugsCache = must(r) || []; setDrugs(drugsCache); })
      .catch(() => {});
  }, []);
  const byId = Object.fromEntries(drugs.map((d) => [d.id, d]));
  return { drugs, byId };
}
