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
import { hex, verifyInitData } from "../_shared/telegram.ts";
import { normalizePhone } from "../_shared/eskiz.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

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
  const pub = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
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
