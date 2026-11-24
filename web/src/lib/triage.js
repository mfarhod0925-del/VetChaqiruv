// Alomatlar bo'yicha oddiy (qoidaga asoslangan) xavf baholash.
// Internetsiz va sun'iy intellekt ulanmagan holatda ham ishlaydi. TASHXIS EMAS.
import { supabase } from "./supabase.js";

export const LEVELS = {
  shoshilinch: { t: "Shoshilinch", tone: "bad", urgency: "shoshilinch", text: "Veterinarni darhol chaqiring." },
  bugun: { t: "Bugun ichida", tone: "warn", urgency: "bugun", text: "Bugun veterinarga ko'rsating." },
  kuzatish: { t: "Kuzatib boring", tone: "ok", urgency: "maslahat", text: "Hozircha kuzating, yomonlashsa veterinar chaqiring." },
};

const URGENT_SYM = { "Tug'ruq qiyinchiligi": "Tug'ruq qiyinchiligi kechiktirib bo'lmaydigan holat.",
  "Qorin dam bo'lgan": "Qorin dam bo'lishi tez og'irlashishi mumkin." };
const TODAY_SYM = ["Isitma", "Yelin shishgan", "Ich ketishi", "Holsizlik", "Oqsoqlanish", "Tug'ruq qiyinchiligi"];
const SPREAD_SYM = ["Isitma", "Ich ketishi", "Yo'tal", "Ko'z-burun oqishi"];
const URGENT_WORDS = [
  [/nafas|hansira|bo'g'il/i, "Nafas olish qiyinlashgan."],
  [/turolma|yiqil|yotib qol|oyoqqa tur/i, "Hayvon oyoqqa turolmayapti."],
  [/qon/i, "Qon ketishi qayd etilgan."],
  [/zahar|o'g'it|dori ichib/i, "Zaharlanish ehtimoli bor."],
  [/tutqanoq|titra|qaltira/i, "Tutqanoq yoki titrash belgilari."],
  [/o'l(di|ayap|gan|ib)/i, "Podada nobud bo'lish holati bor."],
];

/** @returns {{level: keyof LEVELS, reasons: string[], advice: string[]}} */
export function triage({ animal, count = 1, symptoms = [], note = "" }) {
  const reasons = [];
  let level = "kuzatish";
  const up = (l) => { if (l === "shoshilinch" || (l === "bugun" && level === "kuzatish")) level = l; };

  for (const s of symptoms) if (URGENT_SYM[s]) { up("shoshilinch"); reasons.push(URGENT_SYM[s]); }
  for (const [re, why] of URGENT_WORDS) if (re.test(note)) { up("shoshilinch"); reasons.push(why); }
  const spread = symptoms.filter((s) => SPREAD_SYM.includes(s));
  if (+count >= 3 && spread.length) {
    up("shoshilinch");
    reasons.push(`${count} ta hayvonda bir xil alomat — yuqumli kasallik bo'lishi mumkin.`);
  }
  const today = symptoms.filter((s) => TODAY_SYM.includes(s) && !URGENT_SYM[s]);
  if (today.length) { up("bugun"); reasons.push(`${today.join(", ")} — kechiktirmaslik kerak.`); }
  if (symptoms.length >= 3) { up("bugun"); if (!today.length) reasons.push("Bir nechta alomat birga kuzatilmoqda."); }
  if (!reasons.length && (symptoms.length || note.trim())) reasons.push("Xavfli belgi aniqlanmadi.");

  const advice = ["Kasal hayvonni boshqalaridan ajrating.", "Toza suv bering, soya yoki iliq, quruq joyga qo'ying."];
  if (["sigir", "echki", "qoy"].includes(animal) && symptoms.some((s) => ["Isitma", "Yelin shishgan"].includes(s))) {
    advice.push("Kasal hayvon sutini ichmang va sotmang.");
  }
  advice.push("Veterinar aytmaguncha dori yoki ukol bermang.", "Alomatlar qachon boshlanganini eslab qoling — veterinarga ayting.");
  return { level, reasons, advice };
}

/**
 * Sun'iy intellekt (server funksiyasi "ai-maslahat") orqali tahlil.
 * Funksiya o'rnatilmagan yoki ishlamasa — xato otadi, chaqiruvchi oddiy tahlilni ko'rsatadi.
 */
export async function askAi(input) {
  const { data, error } = await supabase.functions.invoke("ai-maslahat", { body: input });
  if (error) {
    let code = "";
    try { code = (await error.context?.json())?.error || ""; } catch { /* yo'q */ }
    const e = new Error(code || error.message);
    e.code = code;
    throw e;
  }
  if (!data || !LEVELS[data.level]) throw new Error("ai_unavailable");
  return data;
}

export const AI_ERRORS = {
  daily_limit: "Bugungi sun'iy intellekt so'rovlari tugadi. Ertaga yana urinib ko'ring.",
  ai_not_configured: "Sun'iy intellekt hali ulanmagan. Pastdagi oddiy tahlildan foydalaning.",
};
