import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from "./config.js";

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = key;

export const configured = Boolean(url && key);

export const supabase = configured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

/** Supabase javobidan ma'lumotni oladi yoki xatoni otadi. */
export function must({ data, error }) {
  if (error) throw error;
  return data;
}
