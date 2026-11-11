# VetChaqiruv — Telegram bot va mini app

Ilova endi Telegram ichida ham ochiladi (NavTop kabi). Oddiy sayt sifatida ham avvalgidek ishlayveradi.

## Qanday ishlaydi

1. Foydalanuvchi botda **/start** bosadi. Bot uni kutib oladi va **«📱 Telefon raqamni yuborish»** tugmasini chiqaradi.
2. Raqam yuborilgach, bot **«VetChaqiruv'ni ochish»** tugmasini beradi. Chap pastda doimiy **VetChaqiruv** menyu tugmasi ham bo'ladi.
3. Ilova Telegram ichida ochiladi va **SMS kodsiz, avtomatik kiradi**. Raqam SMS orqali kirgandagi bilan bir xil bo'lgani uchun eski hisob, arizalar va rol saqlanib qoladi.
4. Ariza va buyurtmalar haqidagi xabarlar **bot chatiga** keladi, «Arizani ochish» tugmasi bilan. Botga ulanmagan foydalanuvchilarga avvalgidek **SMS** ketadi. Shunday qilib SMS xarajati kamayadi.

Agar foydalanuvchi ilovani raqam yubormasdan ochsa, ilovaning o'zida «📱 Raqamni yuborish» tugmasi chiqadi.

## Nima qo'shildi

| Fayl | Vazifasi |
|---|---|
| `supabase/functions/bot/` | Telegram bot: /start, raqam qabul qilish, /raqam, /bildirishnoma, /help. `?setup=1` webhook va menyu tugmasini sozlaydi |
| `supabase/functions/tg-auth/` | Mini app'dan kelgan Telegram imzosini (initData) tekshiradi va Supabase sessiyasini beradi |
| `supabase/functions/_shared/telegram.ts` | Umumiy Telegram yordamchilari |
| `supabase/functions/notify/` | Endi avval Telegram'ga, bo'lmasa SMS'ga yuboradi |
| `supabase/migrations/20261111000001_telegram.sql` va `telegram_ornatish.sql` | `telegram_users` jadvali (bir xil matn) |
| `web/src/lib/telegram.js`, `web/src/pages/TelegramLogin.jsx` | Mini app: avtomatik kirish, raqam so'rash, «Orqaga» tugmasi, ranglar, xarita va video havolalari |

---

## O'rnatish (bir marta)

### 1. Bot yaratish

1. Telegram'da [@BotFather](https://t.me/BotFather) ga kiring va `/newbot` yozing.
2. Nomini (`VetChaqiruv`) va manzilini (masalan `vetchaqiruv_bot`) kiriting.
3. Berilgan **tokenni** saqlab qo'ying (`1234567890:AA...`). Uni hech kimga bermang.
4. Ixtiyoriy: `/setuserpic` orqali bot rasmini qo'ying (`web/public/icon-512.png`).

### 2. Bazaga jadval qo'shish

Supabase → **VetChaqiruv-EU** loyihasi → **SQL Editor → New query**. `telegram_ornatish.sql` faylini Bloknot bilan oching, butun matnni nusxalab qo'ying va **Run** bosing.

### 3. Supabase sozlamalari

**Authentication → Sign In / Providers**:
- **Phone** yoqilgan bo'lishi kerak (README 3-qadam).
- **Allow new users to sign up** yoqilgan bo'lishi kerak.

### 4. Ilovani internetga chiqarish

Mini app faqat `https://` manzilda ishlaydi. Agar ilova hali Vercel'da bo'lmasa, README'dagi 7-qadamni bajaring (GitHub → Vercel). Manzilni yozib oling, masalan `https://web-c2pz.vercel.app`.

### 5. Server funksiyalarini joylash

> Git yoki Node.js o'rnatilmagan bo'lsa: `supabase_panel_uchun/OQIBCHIQING.txt` dagi usul bilan Supabase panelining o'zida joylang. Pastdagi buyruqlar shart emas.

`VetChaqiruv` papkasida PowerShell oching:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref aoojizjokvvpgtkoayoo

npx supabase@latest secrets set TELEGRAM_BOT_TOKEN="1234567890:AA..."
npx supabase@latest secrets set APP_URL="https://web-c2pz.vercel.app"

npx supabase@latest functions deploy bot --no-verify-jwt
npx supabase@latest functions deploy tg-auth --no-verify-jwt
npx supabase@latest functions deploy notify --no-verify-jwt
```

### 6. Botni ulash

Brauzerda quyidagi manzilni oching:

```
https://aoojizjokvvpgtkoayoo.supabase.co/functions/v1/bot?setup=1
```

Hamma qatorda `true` chiqsa, bot tayyor: webhook, menyu tugmasi, buyruqlar va tavsif sozlandi.
`APP_URL` yoki tokenni o'zgartirsangiz, shu manzilni yana bir marta oching.

### 7. Ixtiyoriy: to'g'ridan-to'g'ri havola

@BotFather → `/mybots` → botingiz → **Bot Settings → Configure Mini App → Enable Mini App** → ilova manzilini kiriting.
Shundan so'ng `https://t.me/vetchaqiruv_bot/app` havolasi ilovani to'g'ridan-to'g'ri ochadi. `?startapp=new` qo'shilsa, yangi ariza sahifasi ochiladi.

---

## Sinash

1. Botga `/start` yozing → raqamni yuboring → «VetChaqiruv'ni ochish» ni bosing.
2. Ilova SMS so'ramasdan ochilishi kerak. Avval SMS orqali kirgan raqam bo'lsa, eski arizalar ko'rinadi.
3. Ikkinchi Telegram akkauntdan veterinar sifatida kiring va birinchi akkauntdan ariza yuboring. Veterinarga bot orqali «📄 Arizani ko'rish» tugmali xabar kelishi kerak.

**Muammo bo'lsa:** Supabase → **Edge Functions → bot / tg-auth / notify → Logs**.

| Belgi | Sabab |
|---|---|
| `?setup=1` da «Token noto'g'ri» | Token xato nusxalangan |
| Ilovada «Telegram ma'lumoti tasdiqlanmadi» | `TELEGRAM_BOT_TOKEN` boshqa botniki yoki ilova boshqa bot orqali ochilgan |
| «Kirib bo'lmadi. Phone provayderi…» | 3-qadam bajarilmagan |
| Bot javob bermayapti | `?setup=1` ochilmagan yoki `bot` funksiyasi `--no-verify-jwt` siz joylangan |

## Bot buyruqlari

- `/start` — kutib olish va ilovani ochish
- `/raqam` — telefon raqamni yuborish yoki almashtirish
- `/bildirishnoma` — Telegram xabarlarini yoqish / o'chirish (o'chirilsa, SMS keladi)
- `/help` — yordam

## Xavfsizlik

- Bot tokeni faqat `supabase secrets` ichida turadi, ilova kodiga qo'yilmaydi.
- Kirish faqat Telegram imzosi to'g'ri bo'lsa ishlaydi (imzo 24 soat amal qiladi).
- Bot faqat foydalanuvchining **o'z** raqamini qabul qiladi (boshqa odamning kontaktini yuborib bo'lmaydi).
- `telegram_users` jadvalini ilovadan o'qib bo'lmaydi, unga faqat server funksiyalari kiradi.
