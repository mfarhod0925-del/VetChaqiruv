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
export function normalizePhone(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998")) return d;
  if (d.length === 9) return "998" + d;
  return null;
}

export const smsEnabled = () => EMAIL !== "" && PASSWORD !== "";

export async function sendSms(phone: string, message: string): Promise<unknown> {
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
