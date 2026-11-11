// Telegram Bot API yordamchilari (NavTop'dagi bilan bir xil yondashuv).
// Sozlamalar (supabase secrets set ...):
//   TELEGRAM_BOT_TOKEN — @BotFather bergan token
//   APP_URL            — mini app manzili (masalan https://vetchaqiruv.vercel.app)

export const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
export const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
export const tgEnabled = () => BOT_TOKEN !== "";

const enc = new TextEncoder();

export async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
export const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Webhook so'rovlari faqat Telegram'dan kelganini tekshirish uchun maxfiy kalit (tokendan hosil qilinadi). */
export async function webhookSecret(): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode("vetchaqiruv-webhook:" + BOT_TOKEN));
  return hex(new Uint8Array(h)).slice(0, 48);
}

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };

/**
 * Mini app'dan kelgan initData imzosini tekshiradi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function verifyInitData(initData: string, maxAgeSec = 86400, token = BOT_TOKEN): Promise<TgUser | null> {
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
export async function tg(method: string, payload: unknown): Promise<any> {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({ ok: false }));
  if (!j.ok) console.error("telegram", method, JSON.stringify(j));
  return j;
}

export const escH = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]!));

/** Mini app'ni ochadigan inline tugma. path — ilova ichidagi sahifa, masalan "/case/123". */
export function openBtn(text = "🐄 VetChaqiruv'ni ochish", path = "") {
  return { inline_keyboard: [[{ text, web_app: { url: APP_URL + path } }]] };
}
