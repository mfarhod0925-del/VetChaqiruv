// Supabase Auth "Send SMS" hook: telefon orqali kirishdagi tasdiqlash kodini Eskiz.uz orqali yuboradi.
// Sozlamalar:
//   SEND_SMS_HOOK_SECRET — Supabase panelida hook yaratilganda beriladigan "v1,whsec_..." kalit
//   OTP_TEMPLATE         — ixtiyoriy. Eskiz'da tasdiqlangan shablon matni, {code} o'rniga kod qo'yiladi.
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { sendSms } from "../_shared/eskiz.ts";

const TEMPLATE = Deno.env.get("OTP_TEMPLATE") ??
  "VetChaqiruv: tasdiqlash kodi {code}. Kodni hech kimga bermang.";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: { http_code: 405, message: "POST kerak" } }, 405);

  const payload = await req.text();
  const secret = (Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
  let user: { phone?: string }, sms: { otp?: string };
  try {
    const wh = new Webhook(secret);
    ({ user, sms } = wh.verify(payload, Object.fromEntries(req.headers)) as {
      user: { phone?: string };
      sms: { otp?: string };
    });
  } catch (_e) {
    return json({ error: { http_code: 401, message: "Imzo noto'g'ri" } }, 401);
  }

  try {
    if (!user?.phone || !sms?.otp) throw new Error("phone yoki otp yo'q");
    await sendSms(user.phone, TEMPLATE.replace("{code}", sms.otp));
    return json({});
  } catch (e) {
    console.error("send-sms:", e);
    return json({ error: { http_code: 500, message: `SMS yuborilmadi: ${(e as Error).message}` } }, 500);
  }
});
