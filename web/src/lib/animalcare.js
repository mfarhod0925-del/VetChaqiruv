// Hayvon kartasidagi sanalardan eslatmalar: urug'lantirish → homiladorlik tekshiruvi → taxminiy tug'ish.
// Muddatlar taxminiy; aniq qarorni veterinar qiladi.
import { GESTATION, HEAT_CYCLE } from "./constants.js";

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");

/** "2026-11-25" → Date (mahalliy kun boshi) */
export const toDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const fmtDate = (s) => { if (!s) return ""; const d = s instanceof Date ? s : toDate(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
export const addDays = (s, n) => new Date(toDate(s).getTime() + n * DAY);
export const daysSince = (s) => Math.round((toDate(todayStr()) - toDate(s)) / DAY);

/** Voqealarni sana bo'yicha (yangisi birinchi) tartiblaydi */
export const sortEvents = (evs) => (evs || []).slice().sort((a, b) =>
  String(b.event_date).localeCompare(String(a.event_date)) || (b.id || 0) - (a.id || 0));

/**
 * @returns {{tone: "ok"|"warn"|"bad"|"info", title: string, text: string, action?: {service: string, label: string}}[]}
 */
export function careStatus(animal, events) {
  const out = [];
  if (!animal) return out;
  const evs = sortEvents(events);
  const first = (type, after) => evs.find((e) => e.type === type && (!after || e.event_date >= after));
  const gest = GESTATION[animal.species];
  const cycle = HEAT_CYCLE[animal.species];

  if (animal.sex !== "m" && gest) {
    const ins = first("insemination");
    const birth = ins && first("birth", ins.event_date);
    const heat = first("heat");
    if (ins && !birth) {
      const check = evs.find((e) => e.type === "pregnancy_check" && e.event_date >= ins.event_date);
      const days = daysSince(ins.event_date);
      if (check?.result === "pregnant") {
        const due = addDays(ins.event_date, gest);
        const left = Math.round((due - toDate(todayStr())) / DAY);
        out.push({
          tone: left <= 30 ? "warn" : "ok",
          title: `Bo'g'oz · taxminiy tug'ish ${fmtDate(due)}`,
          text: left > 0 ? `${left} kun qoldi (urug'lantirish sanasidan ~${gest} kun hisoblandi).` : "Tug'ish vaqti keldi — hayvonni kuzatib turing.",
          ...(left <= 30 ? { action: { service: "treatment", label: "Tug'ruqqa veterinar chaqirish" } } : {}),
        });
      } else if (check?.result === "open") {
        out.push({ tone: "bad", title: "Bo'g'oz emas", text: "Keyingi kuyikishda qayta urug'lantirish mumkin.",
          action: { service: "insemination", label: "Urug'lantirishga chaqirish" } });
      } else {
        out.push({ tone: "info", title: `Urug'lantirilganiga ${days} kun bo'ldi`,
          text: `Taxminan ${cycle}-kun atrofida kuyga qaytmasligini kuzating. Homiladorlikni tekshirish muddatini veterinar bilan kelishing.`,
          action: { service: "pregnancy", label: "Homiladorlikni tekshirtirish" } });
      }
    } else if (heat && daysSince(heat.event_date) <= 2 && (!ins || ins.event_date < heat.event_date)) {
      out.push({ tone: "warn", title: "Kuyikish kuzatildi", text: "Urug'lantirish uchun mutaxassisni o'z vaqtida chaqiring.",
        action: { service: "insemination", label: "Urug'lantirishga chaqirish" } });
    }
  }
  if (["qoy", "echki"].includes(animal.species)) {
    const sh = first("shearing");
    if (sh) out.push({ tone: "info", title: `Oxirgi qirqim: ${fmtDate(sh.event_date)}`, text: `${daysSince(sh.event_date)} kun oldin.` });
  }
  return out;
}

/** Ro'yxatda ko'rsatish uchun bitta qisqa holat */
export const shortStatus = (animal, events) => careStatus(animal, events)[0] || null;
