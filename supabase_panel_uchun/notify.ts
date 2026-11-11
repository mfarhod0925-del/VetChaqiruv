// Ma'lumotlar bazasidagi trigger (public.notify_edge) chaqiradi va kerakli odamlarga SMS yuboradi:
//  • yangi ariza            → tumandagi bo'sh veterinarlar (yoki tanlangan veterinar)
//  • ariza qabul qilindi    → chorvador (vet ismi va telefoni bilan)
//  • vet yo'lga chiqdi      → chorvador
//  • vet rad etdi           → chorvador
//  • chorvador bekor qildi  → biriktirilgan vet
//  • yangi dori buyurtmasi  → dorixona
//  • buyurtma tayyor        → chorvador
// Qabul qiluvchi Telegram botga raqamini yuborgan bo'lsa, xabar Telegram'ga (bepul, ilovani ochish tugmasi bilan) boradi.
// Aks holda yoki Telegram'ga yetmasa — SMS.
// Sozlamalar: NOTIFY_SECRET (vault'dagi notify_secret bilan bir xil), APP_URL (ilova manzili),
// TELEGRAM_BOT_TOKEN (ixtiyoriy), SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY (Supabase avtomatik beradi).
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

const ANIMALS: Record<string, string> = {
  sigir: "sigir", qoy: "qo'y", echki: "echki", ot: "ot", parranda: "parranda", boshqa: "hayvon",
};
const MAX_VETS_PER_CASE = 15; // bitta ariza uchun ko'pi bilan nechta vetga SMS

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const som = (n: number) => `${Math.round(n || 0).toLocaleString("ru-RU").replace(/\s|,/g, " ")} so'm`;

type Rec = Record<string, any>;

Deno.serve(async (req) => {
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return json({ error: "unauthorized" }, 401);

  const { type, table, record, old_record } = (await req.json()) as {
    type: "INSERT" | "UPDATE"; table: string; record: Rec; old_record: Rec | null;
  };
  const sb = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false },
  });
  const app = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  // path — ilovadagi sahifa (Telegram tugmasi uchun), btn — tugma matni
  const out: { phone: string; text: string; path: string; btn: string }[] = [];

  if (table === "cases") {
    const c = record;
    const animal = ANIMALS[c.animal] ?? "hayvon";
    const place = c.village ? `${c.village}, ${c.district}` : `${c.district} tumani`;
    const link = app ? ` ${app}/case/${c.id}` : "";
    const reopened = type === "UPDATE" && c.status === "new" && old_record?.status === "declined";

    if (type === "INSERT" || reopened) {
      let q = sb.from("vets").select("id, phone");
      if (c.vet_id) {
        q = q.eq("id", c.vet_id);
      } else {
        q = q.eq("region", c.region).eq("district", c.district).neq("status", "offline");
      }
      const { data: vets, error } = await q.limit(MAX_VETS_PER_CASE + 10);
      if (error) console.error(error);
      const declined: string[] = c.declined_by ?? [];
      const urgent = c.urgency === "shoshilinch" ? "SHOSHILINCH " : "";
      const kind = c.kind === "video" ? "video maslahat" : "chaqiruv";
      for (const v of (vets ?? []).filter((v) => !declined.includes(v.id)).slice(0, MAX_VETS_PER_CASE)) {
        out.push({ phone: v.phone, text: `VetChaqiruv: ${urgent}yangi ${kind}. ${animal}, ${place}.${link}`, path: `/case/${c.id}`, btn: "📄 Arizani ko'rish" });
      }
    } else if (type === "UPDATE") {
      const vet = c.vet_id
        ? (await sb.from("vets").select("full_name, phone").eq("id", c.vet_id).maybeSingle()).data
        : null;
      switch (c.status) {
        case "accepted":
          if (vet) out.push({ phone: c.phone, text: `VetChaqiruv: veterinar ${vet.full_name} arizangizni qabul qildi. Tel: ${vet.phone}`, path: `/case/${c.id}`, btn: "📄 Arizani ochish" });
          break;
        case "on_way":
          if (vet) out.push({ phone: c.phone, text: `VetChaqiruv: veterinar ${vet.full_name} yo'lga chiqdi.`, path: `/case/${c.id}`, btn: "📄 Arizani ochish" });
          break;
        case "declined":
          out.push({ phone: c.phone, text: `VetChaqiruv: veterinar arizani qabul qila olmadi. Ilovada boshqa veterinarlarga yuboring.${link}`, path: `/case/${c.id}`, btn: "🔁 Boshqa veterinarga yuborish" });
          break;
        case "cancelled":
          if (vet && old_record?.status !== "new") out.push({ phone: vet.phone, text: `VetChaqiruv: chorvador ${c.contact_name} chaqiruvni bekor qildi.`, path: "/inbox", btn: "🔔 Chaqiruvlar" });
          break;
      }
    }
  }

  if (table === "reservations") {
    // Yozuvni bazadan qayta o'qiymiz: INSERT paytida jami narx hali hisoblanmagan bo'ladi
    const { data: r } = await sb.from("reservations").select("*, pharmacies(name, phone, address)").eq("id", record.id).maybeSingle();
    if (r) {
      const p = (r as Rec).pharmacies as Rec | null;
      if (type === "INSERT" && p?.phone) {
        out.push({ phone: p.phone, text: `VetChaqiruv: yangi dori buyurtmasi, ${som(r.total)}. Mijoz: ${r.contact_name} ${r.phone}`, path: "/orders", btn: "💊 Buyurtmalar" });
      } else if (type === "UPDATE" && r.status === "ready" && r.phone) {
        out.push({ phone: r.phone, text: `VetChaqiruv: ${p?.name ?? "dorixona"} dorilaringizni tayyorladi. Manzil: ${p?.address ?? ""}`, path: "/drugs", btn: "💊 Dorilar" });
      }
    }
  }

  // Telegram'ga ulangan qabul qiluvchilar
  const chats = new Map<string, number>();
  if (tgEnabled() && out.length) {
    const phones = [...new Set(out.map((m) => normalizePhone(m.phone)).filter(Boolean))] as string[];
    const { data: tgu, error } = await sb.from("telegram_users").select("phone, chat_id")
      .in("phone", phones).eq("notify", true).eq("bot_blocked", false);
    if (error) console.error("notify telegram_users:", error);
    for (const u of tgu ?? []) chats.set(u.phone, u.chat_id);
  }

  let viaTg = 0;
  const deliver = async (m: (typeof out)[number]) => {
    const chat = chats.get(normalizePhone(m.phone) ?? "");
    if (chat) {
      // SMS matnidan "VetChaqiruv:" va havolani olib tashlaymiz — Telegram'da tugma bor
      const body = m.text.replace(/^VetChaqiruv:\s*/, "").replace(/\s+https?:\/\/\S+$/, "");
      const res = await tg("sendMessage", {
        chat_id: chat,
        parse_mode: "HTML",
        text: `🐄 <b>VetChaqiruv</b>\n\n${escH(body)}`,
        reply_markup: app ? openBtn(m.btn, m.path) : undefined,
      });
      if (res.ok) { viaTg++; return; }
      if (res.error_code === 403) await sb.from("telegram_users").update({ bot_blocked: true }).eq("chat_id", chat);
    }
    await sendSms(m.phone, m.text); // Telegram yo'q yoki yetmadi — SMS
  };

  const results = await Promise.allSettled(out.map(deliver));
  const failed = results.filter((r) => r.status === "rejected");
  failed.forEach((f) => console.error("notify:", (f as PromiseRejectedResult).reason));
  return json({ sent: out.length - failed.length, telegram: viaTg, failed: failed.length });
});
