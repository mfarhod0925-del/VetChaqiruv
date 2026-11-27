// VetChaqiruv Telegram boti (NavTop'dagi "bot" funksiyasi andozasida).
//   GET  ?setup=1  → webhook, menyu tugmasi, buyruqlar va tavsifni sozlaydi (bir marta brauzerda oching)
//   GET            → "Bot ishlayapti" tekshiruvi
//   POST (Telegram) → /start, /help, /raqam, /bildirishnoma, telefon raqamini qabul qilish
//   POST ?cron=1    → hayvon taqvimi eslatmalarini yuborish (pg_cron har kuni chaqiradi, x-notify-secret bilan)
//
// Sozlamalar: TELEGRAM_BOT_TOKEN, APP_URL. SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY ni Supabase o'zi beradi.
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

const SELF_URL = `${SUPABASE_URL}/functions/v1/bot`;
const sb = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false },
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
const ok = () => new Response("ok");

const fmtPhone = (d: string) => `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;

const contactKb = {
  keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
  is_persistent: true,
};

/** /start parametridan ilova sahifasini topadi: case_<uuid> → /case/<uuid> */
function startPath(param: string): string {
  const m = param.match(/^(case|order|listing)_([0-9a-f-]{36})$/i);
  if (m) return `/${m[1].toLowerCase()}/${m[2]}`;
  if (param === "new") return "/new";
  if (param === "ai") return "/ai";
  return "";
}

/** Bugungi va o'tib ketgan, hali yuborilmagan eslatmalarni Telegram'ga (bo'lmasa SMS'ga) yuboradi. */
async function runReminders() {
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const { data: rows, error } = await sb.from("reminders").select("id, user_id, title, body, due_on")
    .is("sent_at", null).lte("due_on", today).order("due_on").limit(400);
  if (error) return { error: error.message };
  if (!rows?.length) return { ok: true, sent: 0 };

  const uids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profs } = await sb.from("profiles").select("id, phone").in("id", uids);
  const phoneOf = new Map((profs ?? []).map((p) => [p.id, normalizePhone(p.phone)]));
  const phones = [...new Set([...phoneOf.values()].filter(Boolean))] as string[];
  const { data: tgu } = await sb.from("telegram_users").select("user_id, phone, chat_id, notify, bot_blocked")
    .or(`user_id.in.(${uids.join(",")})${phones.length ? `,phone.in.(${phones.join(",")})` : ""}`);
  const chatOf = (uid: string) => {
    const ph = phoneOf.get(uid);
    const t = (tgu ?? []).find((x) => x.user_id === uid || (ph && x.phone === ph));
    return t && t.notify && !t.bot_blocked ? t.chat_id as number : null;
  };

  let tgSent = 0, smsSent = 0, failed = 0;
  for (const r of rows) {
    const chat = chatOf(r.user_id);
    let done = false;
    if (chat && BOT_TOKEN) {
      const res = await tg("sendMessage", {
        chat_id: chat, parse_mode: "HTML",
        text: `📅 <b>${escH(r.title)}</b>\n\n${escH(r.body)}\n\n<i>Umumiy tavsiya. Aniq muddatni veterinar bilan kelishing.</i>`,
        reply_markup: APP_URL ? openBtn("📅 Taqvimni ochish", "/animals") : undefined,
      });
      done = Boolean(res.ok);
      if (done) tgSent++;
    }
    if (!done && smsEnabled() && phoneOf.get(r.user_id)) {
      try { await sendSms(phoneOf.get(r.user_id)!, `VetChaqiruv: ${r.title}`); done = true; smsSent++; }
      catch (e) { console.error("reminder sms", e); }
    }
    if (!done) failed++;
    await sb.from("reminders").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
  }
  return { ok: true, telegram: tgSent, sms: smsSent, failed };
}

// deno-lint-ignore no-explicit-any
async function saveTgUser(from: any, extra: Record<string, unknown> = {}) {
  const { data } = await sb.from("telegram_users").upsert({
    tg_id: from.id,
    chat_id: from.id,
    first_name: from.first_name ?? null,
    last_name: from.last_name ?? null,
    username: from.username ?? null,
    language_code: from.language_code ?? null,
    bot_blocked: false,
    ...extra,
  }, { onConflict: "tg_id" }).select("phone, notify").single();
  return data as { phone: string | null; notify: boolean } | null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (!BOT_TOKEN) return json({ ok: false, xabar: "TELEGRAM_BOT_TOKEN hali kiritilmagan" });
    if (!APP_URL) return json({ ok: false, xabar: "APP_URL hali kiritilmagan (ilova manzili, https://...)" });
    if (url.searchParams.get("setup") !== "1") return json({ ok: true, xabar: "Bot ishlayapti" });
    const me = await tg("getMe", {});
    if (!me.ok) return json({ ok: false, xabar: "Token noto'g'ri. BotFather'dan qayta nusxa oling." });
    return json({
      ok: true,
      bot: "@" + me.result.username,
      webhook: (await tg("setWebhook", {
        url: SELF_URL, secret_token: await webhookSecret(),
        allowed_updates: ["message", "my_chat_member"], drop_pending_updates: true,
      })).ok,
      menu_tugmasi: (await tg("setChatMenuButton", {
        menu_button: { type: "web_app", text: "VetChaqiruv", web_app: { url: APP_URL } },
      })).ok,
      buyruqlar: (await tg("setMyCommands", {
        commands: [
          { command: "start", description: "Ilovani ochish" },
          { command: "raqam", description: "Telefon raqamni yuborish yoki almashtirish" },
          { command: "bildirishnoma", description: "Xabarnomalarni yoqish / o'chirish" },
          { command: "help", description: "Yordam" },
        ],
      })).ok,
      tavsif: (await tg("setMyDescription", {
        description:
          "VetChaqiruv chorvadorlarni tumanidagi veterinarlar va vet-dorixonalar bilan bog'laydi.\n\n" +
          "🐄 Kasal hayvon uchun veterinar chaqiring yoki video maslahat oling\n" +
          "💊 Kerakli dori qaysi dorixonada borligini biling va band qiling\n" +
          "✂️ Jun oluvchi, qassob, sun'iy urug'lantiruvchi chaqiring, chorvangizni soting\n" +
          "📅 Hayvon taqvimi: tekshiruv va tug'ish kunini eslatib turamiz\n" +
          "🤖 AI maslahatchiga chorvachilik bo'yicha savol bering",
      })).ok,
      qisqa_tavsif: (await tg("setMyShortDescription", {
        short_description: "Hayvoningizga tez yordam: veterinar chaqirish va dori topish 🐄",
      })).ok,
      miniapp: APP_URL,
    });
  }
  if (req.method !== "POST") return ok();

  // Kunlik eslatmalar (pg_cron → public.reminders_tick)
  if (url.searchParams.get("cron") === "1") {
    const secret = Deno.env.get("NOTIFY_SECRET");
    if (!secret || req.headers.get("x-notify-secret") !== secret) return new Response("forbidden", { status: 403 });
    return json(await runReminders());
  }

  if (!BOT_TOKEN || req.headers.get("x-telegram-bot-api-secret-token") !== await webhookSecret()) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await req.json().catch(() => null);

  // Foydalanuvchi botni bloklasa — xabar yubormaymiz (SMS ishlaydi)
  const mcm = update?.my_chat_member;
  if (mcm?.chat?.type === "private") {
    const status = mcm.new_chat_member?.status;
    await sb.from("telegram_users").update({ bot_blocked: status === "kicked" }).eq("tg_id", mcm.from.id);
    return ok();
  }

  const msg = update?.message;
  if (!msg?.chat?.id || msg.chat.type !== "private" || !msg.from) return ok();
  const chat_id = msg.chat.id;
  const name: string = msg.from.first_name ?? "";
  const text: string = msg.text ?? "";

  // 1) Telefon raqami keldi (tugma yoki mini app'dagi "Raqamni yuborish" orqali)
  if (msg.contact) {
    const c = msg.contact;
    if (c.user_id !== msg.from.id) {
      await tg("sendMessage", { chat_id, text: "Iltimos, faqat o'zingizning raqamingizni pastdagi tugma orqali yuboring 👇", reply_markup: contactKb });
      return ok();
    }
    const phone = normalizePhone(c.phone_number);
    if (!phone) {
      await tg("sendMessage", {
        chat_id,
        text: "Hozircha faqat O'zbekiston raqamlari (+998) qo'llab-quvvatlanadi.",
        reply_markup: { remove_keyboard: true },
      });
      return ok();
    }
    // Raqam o'zgargan bo'lsa, eski hisob bog'lanishini uzamiz (tg-auth yangisini topadi)
    const { data: prev } = await sb.from("telegram_users").select("phone").eq("tg_id", msg.from.id).maybeSingle();
    await saveTgUser(msg.from, prev?.phone === phone ? { phone } : { phone, user_id: null });
    await tg("sendMessage", {
      chat_id,
      parse_mode: "HTML",
      text: `✅ Raqamingiz saqlandi: <b>${fmtPhone(phone)}</b>`,
      reply_markup: { remove_keyboard: true },
    });
    await tg("sendMessage", {
      chat_id,
      text: "Endi ilovani oching. SMS kod kerak emas, avtomatik kirasiz. Ariza va buyurtmalar haqidagi xabarlar shu chatga keladi.",
      reply_markup: openBtn(),
    });
    return ok();
  }

  const saved = await saveTgUser(msg.from);
  const hasPhone = Boolean(saved?.phone);

  if (text.startsWith("/start")) {
    const path = startPath(text.split(/\s+/)[1] ?? "");
    await tg("sendMessage", {
      chat_id,
      text: `Assalomu alaykum${name ? ", " + name : ""}! 👋\n\n` +
        `VetChaqiruv chorvadorlarni tumanidagi veterinarlar va vet-dorixonalar bilan bog'laydi.\n\n` +
        `🐄 Kasal hayvon uchun veterinar chaqiring yoki video maslahat oling\n` +
        `💊 Kerakli dori qaysi dorixonada borligini biling\n` +
        `✂️ Jun oluvchi, qassob, sun'iy urug'lantiruvchi chaqiring yoki chorvangizni soting\n` +
        `📅 Hayvon taqvimi: tekshiruv va tug'ish kunini shu yerga eslatib turaman\n` +
        `🤖 AI maslahatchiga savol bering\n` +
        `🩺 Veterinar, dorixona va ustalar ham shu ilovada ishlaydi`,
      reply_markup: hasPhone ? openBtn(path ? "📄 Arizani ochish" : undefined, path) : contactKb,
    });
    if (!hasPhone) {
      await tg("sendMessage", {
        chat_id,
        text: "Boshlash uchun pastdagi «📱 Telefon raqamni yuborish» tugmasini bosing. Raqam hisobingizni ochish va veterinar siz bilan bog'lanishi uchun kerak.",
        reply_markup: contactKb,
      });
    }
  } else if (text.startsWith("/raqam")) {
    await tg("sendMessage", {
      chat_id,
      parse_mode: "HTML",
      text: (hasPhone ? `Hozirgi raqamingiz: <b>${fmtPhone(saved!.phone!)}</b>\n\n` : "") +
        "Raqamni yuborish uchun pastdagi tugmani bosing 👇",
      reply_markup: contactKb,
    });
  } else if (text.startsWith("/bildirishnoma")) {
    const next = !(saved?.notify ?? true);
    await sb.from("telegram_users").update({ notify: next }).eq("tg_id", msg.from.id);
    await tg("sendMessage", {
      chat_id,
      text: next
        ? "🔔 Xabarnomalar yoqildi. Ariza va buyurtmalar haqidagi xabarlar shu yerga keladi."
        : "🔕 Xabarnomalar o'chirildi. Muhim xabarlar SMS orqali keladi. Qayta yoqish: /bildirishnoma",
    });
  } else if (text.startsWith("/help")) {
    await tg("sendMessage", {
      chat_id,
      parse_mode: "HTML",
      text: "Ilovani ochish uchun pastdagi tugmani yoki chap pastdagi <b>VetChaqiruv</b> menyusini bosing.\n\n" +
        "/raqam — telefon raqamni yuborish yoki almashtirish\n/bildirishnoma — xabarlarni yoqish / o'chirish",
      reply_markup: openBtn(),
    });
  } else if (!hasPhone) {
    await tg("sendMessage", { chat_id, text: "Avval telefon raqamingizni yuboring 👇", reply_markup: contactKb });
  } else {
    await tg("sendMessage", { chat_id, text: "Ariza yuborish yoki ko'rish uchun ilovani oching 👇", reply_markup: openBtn() });
  }
  return ok();
});
