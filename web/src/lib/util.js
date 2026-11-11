import { inTelegram, tgLocation } from "./telegram.js";

const pad = (n) => String(n).padStart(2, "0");

export const som = (n) => `${Math.round(+n || 0).toLocaleString("ru-RU").replace(/[\s,  ]/g, " ")} so'm`;

export function when(t) {
  if (!t) return "";
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

export function ago(t) {
  const m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (m < 1) return "hozirgina";
  if (m < 60) return `${m} daq oldin`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} soat oldin`;
  return when(t);
}

export const initials = (n) =>
  String(n || "?").trim().split(/\s+/).map((x) => x[0] || "").join("").slice(0, 2).toUpperCase() || "?";

/** Har qanday yozuvni 998XXXXXXXXX ko'rinishiga keltiradi; noto'g'ri bo'lsa null. */
export function phoneDigits(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998")) return d;
  if (d.length === 9) return "998" + d;
  return null;
}
export const phoneE164 = (p) => (phoneDigits(p) ? "+" + phoneDigits(p) : null);
export function fmtPhone(p) {
  const d = phoneDigits(p);
  if (!d) return String(p || "");
  return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
}
/** Kiritish maydoni uchun: faqat 9 ta raqam, "90 123 45 67" ko'rinishida. */
export function localPhoneInput(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.startsWith("998") && d.length > 9) d = d.slice(3);
  d = d.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");
}
export const telHref = (p) => (phoneE164(p) ? `tel:${phoneE164(p)}` : undefined);

export function jitsiUrl(caseId) {
  const domain = import.meta.env.VITE_JITSI_DOMAIN || "meet.jit.si";
  return `https://${domain}/VetChaqiruv-${String(caseId).replace(/[^a-zA-Z0-9]/g, "")}`;
}
export const googleMaps = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
export const yandexMaps = (lat, lng) => `https://yandex.uz/maps/?pt=${lng},${lat}&z=16&l=map`;

const ERRORS = {
  already_taken: "Bu arizani boshqa veterinar qabul qilib bo'ldi.",
  not_in_area: "Bu ariza sizning tumaningizga tegishli emas.",
  not_a_vet: "Avval veterinar profilini yarating.",
  not_a_pharmacy: "Avval dorixonani ro'yxatdan o'tkazing.",
  case_not_found: "Ariza topilmadi.",
  not_allowed: "Bu amal uchun ruxsat yo'q.",
  bad_transition: "Bu amalni hozirgi holatda bajarib bo'lmaydi. Sahifani yangilang.",
  insufficient_stock: "Dorixonada yetarli dori qolmagan. Sonini kamaytiring.",
  bad_items: "Kamida bitta dorini tanlang.",
  pharmacy_not_found: "Dorixona topilmadi.",
  not_authenticated: "Qaytadan tizimga kiring.",
};
export function errText(e) {
  const msg = String(e?.message || e?.error_description || e || "");
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k];
  if (/row-level security|permission denied/i.test(msg)) return "Ruxsat yo'q. Ma'lumotlaringizni tekshiring.";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Internet aloqasi yo'q. Qayta urinib ko'ring.";
  if (/Token has expired|invalid.*otp|otp.*invalid/i.test(msg)) return "Kod noto'g'ri yoki muddati o'tgan.";
  if (/rate limit|too many/i.test(msg)) return "Juda ko'p urinish. Bir daqiqadan so'ng qayta urinib ko'ring.";
  if (/duplicate key/i.test(msg)) return "Bu yozuv allaqachon mavjud.";
  if (/check constraint/i.test(msg)) return "Kiritilgan ma'lumotlarni tekshiring.";
  return msg ? `Xatolik: ${msg}` : "Xatolik yuz berdi.";
}

function browserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Joylashuvni aniqlab bo'lmaydi"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      (e) => reject(new Error(e.code === 1 ? "Joylashuvga ruxsat berilmadi" : "Joylashuvni aniqlab bo'lmadi")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

/** Joylashuv: avval brauzer orqali, Telegram ichida ishlamasa — Telegram LocationManager orqali. */
export async function getPosition() {
  try {
    return await browserPosition();
  } catch (e) {
    if (!inTelegram) throw e;
    try { return await tgLocation(); } catch { throw e; }
  }
}

/** Qisqa ovozli signal (yangi chaqiruv kelganda). Brauzer ruxsat bermasa jim o'tadi. */
export function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 250);
  } catch { /* ovoz o'chirilgan */ }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* yo'q */ }
}
