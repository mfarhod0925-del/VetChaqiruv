// AI maslahatchi: chorvadorning savollariga Claude (Anthropic API) orqali javob beradi.
// Suhbat public.ai_messages jadvalida saqlanadi, har bir foydalanuvchiga kunlik chegara qo'yiladi.
//
// So'rov (ilovadan): POST, Content-Type: text/plain, body: {"token": "<foydalanuvchi access_token>", "message": "..."}
//   token tanada yuboriladi: shunda brauzer qo'shimcha CORS so'rovisiz yuboradi (tg-auth bilan bir xil usul).
// Sozlamalar (supabase secrets set ...):
//   ANTHROPIC_API_KEY — console.anthropic.com dan olingan kalit (majburiy)
//   AI_MODEL          — ixtiyoriy, standart: claude-sonnet-5-5
//   AI_DAILY_LIMIT    — ixtiyoriy, bir foydalanuvchiga kunlik savollar soni, standart: 30
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

// ===== Funksiya kodi =====

const API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("AI_MODEL") || "claude-sonnet-5-5";
const DAILY_LIMIT = Math.max(1, Number(Deno.env.get("AI_DAILY_LIMIT") ?? 30) || 30);
const HISTORY = 20;       // modelga yuboriladigan oxirgi xabarlar soni
const MAX_INPUT = 2000;   // bitta savolning eng ko'p uzunligi

const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLE: Record<string, string> = { farmer: "chorvador", vet: "veterinar", pharmacy: "vet-dorixona xodimi", master: "usta" };

function systemPrompt(p: { full_name?: string; role?: string; region?: string; district?: string } | null) {
  const who = p
    ? `Foydalanuvchi: ${p.full_name || "noma'lum"}, ${ROLE[p.role ?? ""] ?? "chorvador"}, ${p.district ?? ""} tumani, ${p.region ?? ""}.`
    : "";
  return `Sen VetChaqiruv ilovasidagi AI maslahatchisan. O'zbekistondagi chorvadorlarga yordam berasan.

Mavzular: qoramol, qo'y, echki, ot va parranda boqish, ozuqa ratsioni, parvarish, sog'ish, emlash taqvimi, ko'paytirish,
sun'iy urug'lantirish vaqti, bo'g'ozlik va tug'ruqqa tayyorgarlik, jun olish, so'yishga tayyorlash, molxona gigiyenasi.

Qoidalar:
- Javobni foydalanuvchi yozgan tilda ber. Odatda o'zbek tilida (lotin yozuvida), sodda qishloq tilida, qisqa va amaliy.
- 3–8 jumla yoki qisqa ro'yxat. Sarlavha, jadval va murakkab belgilash ishlatma.
- Sen veterinar o'rnini bosa olmaysan. Jiddiy belgilar bo'lsa (yuqori isitma, nafas qisishi, qon ketishi, qorin dam bo'lishi,
  tug'ruq qiyinlashishi, turolmay qolish, ko'p hayvonning birdan kasallanishi) — birinchi jumlada darhol veterinar chaqirishni ayt:
  ilovadagi «Ariza» bo'limi orqali tumandagi veterinarga ariza yuborish mumkin.
- Retsept dorilarining aniq dozasini o'zingdan buyurma: qadoqdagi yo'riqnoma va veterinar ko'rsatmasiga yo'naltir.
  Oddiy parvarish, ozuqa va gigiyena bo'yicha aniq maslahat berishing mumkin.
- Bugungi bozor narxlarini bilmaysan — narx so'ralsa, ilovadagi «Chorva sotish» bo'limida qassoblar taklif berishini ayt.
- Bilmasang yoki ishonching komil bo'lmasa, ochiq ayt.
- Ilova imkoniyatlari: veterinar chaqirish, vet-dorixonadan dori topish, jun oluvchi, qassob, sun'iy urug'lantiruvchi va
  homiladorlikni tekshiruvchi ustani chaqirish, chorva sotish, hayvon taqvimi (urug'lantirish sanasidan tug'ish kunigacha eslatmalar).
  Mos kelsa, shularni tavsiya qil.
- Mavzudan tashqari savollarga (siyosat, boshqa sohalar) qisqa javob berib, chorvachilikka qaytar.
${who}`;
}

type Msg = { role: "user" | "assistant"; content: string };

/** Modelga yuboriladigan tarix: user bilan boshlanadi, rollar navbatma-navbat. */
function normalize(rows: Msg[]): Msg[] {
  const out: Msg[] = [];
  for (const r of rows) {
    if (!out.length && r.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === r.role) last.content += "\n\n" + r.content;
    else out.push({ role: r.role, content: r.content });
  }
  return out;
}

function tashkentDayStartIso() {
  const now = new Date(Date.now() + 5 * 3600_000);
  const day = now.toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+05:00`).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST so'rov kerak" }, 405);
  if (!API_KEY) return json({ error: "AI maslahatchi hali sozlanmagan (ANTHROPIC_API_KEY)." }, 503);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return json({ error: "So'rov noto'g'ri" }, 400);
  }

  const token = String(body.token ?? "");
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "Qaytadan tizimga kiring." }, 401);
  const uid = u.user.id;

  const message = String(body.message ?? "").trim().slice(0, MAX_INPUT);
  if (!message) return json({ error: "Savolingizni yozing." }, 400);

  const { count } = await admin.from("ai_messages").select("id", { count: "exact", head: true })
    .eq("user_id", uid).eq("role", "user").gte("created_at", tashkentDayStartIso());
  if ((count ?? 0) >= DAILY_LIMIT) {
    return json({ error: `Bugungi savollar chegarasi (${DAILY_LIMIT} ta) tugadi. Ertaga davom eting yoki veterinarga ariza yuboring.` }, 429);
  }

  const { error: insErr } = await admin.from("ai_messages").insert({ user_id: uid, role: "user", content: message });
  if (insErr) {
    console.error("ai insert", insErr);
    return json({ error: "Bazaga yozib bo'lmadi. ai_messages jadvali yaratilganini tekshiring." }, 500);
  }

  const [{ data: hist }, { data: profile }] = await Promise.all([
    admin.from("ai_messages").select("role, content").eq("user_id", uid)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(HISTORY),
    admin.from("profiles").select("full_name, role, region, district").eq("id", uid).maybeSingle(),
  ]);
  const messages = normalize(((hist ?? []) as Msg[]).reverse());

  let reply = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: systemPrompt(profile), messages }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("anthropic", r.status, JSON.stringify(j));
      const why = r.status === 401 ? "API kaliti noto'g'ri" : r.status === 429 ? "juda ko'p so'rov, birozdan keyin urinib ko'ring" : `xato ${r.status}`;
      return json({ error: `AI javob bera olmadi: ${why}.` }, 502);
    }
    // deno-lint-ignore no-explicit-any
    reply = ((j.content ?? []) as any[]).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  } catch (e) {
    console.error("anthropic fetch", e);
    return json({ error: "AI xizmatiga ulanib bo'lmadi. Qayta urinib ko'ring." }, 502);
  }
  if (!reply) return json({ error: "AI bo'sh javob qaytardi. Savolni boshqacha yozib ko'ring." }, 502);

  await admin.from("ai_messages").insert({ user_id: uid, role: "assistant", content: reply.slice(0, 8000) });
  return json({ reply, left: Math.max(0, DAILY_LIMIT - (count ?? 0) - 1) });
});
