// Telegram Mini App bilan ishlash.
// Ilova oddiy brauzerda ochilsa, bu yerdagi hamma narsa jim o'tib ketadi (inTelegram = false).
import { SUPABASE_URL } from "./supabase.js";

export const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
export const inTelegram = Boolean(tg?.initData);
export const tgUser = inTelegram ? tg.initDataUnsafe?.user ?? null : null;

const LS_KEY = "vc_tg_uid"; // sessiya qaysi Telegram foydalanuvchisiga tegishli

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* yo'q */ } };

/** Ilova ochilishi bilan bir marta chaqiriladi: ekranni to'liq ochish, ranglar. */
export function initTelegram() {
  if (!inTelegram) return;
  document.documentElement.classList.add("in-tg");
  try {
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.(); // pastga surilganda ilova yopilib qolmasin (forma to'ldirayotganda)
    const paint = () => {
      const dark = tg.colorScheme === "dark";
      const bg = dark ? "#121a15" : "#eef1ea"; // styles.css dagi --bg bilan bir xil
      tg.setHeaderColor?.(bg);
      tg.setBackgroundColor?.(bg);
      tg.setBottomBarColor?.(dark ? "#1b2620" : "#ffffff");
    };
    paint();
    tg.onEvent?.("themeChanged", paint);
  } catch (e) {
    console.warn("telegram init", e);
  }
}

/** /start yoki t.me/bot/app?startapp=... orqali kelgan parametr → ilova sahifasi. */
export function startPath() {
  const p = String(tg?.initDataUnsafe?.start_param || "");
  const m = p.match(/^case_([0-9a-f-]{36})$/i);
  if (m) return `/case/${m[1]}`;
  if (p === "new") return "/new";
  return null;
}

/** Tashqi havolani ochish: Telegram ichida — tashqi brauzerda, aks holda yangi oynada. */
export function openExternal(url) {
  if (inTelegram && /^https?:/i.test(url)) {
    try { tg.openLink(url); return; } catch { /* eski Telegram */ }
  }
  window.open(url, "_blank", "noopener");
}

export const sessionBelongsToTg = () => inTelegram && lsGet(LS_KEY) === String(tgUser?.id);
export const forgetTgSession = () => lsSet(LS_KEY, null);

/**
 * Telegram orqali kirish. Natija:
 *   { session: {access_token, refresh_token} } — tayyor
 *   { needPhone: true } — foydalanuvchi hali raqamini yubormagan
 *   { error: "..." }
 */
export async function telegramSignIn() {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/tg-auth`, {
      method: "POST",
      // Kalit yuborilmaydi: funksiya Telegram imzosini o'zi tekshiradi (verify_jwt o'chiq).
      // text/plain — brauzer qo'shimcha CORS so'rovisiz yuboradi.
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ initData: tg.initData }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.need_phone) return { needPhone: true };
    if (!res.ok || !body.access_token) {
      const detail = body.error || body.message || body.msg || "";
      return { error: `Server xatosi (${res.status})${detail ? ": " + detail : ""}` };
    }
    lsSet(LS_KEY, String(body.tg_id ?? tgUser?.id ?? ""));
    return { session: { access_token: body.access_token, refresh_token: body.refresh_token } };
  } catch {
    return { error: "Internet aloqasi yo'q. Qayta urinib ko'ring." };
  }
}

/**
 * Telegram'dan foydalanuvchining raqamini so'raydi (u botga kontakt sifatida yuboriladi).
 * true — yuborildi, false — rad etildi, null — bu Telegram versiyasida imkoni yo'q.
 */
export function requestContact() {
  return new Promise((resolve) => {
    if (!inTelegram || typeof tg.requestContact !== "function" || !tg.isVersionAtLeast?.("6.9")) return resolve(null);
    try {
      tg.requestContact((sent) => resolve(Boolean(sent)));
    } catch {
      resolve(null);
    }
  });
}

/** Bot foydalanuvchiga xabar yubora olishi uchun ruxsat so'rash (faqat bir marta). */
export function askWriteAccess() {
  if (!inTelegram || lsGet("vc_tg_write") || !tg.isVersionAtLeast?.("6.9")) return;
  try {
    tg.requestWriteAccess?.(() => lsSet("vc_tg_write", "1"));
  } catch { /* yo'q */ }
}

/** Telegram LocationManager orqali joylashuv (navigator.geolocation ishlamasa). */
export function tgLocation() {
  return new Promise((resolve, reject) => {
    const lm = tg?.LocationManager;
    if (!inTelegram || !lm || !tg.isVersionAtLeast?.("8.0")) return reject(new Error("unsupported"));
    const get = () => {
      if (!lm.isLocationAvailable) return reject(new Error("Joylashuvni aniqlab bo'lmadi"));
      lm.getLocation((d) => (d ? resolve({ lat: +d.latitude.toFixed(6), lng: +d.longitude.toFixed(6) })
        : reject(new Error("Joylashuvga ruxsat berilmadi"))));
    };
    lm.isInited ? get() : lm.init(get);
  });
}
