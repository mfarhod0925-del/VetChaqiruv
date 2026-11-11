// Supabase kalitlari: yangi (sb_publishable_/sb_secret_) bo'lsa — ular, bo'lmasa eski (anon/service_role).
// Edge Functions muhitida yangi kalitlar SUPABASE_PUBLISHABLE_KEYS va SUPABASE_SECRET_KEYS (JSON) sifatida beriladi.
function pick(jsonVar: string, legacyVar: string): string {
  const raw = Deno.env.get(jsonVar);
  if (raw) {
    try {
      const obj = JSON.parse(raw) as Record<string, string>;
      const k = obj.default ?? Object.values(obj)[0];
      if (k) return k;
    } catch { /* JSON emas — o'zi kalit bo'lishi mumkin */ if (raw.startsWith("sb_")) return raw; }
  }
  return Deno.env.get(legacyVar) ?? "";
}
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SECRET_KEY = pick("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
export const PUBLISHABLE_KEY = pick("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
