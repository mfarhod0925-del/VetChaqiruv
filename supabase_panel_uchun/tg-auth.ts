// Telegram mini app orqali kirish.
// Ilova Telegram ichida ochilganda initData'ni shu yerga yuboradi. Funksiya:
//   1) initData imzosini bot tokeni bilan tekshiradi (soxta so'rov o'tmaydi);
//   2) foydalanuvchi botga telefon raqamini yuborganmi, tekshiradi;
//   3) shu raqamdagi hisobni topadi yoki yaratadi va Supabase sessiyasini qaytaradi.
// Raqam SMS orqali kirgandagi bilan bir xil bo'lgani uchun, eski hisob va arizalar saqlanib qoladi.
//
// Sozlamalar: TELEGRAM_BOT_TOKEN. SUPABASE_URL, SUPABASE_ANON_KEY va SUPABASE_SERVICE_ROLE_KEY ni Supabase o'zi beradi.
// Talab: Authentication → Providers → Phone yoqilgan bo'lishi kerak.
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

// Eskiz.uz orqali SMS yuborish.
// Kerakli sozlamalar (supabase secrets set ...):
//   ESKIZ_EMAIL, ESKIZ_PASSWORD  — eskiz.uz kabinetidagi login
//   ESKIZ_FROM                    — jo'natuvchi nomi (standart: 4546)
//   ESKIZ_BASE_URL                — ixtiyoriy, standart: https://notify.eskiz.uz/api
// ESKIZ_EMAIL berilmagan bo'lsa, SMS yuborilmaydi — matn faqat logga yoziladi (sinov rejimi).

const BASE = (Deno.env.get("ESKIZ_BASE_URL") ?? "https://notify.eskiz.uz/api").replace(/\/$/, "");
const EMAIL = Deno.env.get("ESKIZ_EMAIL") ?? "";
const PASSWORD = Deno.env.get("ESKIZ_PASSWORD") ?? "";
const FROM = Deno.env.get("ESKIZ_FROM") ?? "4546";

let cachedToken: string | null = null;

async function login(): Promise<string> {
  const form = new FormData();
  form.append("email", EMAIL);
  form.append("password", PASSWORD);
  const res = await fetch(`${BASE}/auth/login`, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  const token = body?.data?.token;
  if (!res.ok || typeof token !== "string") {
    throw new Error(`Eskiz login xatosi: ${res.status} ${JSON.stringify(body)}`);
  }
  cachedToken = token;
  return token;
}

/** "+998 90 123-45-67" → "998901234567". Noto'g'ri bo'lsa null. */
function normalizePhone(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998")) return d;
  if (d.length === 9) return "998" + d;
  return null;
}

const smsEnabled = () => EMAIL !== "" && PASSWORD !== "";

async function sendSms(phone: string, message: string): Promise<unknown> {
  const to = normalizePhone(phone);
  if (!to) throw new Error(`Noto'g'ri telefon raqami: ${phone}`);
  if (!smsEnabled()) {
    console.log(`[SMS sinov rejimi] ${to}: ${message}`);
    return { dryRun: true };
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = cachedToken ?? (await login());
    const form = new FormData();
    form.append("mobile_phone", to);
    form.append("message", message);
    form.append("from", FROM);
    const res = await fetch(`${BASE}/message/sms/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.status === 401 && attempt === 0) {
      cachedToken = null; // token eskirgan — qayta kiramiz
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Eskiz SMS xatosi: ${res.status} ${JSON.stringify(body)}`);
    return body;
  }
  throw new Error("Eskiz: avtorizatsiya muvaffaqiyatsiz");
}

// Telegram Bot API yordamchilari (NavTop'dagi bilan bir xil yondashuv).
// Sozlamalar (supabase secrets set ...):
//   TELEGRAM_BOT_TOKEN — @BotFather bergan token
//   APP_URL            — mini app manzili (masalan https://vetchaqiruv.vercel.app)

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
const tgEnabled = () => BOT_TOKEN !== "";

const enc = new TextEncoder();

async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Webhook so'rovlari faqat Telegram'dan kelganini tekshirish uchun maxfiy kalit (tokendan hosil qilinadi). */
async function webhookSecret(): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode("vetchaqiruv-webhook:" + BOT_TOKEN));
  return hex(new Uint8Array(h)).slice(0, 48);
}

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };

