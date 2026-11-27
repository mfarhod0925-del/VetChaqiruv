// VetChaqiruv Telegram boti (NavTop'dagi "bot" funksiyasi andozasida).
//   GET  ?setup=1  → webhook, menyu tugmasi, buyruqlar va tavsifni sozlaydi (bir marta brauzerda oching)
//   GET            → "Bot ishlayapti" tekshiruvi
//   POST (Telegram) → /start, /help, /raqam, /bildirishnoma, telefon raqamini qabul qilish
//   POST ?cron=1    → hayvon taqvimi eslatmalarini yuborish (pg_cron har kuni chaqiradi, x-notify-secret bilan)
//
// Sozlamalar: TELEGRAM_BOT_TOKEN, APP_URL. SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY ni Supabase o'zi beradi.
import { createClient } from "npm:@supabase/supabase-js@2";
import { APP_URL, BOT_TOKEN, escH, openBtn, tg, webhookSecret } from "../_shared/telegram.ts";
import { normalizePhone, sendSms, smsEnabled } from "../_shared/eskiz.ts";
import { SECRET_KEY, SUPABASE_URL } from "../_shared/keys.ts";

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
