// Ma'lumotlar bazasidagi trigger (public.notify_edge) chaqiradi va kerakli odamlarga SMS yuboradi:
//  • yangi ariza            → tumandagi bo'sh veterinarlar (yoki tanlangan veterinar)
//  • ariza qabul qilindi    → chorvador (vet ismi va telefoni bilan)
//  • vet yo'lga chiqdi      → chorvador
//  • vet rad etdi           → chorvador
//  • chorvador bekor qildi  → biriktirilgan vet
//  • yangi dori buyurtmasi  → dorixona
//  • buyurtma tayyor        → chorvador
// Qabul qiluvchi Telegram botga raqamini yuborgan bo'lsa, xabar Telegram'ga (bepul, ilovani ochish tugmasi bilan) boradi.
// Aks holda yoki Telegram'ga yetmasa — SMS.
// Sozlamalar: NOTIFY_SECRET (vault'dagi notify_secret bilan bir xil), APP_URL (ilova manzili),
// TELEGRAM_BOT_TOKEN (ixtiyoriy), SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY (Supabase avtomatik beradi).
import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizePhone, sendSms } from "../_shared/eskiz.ts";
import { escH, openBtn, tg, tgEnabled } from "../_shared/telegram.ts";

const ANIMALS: Record<string, string> = {
  sigir: "sigir", qoy: "qo'y", echki: "echki", ot: "ot", parranda: "parranda", boshqa: "hayvon",
};
const MAX_VETS_PER_CASE = 15; // bitta ariza uchun ko'pi bilan nechta vetga SMS

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const som = (n: number) => `${Math.round(n || 0).toLocaleString("ru-RU").replace(/\s|,/g, " ")} so'm`;

type Rec = Record<string, any>;

Deno.serve(async (req) => {
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return json({ error: "unauthorized" }, 401);

  const { type, table, record, old_record } = (await req.json()) as {
    type: "INSERT" | "UPDATE"; table: string; record: Rec; old_record: Rec | null;
  };
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const app = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  // path — ilovadagi sahifa (Telegram tugmasi uchun), btn — tugma matni
  const out: { phone: string; text: string; path: string; btn: string }[] = [];

  if (table === "cases") {
    const c = record;
    const animal = ANIMALS[c.animal] ?? "hayvon";
    const place = c.village ? `${c.village}, ${c.district}` : `${c.district} tumani`;
    const link = app ? ` ${app}/case/${c.id}` : "";
    const reopened = type === "UPDATE" && c.status === "new" && old_record?.status === "declined";

    if (type === "INSERT" || reopened) {
      let q = sb.from("vets").select("id, phone");
      if (c.vet_id) {
        q = q.eq("id", c.vet_id);
      } else {
        q = q.eq("region", c.region).eq("district", c.district).neq("status", "offline");
      }
      const { data: vets, error } = await q.limit(MAX_VETS_PER_CASE + 10);
      if (error) console.error(error);
      const declined: string[] = c.declined_by ?? [];
      const urgent = c.urgency === "shoshilinch" ? "SHOSHILINCH " : "";
      const kind = c.kind === "video" ? "video maslahat" : "chaqiruv";
      for (const v of (vets ?? []).filter((v) => !declined.includes(v.id)).slice(0, MAX_VETS_PER_CASE)) {
        out.push({ phone: v.phone, text: `VetChaqiruv: ${urgent}yangi ${kind}. ${animal}, ${place}.${link}`, path: `/case/${c.id}`, btn: "📄 Arizani ko'rish" });
      }
    } else if (type === "UPDATE") {
      const vet = c.vet_id
        ? (await sb.from("vets").select("full_name, phone").eq("id", c.vet_id).maybeSingle()).data
        : null;
      switch (c.status) {
        case "accepted":
          if (vet) out.push({ phone: c.phone, text: `VetChaqiruv: veterinar ${vet.full_name} arizangizni qabul qildi. Tel: ${vet.phone}`, path: `/case/${c.id}`, btn: "📄 Arizani ochish" });
          break;
        case "on_way":
          if (vet) out.push({ phone: c.phone, text: `VetChaqiruv: veterinar ${vet.full_name} yo'lga chiqdi.`, path: `/case/${c.id}`, btn: "📄 Arizani ochish" });
          break;
        case "declined":
          out.push({ phone: c.phone, text: `VetChaqiruv: veterinar arizani qabul qila olmadi. Ilovada boshqa veterinarlarga yuboring.${link}`, path: `/case/${c.id}`, btn: "🔁 Boshqa veterinarga yuborish" });
          break;
        case "cancelled":
          if (vet && old_record?.status !== "new") out.push({ phone: vet.phone, text: `VetChaqiruv: chorvador ${c.contact_name} chaqiruvni bekor qildi.`, path: "/inbox", btn: "🔔 Chaqiruvlar" });
          break;
      }
    }
  }

  if (table === "reservations") {
    // Yozuvni bazadan qayta o'qiymiz: INSERT paytida jami narx hali hisoblanmagan bo'ladi
    const { data: r } = await sb.from("reservations").select("*, pharmacies(name, phone, address)").eq("id", record.id).maybeSingle();
    if (r) {
      const p = (r as Rec).pharmacies as Rec | null;
      if (type === "INSERT" && p?.phone) {
        out.push({ phone: p.phone, text: `VetChaqiruv: yangi dori buyurtmasi, ${som(r.total)}. Mijoz: ${r.contact_name} ${r.phone}`, path: "/orders", btn: "💊 Buyurtmalar" });
      } else if (type === "UPDATE" && r.status === "ready" && r.phone) {
        out.push({ phone: r.phone, text: `VetChaqiruv: ${p?.name ?? "dorixona"} dorilaringizni tayyorladi. Manzil: ${p?.address ?? ""}`, path: "/drugs", btn: "💊 Dorilar" });
      }
    }
  }

  // Telegram'ga ulangan qabul qiluvchilar
  const chats = new Map<string, number>();
  if (tgEnabled() && out.length) {
    const phones = [...new Set(out.map((m) => normalizePhone(m.phone)).filter(Boolean))] as string[];
    const { data: tgu, error } = await sb.from("telegram_users").select("phone, chat_id")
      .in("phone", phones).eq("notify", true).eq("bot_blocked", false);
    if (error) console.error("notify telegram_users:", error);
    for (const u of tgu ?? []) chats.set(u.phone, u.chat_id);
  }

  let viaTg = 0;
  const deliver = async (m: (typeof out)[number]) => {
    const chat = chats.get(normalizePhone(m.phone) ?? "");
    if (chat) {
      // SMS matnidan "VetChaqiruv:" va havolani olib tashlaymiz — Telegram'da tugma bor
      const body = m.text.replace(/^VetChaqiruv:\s*/, "").replace(/\s+https?:\/\/\S+$/, "");
      const res = await tg("sendMessage", {
        chat_id: chat,
        parse_mode: "HTML",
        text: `🐄 <b>VetChaqiruv</b>\n\n${escH(body)}`,
        reply_markup: app ? openBtn(m.btn, m.path) : undefined,
      });
      if (res.ok) { viaTg++; return; }
      if (res.error_code === 403) await sb.from("telegram_users").update({ bot_blocked: true }).eq("chat_id", chat);
    }
    await sendSms(m.phone, m.text); // Telegram yo'q yoki yetmadi — SMS
  };

  const results = await Promise.allSettled(out.map(deliver));
  const failed = results.filter((r) => r.status === "rejected");
  failed.forEach((f) => console.error("notify:", (f as PromiseRejectedResult).reason));
  return json({ sent: out.length - failed.length, telegram: viaTg, failed: failed.length });
});