/**
 * Mini app'dan kelgan initData imzosini tekshiradi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
async function verifyInitData(initData: string, maxAgeSec = 86400, token = BOT_TOKEN): Promise<TgUser | null> {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = await hmac(enc.encode("WebAppData"), token);
  const calc = hex(await hmac(secret, dataCheck));
  if (!safeEqual(calc, hash)) return null;
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    const u = JSON.parse(params.get("user") ?? "null");
    return u && typeof u.id === "number" ? u : null;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
async function tg(method: string, payload: unknown): Promise<any> {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({ ok: false }));
  if (!j.ok) console.error("telegram", method, JSON.stringify(j));
  return j;
}

const escH = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]!));

/** Mini app'ni ochadigan inline tugma. path — ilova ichidagi sahifa, masalan "/case/123". */
function openBtn(text = "🐄 VetChaqiruv'ni ochish", path = "") {
  return { inline_keyboard: [[{ text, web_app: { url: APP_URL + path } }]] };
}

// ===== Funksiya kodi =====

const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function randomPassword() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST so'rov kerak" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON noto'g'ri" }, 400);
  }

  const user = await verifyInitData(String(body.initData ?? ""));
  if (!user) return json({ error: "Telegram ma'lumoti tasdiqlanmadi. Ilovani bot orqali qayta oching." }, 401);

  // Telegram profilini yangilaymiz (telefon raqamiga tegmaymiz)
  const { data: row, error: upErr } = await admin.from("telegram_users").upsert({
    tg_id: user.id,
    chat_id: user.id, // shaxsiy chatda chat_id foydalanuvchi ID'si bilan bir xil
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    username: user.username ?? null,
    language_code: user.language_code ?? null,
  }, { onConflict: "tg_id" }).select("phone, user_id").single();
  if (upErr) {
    console.error("tg-auth upsert", upErr);
    return json({ error: "Bazaga yozib bo'lmadi" }, 500);
  }

  const phone = normalizePhone(row?.phone);
  if (!phone) return json({ need_phone: true });

  // Hisobni topamiz yoki yaratamiz
  let uid: string | null = null;
  const { data: found, error: fErr } = await admin.rpc("tg_find_user_by_phone", { p_phone: phone });
  if (fErr) {
    console.error("tg-auth find", fErr);
    return json({ error: "Hisobni qidirib bo'lmadi" }, 500);
  }
  uid = (found as string | null) ?? null;

  const password = randomPassword();
  if (uid) {
    const { error } = await admin.auth.admin.updateUserById(uid, { password, phone_confirm: true });
    if (error) {
      console.error("tg-auth update", error);
      return json({ error: "Hisobni yangilab bo'lmadi" }, 500);
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({ phone: "+" + phone, phone_confirm: true, password });
    if (error || !data.user) {
      console.error("tg-auth create", error);
      return json({ error: "Hisob yaratib bo'lmadi" }, 500);
    }
    uid = data.user.id;
  }

  // Sessiya: vaqtinchalik parol bilan kiramiz va tokenlarni ilovaga qaytaramiz
  const pub = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: s, error: sErr } = await pub.auth.signInWithPassword({ phone: "+" + phone, password });
  if (sErr || !s.session) {
    console.error("tg-auth signin", sErr);
    return json({ error: "Kirib bo'lmadi. Supabase'da Phone provayderi yoqilganini tekshiring." }, 500);
  }

  if (row?.user_id !== uid) {
    await admin.from("telegram_users").update({ user_id: uid }).eq("tg_id", user.id);
  }

  return json({
    access_token: s.session.access_token,
    refresh_token: s.session.refresh_token,
    tg_id: user.id,
  });
});
