// Ma'lumotlar bazasidagi trigger (public.notify_edge) chaqiradi va kerakli odamlarga SMS yuboradi:
//  • yangi ariza            → tumandagi bo'sh veterinarlar (yoki tanlangan veterinar)
//  • ariza qabul qilindi    → chorvador (vet ismi va telefoni bilan)
//  • vet yo'lga chiqdi      → chorvador
//  • vet rad etdi           → chorvador
//  • chorvador bekor qildi  → biriktirilgan vet
//  • yangi dori buyurtmasi  → dorixona
//  • buyurtma tayyor        → chorvador
//  • yangi xizmat buyurtmasi (jun, qassob, urug'lantirish, homiladorlik) → tumandagi mos ustalar
//  • usta qabul qildi / yo'lga chiqdi / bajardi / rad etdi → chorvador; chorvador bekor qildi → usta
//  • yangi chorva e'loni    → viloyatdagi qassoblar
//  • yangi narx taklifi     → chorvador; taklif qabul / rad qilindi → qassob
// Qabul qiluvchi Telegram botga raqamini yuborgan bo'lsa, xabar Telegram'ga (bepul, ilovani ochish tugmasi bilan) boradi.
// Aks holda yoki Telegram'ga yetmasa — SMS.
// Sozlamalar: NOTIFY_SECRET (vault'dagi notify_secret bilan bir xil), APP_URL (ilova manzili),
// TELEGRAM_BOT_TOKEN (ixtiyoriy), SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY (Supabase avtomatik beradi).
import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizePhone, sendSms } from "../_shared/eskiz.ts";
import { escH, openBtn, tg, tgEnabled } from "../_shared/telegram.ts";
import { SECRET_KEY, SUPABASE_URL } from "../_shared/keys.ts";

