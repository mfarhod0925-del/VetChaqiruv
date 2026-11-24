// Sun'iy intellekt yordamchisi.
// Chorvador belgilagan alomatlar va izoh bo'yicha: xavf darajasi, qisqa izoh va xavfsiz birinchi qadamlar.
// TASHXIS QO'YMAYDI va dori buyurmaydi — yakuniy qarorni har doim veterinar qiladi.
//
// Sozlamalar (Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  — majburiy (console.anthropic.com dan olinadi)
//   AI_MODEL           — ixtiyoriy, standart: claude-haiku-5-5
//   AI_DAILY_LIMIT     — ixtiyoriy, bitta foydalanuvchiga kuniga nechta so'rov (standart 20)
// Kalit berilmasa funksiya 503 qaytaradi, ilova esa o'zining oddiy (qoidaga asoslangan) tahlilini ko'rsatadi.
import { createClient } from "npm:@supabase/supabase-js@2";

// ===== Umumiy kod (_shared) — bitta faylga jamlangan =====
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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEY = pick("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const PUBLISHABLE_KEY = pick("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ANIMALS: Record<string, string> = {
  sigir: "sigir (qoramol)", qoy: "qo'y", echki: "echki", ot: "ot", parranda: "parranda", boshqa: "boshqa hayvon",
};
const LEVELS = ["shoshilinch", "bugun", "kuzatish"];

const SYSTEM = `Sen VetChaqiruv ilovasidagi yordamchisan. Chorvador kasal hayvon haqida yozadi.
Vazifang: vaziyat qanchalik shoshilinch ekanini baholash va veterinar kelguncha qilinadigan XAVFSIZ birinchi qadamlarni aytish.
Qoidalar:
- Tashxis qo'yma, kasallik nomini aniq deb aytma; "ehtimol" deb ham dori, doza yoki ukol tavsiya qilma.
- Faqat umumiy xavfsiz choralar: kasal hayvonni ajratish, toza suv, soya/issiq joy, kuzatish, veterinarni chaqirish.
- Nafas qisishi, qorin keskin dam bo'lishi, turolmaslik, qon ketishi, tug'ruq qiyinchiligi, zaharlanish, ko'p hayvon birdan kasallanishi — "shoshilinch".
- Javobni faqat o'zbek tilida (lotin yozuvida), sodda so'zlar bilan yoz.
- Faqat JSON qaytar, boshqa hech narsa yozma:
{"level":"shoshilinch|bugun|kuzatish","summary":"1-2 gapda nima uchun shunday baholanganini","advice":["3-5 ta qisqa xavfsiz qadam"]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST so'rov kerak" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ai_not_configured" }, 503);

  // Foydalanuvchini tekshiramiz (ilovaga kirgan bo'lishi kerak)
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: auth } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "not_authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  const limit = Math.max(1, Number(Deno.env.get("AI_DAILY_LIMIT") ?? 20) || 20);
  const { data: ok, error: qErr } = await admin.rpc("ai_take_quota", { p_user: u.user.id, p_limit: limit });
  if (qErr) { console.error("ai_take_quota", qErr); return json({ error: "server_error" }, 500); }
  if (!ok) return json({ error: "daily_limit" }, 429);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const animal = ANIMALS[String(body.animal ?? "")] ?? "hayvon";
  const count = Math.max(1, Math.min(10000, Math.floor(Number(body.count) || 1)));
  const symptoms = (Array.isArray(body.symptoms) ? body.symptoms : []).slice(0, 15).map((s) => String(s).slice(0, 60));
  const note = String(body.note ?? "").slice(0, 1000);
  if (!symptoms.length && !note.trim()) return json({ error: "bad_request" }, 400);

  const userText = `Hayvon: ${animal}. Kasal hayvonlar soni: ${count}.
Alomatlar: ${symptoms.length ? symptoms.join(", ") : "belgilanmagan"}.
Chorvador izohi: ${note.trim() || "yo'q"}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("AI_MODEL") || "claude-haiku-5-5",
        max_tokens: 600,
        system: SYSTEM,
        messages: [{ role: "user", content: userText }],
      }),
    });
  } catch (e) {
    console.error("anthropic fetch", e);
    return json({ error: "ai_unavailable" }, 502);
  }
  if (!res.ok) {
    console.error("anthropic", res.status, await res.text().catch(() => ""));
    return json({ error: "ai_unavailable" }, 502);
  }

  const data = await res.json();
  const text = (data?.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  let out: Record<string, unknown> = {};
  try { out = m ? JSON.parse(m[0]) : {}; } catch { out = {}; }

  const level = LEVELS.includes(String(out.level)) ? String(out.level) : "bugun";
  const summary = String(out.summary ?? "").slice(0, 400);
  const advice = (Array.isArray(out.advice) ? out.advice : []).slice(0, 5).map((a) => String(a).slice(0, 200)).filter(Boolean);
  if (!summary && !advice.length) return json({ error: "ai_unavailable" }, 502);
  return json({ level, summary, advice });
});