const ANIMALS: Record<string, string> = {
  sigir: "sigir", buqa: "buqa", qoy: "qo'y", echki: "echki", ot: "ot", parranda: "parranda", boshqa: "hayvon",
};
const SERVICES: Record<string, string> = {
  jun: "jun olish", qassob: "so'yish (qassob)", urug: "sun'iy urug'lantirish", homila: "homiladorlikni tekshirish",
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
  const sb = createClient(SUPABASE_URL, SECRET_KEY, {
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

  if (table === "service_orders") {
    const o = record;
    const svc = SERVICES[o.service] ?? "xizmat";
    const animal = ANIMALS[o.animal] ?? "hayvon";
    const place = o.village ? `${o.village}, ${o.district}` : `${o.district} tumani`;
    const link = app ? ` ${app}/order/${o.id}` : "";
    const reopened = type === "UPDATE" && o.status === "new" && old_record?.status === "declined";
    if (type === "INSERT" || reopened) {
      let q = sb.from("masters").select("id, phone").contains("services", [o.service]);
      q = o.master_id ? q.eq("id", o.master_id) : q.eq("region", o.region).eq("district", o.district).neq("status", "offline");
      const { data: ms, error } = await q.limit(MAX_VETS_PER_CASE + 10);
      if (error) console.error(error);
      const declined: string[] = o.declined_by ?? [];
      const date = o.preferred_date ? `, ${String(o.preferred_date).split("-").reverse().join(".")}` : "";
      for (const m of (ms ?? []).filter((m) => !declined.includes(m.id)).slice(0, MAX_VETS_PER_CASE)) {
        out.push({ phone: m.phone, text: `VetChaqiruv: yangi buyurtma — ${svc}. ${animal}, ${o.animal_count} bosh, ${place}${date}.${link}`, path: `/order/${o.id}`, btn: "📄 Buyurtmani ko'rish" });
      }
    } else if (type === "UPDATE") {
      const m = o.master_id ? (await sb.from("masters").select("full_name, phone").eq("id", o.master_id).maybeSingle()).data : null;
      switch (o.status) {
        case "accepted":
          if (m) out.push({ phone: o.phone, text: `VetChaqiruv: usta ${m.full_name} ${svc} buyurtmangizni qabul qildi. Tel: ${m.phone}`, path: `/order/${o.id}`, btn: "📄 Buyurtmani ochish" });
          break;
        case "on_way":
          if (m) out.push({ phone: o.phone, text: `VetChaqiruv: usta ${m.full_name} yo'lga chiqdi.`, path: `/order/${o.id}`, btn: "📄 Buyurtmani ochish" });
          break;
        case "done": {
          const res = o.service === "homila" && o.pregnant !== null ? (o.pregnant ? " Natija: bo'g'oz." : " Natija: bo'g'oz emas.") : "";
          out.push({ phone: o.phone, text: `VetChaqiruv: ${svc} bajarildi.${res}${o.result ? " " + o.result : ""}`, path: o.animal_id ? "/animals" : `/order/${o.id}`, btn: o.animal_id ? "📅 Taqvimni ochish" : "📄 Buyurtmani ochish" });
          break;
        }
        case "declined":
          out.push({ phone: o.phone, text: `VetChaqiruv: usta buyurtmani qabul qila olmadi. Ilovada boshqa ustalarga yuboring.${link}`, path: `/order/${o.id}`, btn: "🔁 Boshqa ustaga yuborish" });
          break;
        case "cancelled":
          if (m && old_record?.status !== "new") out.push({ phone: m.phone, text: `VetChaqiruv: ${o.contact_name} ${svc} buyurtmasini bekor qildi.`, path: "/jobs", btn: "🔔 Buyurtmalar" });
          break;
      }
    }
  }

  if (table === "listings" && type === "INSERT") {
    const l = record;
    const { data: ms, error } = await sb.from("masters").select("id, phone, district").contains("services", ["qassob"])
      .eq("region", l.region).neq("status", "offline").neq("id", l.farmer_id).limit(60);
    if (error) console.error(error);
    const near = (ms ?? []).sort((a, b) => Number(b.district === l.district) - Number(a.district === l.district));
    const price = l.price ? `, ${som(l.price)}` : "";
    const w = l.weight_kg ? `, ~${l.weight_kg} kg` : "";
    for (const m of near.slice(0, MAX_VETS_PER_CASE)) {
      out.push({ phone: m.phone, text: `VetChaqiruv: sotuvda ${ANIMALS[l.animal] ?? "chorva"} ${l.head_count} bosh${w}${price}, ${l.district} tumani. Narx taklif qiling.`, path: `/listing/${l.id}`, btn: "🏷 E'lonni ko'rish" });
    }
  }

  if (table === "offers") {
    const o = record;
    const { data: l } = await sb.from("listings").select("id, farmer_id, animal, head_count").eq("id", o.listing_id).maybeSingle();
    const { data: buyer } = await sb.from("masters").select("full_name, phone").eq("id", o.buyer_id).maybeSingle();
    if (l && buyer) {
      const what = `${ANIMALS[l.animal] ?? "chorva"} (${l.head_count} bosh)`;
      if (o.status === "pending") {
        const { data: f } = await sb.from("profiles").select("phone").eq("id", l.farmer_id).maybeSingle();
        if (f?.phone) out.push({ phone: f.phone, text: `VetChaqiruv: qassob ${buyer.full_name} ${what} uchun ${som(o.price)} taklif qildi.`, path: `/listing/${l.id}`, btn: "💰 Takliflarni ko'rish" });
      } else if (type === "UPDATE" && old_record?.status === "pending" && o.status === "accepted") {
        const { data: f } = await sb.from("profiles").select("full_name, phone").eq("id", l.farmer_id).maybeSingle();
        out.push({ phone: buyer.phone, text: `VetChaqiruv: ${what} uchun taklifingiz (${som(o.price)}) qabul qilindi! Chorvador: ${f?.full_name ?? ""}, tel ${f?.phone ?? ""}.`, path: `/listing/${l.id}`, btn: "📞 Chorvador bilan bog'lanish" });
      } else if (type === "UPDATE" && old_record?.status === "pending" && o.status === "rejected") {
        out.push({ phone: buyer.phone, text: `VetChaqiruv: ${what} uchun taklifingiz qabul qilinmadi.`, path: "/market", btn: "🏷 Boshqa e'lonlar" });
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
