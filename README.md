# VetChaqiruv

Chorvadorlarni tumanidagi veterinarlar va vet-dorixonalar bilan bog'laydigan ilova.

- **Chorvador** kasal hayvon uchun ariza yuboradi (rasm, joylashuv bilan), veterinarni fermaga chaqiradi yoki video maslahat oladi, retseptni ko'radi, dorilar qaysi dorixonada borligini bilib, band qiladi.
- **Veterinar** tumanidagi arizalarni qabul qiladi, «yo'lda / yetib keldim» deb belgilaydi, yozishadi, retsept yozadi.
- **Dorixona** ombor qoldig'ini kiritadi, buyurtmalarni qabul qiladi. «Berildi» bosilganda qoldiq avtomatik kamayadi.
- Har bir muhim voqeada kerakli odamga **SMS** boradi (Eskiz.uz orqali).

---

## Tuzilma

```
vetchaqiruv/
├── supabase/
│   ├── migrations/
│   │   ├── 20261016000001_schema.sql      ← baza: jadvallar, kirish qoidalari, funksiyalar
│   │   └── 20261016000002_seed_drugs.sql  ← boshlang'ich dorilar ro'yxati
│   ├── functions/
│   │   ├── send-sms/      ← kirish kodini Eskiz orqali yuboradi
│   │   ├── notify/        ← ariza va buyurtmalar bo'yicha SMS
│   │   └── _shared/eskiz.ts
│   └── config.toml
├── web/                   ← ilova (React + Vite, telefonga o'rnatiladigan PWA)
│   ├── src/
│   ├── .env.example
│   └── vercel.json
└── tests/                 ← bazaning avtomatik testlari
```

**Server va API qayerda?**
- **Supabase** bitta xizmatning o'zida PostgreSQL bazasi, avtomatik REST API, telefon orqali kirish, rasm saqlash va jonli yangilanishlarni beradi. Alohida server yozish va ijaraga olish shart emas.
- Xavfsizlik baza darajasida (RLS) ta'minlanadi. Masalan, veterinar faqat o'z tumanidagi arizalarni ko'radi, chorvador boshqalarning arizasini ko'ra olmaydi. Holat o'zgarishlari faqat tekshiruvli funksiyalar orqali bo'ladi. Ikki veterinar bitta arizani bir vaqtda qabul qila olmaydi.
- **Edge Functions** — o'zimizning server kodimiz (SMS yuborish).

---

## 1-qadam. Supabase loyihasini ochish

1. https://supabase.com saytida ro'yxatdan o'ting va **New project** tugmasini bosing.
2. Region sifatida **Central EU (Frankfurt)** ni tanlang. U O'zbekistonga eng yaqin.
3. Baza parolini yozib qo'ying.
4. **Project Settings → API** bo'limidan ikkita qiymatni oling:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** kalit
   - ⚠️ **service_role** kalitini hech kimga bermang va ilovaga qo'ymang.

## 2-qadam. Bazani o'rnatish

1. Supabase panelida **SQL Editor → New query** ni oching.
2. `supabase/migrations/20261016000001_schema.sql` faylining butun matnini qo'yib, **Run** ni bosing.
3. Xuddi shunday `20261016000002_seed_drugs.sql` faylini ham ishga tushiring.
4. **Table Editor** bo'limida `cases`, `vets`, `pharmacies`, `drugs` va boshqa jadvallar paydo bo'lganini tekshiring.

Fayllarni qayta ishga tushirish xavfsiz: mavjud ma'lumotlar o'chmaydi.

## 3-qadam. Telefon orqali kirishni yoqish

1. **Authentication → Sign In / Providers → Phone** ni yoqing.
2. Eskiz ulanmaguncha sinash uchun **Test Phone Numbers and OTPs** maydoniga sinov raqamlarini qo'shing:
   ```
   998901110001=123456, 998901110002=123456, 998901110003=123456
   ```
   Bu raqamlarga SMS ketmaydi, kod har doim `123456` bo'ladi.

## 4-qadam. Ilovani kompyuterda ishga tushirish

Kerak: [Node.js](https://nodejs.org) 18 yoki undan yangi versiya.

```bash
cd web
cp .env.example .env        # Windows: copy .env.example .env
# .env faylini oching va 1-qadamdagi URL va anon kalitni yozing
npm install
npm run dev
```

Brauzerda http://localhost:5173 ni oching va sinov raqami (`90 111 00 01`) va `123456` kodi bilan kiring.
To'liq oqimni sinash uchun uchta brauzer oynasidan (yoki inkognito rejimidan) chorvador, veterinar va dorixona sifatida kiring.

## 5-qadam. SMS: Eskiz.uz

1. https://eskiz.uz saytida ro'yxatdan o'ting, shartnoma tuzing va hisobni to'ldiring.
2. Eskiz kabinetida SMS matnlari shablonlarini moderatsiyadan o'tkazing. Ilova quyidagi matnlarni yuboradi (`{...}` o'rniga qiymat qo'yiladi):
   - `VetChaqiruv: tasdiqlash kodi {kod}. Kodni hech kimga bermang.`
   - `VetChaqiruv: yangi chaqiruv. {hayvon}, {qishloq}. {havola}` (shoshilinch bo'lsa: `SHOSHILINCH yangi chaqiruv`)
   - `VetChaqiruv: veterinar {ism} arizangizni qabul qildi. Tel: {telefon}`
   - `VetChaqiruv: veterinar {ism} yo'lga chiqdi.`
   - `VetChaqiruv: veterinar arizani qabul qila olmadi. Ilovada boshqa veterinarlarga yuboring.{havola}`
   - `VetChaqiruv: chorvador {ism} chaqiruvni bekor qildi.`
   - `VetChaqiruv: yangi dori buyurtmasi, {summa}. Mijoz: {ism} {telefon}`
   - `VetChaqiruv: {dorixona} dorilaringizni tayyorladi. Manzil: {manzil}`

   Eskiz boshqacha matnni tasdiqlasa, matnlarni `supabase/functions/notify/index.ts` faylida o'zgartiring. Kod matnini esa `OTP_TEMPLATE` sozlamasi orqali o'zgartirasiz.

## 6-qadam. Server funksiyalarini joylash (Edge Functions)

[Supabase CLI](https://supabase.com/docs/guides/cli) kerak:

CLI'ni global o'rnatish shart emas, `npx` orqali ishlatiladi (loyiha papkasida, `supabase` papkasi turgan joyda):

```bash
npx supabase@latest login
npx supabase@latest link --project-ref xxxx            # xxxx — Project URL'dagi qism

# Sirli sozlamalar (o'zingiznikini yozing)
npx supabase@latest secrets set ESKIZ_EMAIL="siz@mail.uz" ESKIZ_PASSWORD="eskiz-parol"
npx supabase@latest secrets set NOTIFY_SECRET="uzun-tasodifiy-satr-32-belgi"
npx supabase@latest secrets set APP_URL="https://vetchaqiruv.uz"

npx supabase@latest functions deploy send-sms --no-verify-jwt
npx supabase@latest functions deploy notify --no-verify-jwt
```

Eskiz hali tayyor bo'lmasa, `ESKIZ_*` qatorini o'tkazib yuboring: funksiyalar sinov rejimida ishlaydi.

`ESKIZ_EMAIL` berilmasa, funksiyalar SMS yubormaydi, faqat matnni logga yozadi (sinov rejimi).

### Kirish kodini Eskiz orqali yuborish

1. **Authentication → Hooks → Send SMS hook** ni yoqing: turi **HTTPS**, manzili `https://xxxx.supabase.co/functions/v1/send-sms`.
2. **Generate secret** ni bosing va chiqqan `v1,whsec_...` qiymatini saqlang:
   ```bash
   npx supabase@latest secrets set SEND_SMS_HOOK_SECRET="v1,whsec_..."
   ```

### Ariza va buyurtma SMS'larini yoqish

SQL Editor'da quyidagini ishga tushiring (`xxxx` va sirni o'zingiznikiga almashtiring, sir `NOTIFY_SECRET` bilan bir xil bo'lsin):

```sql
select vault.create_secret('https://xxxx.supabase.co/functions/v1/notify', 'notify_url');
select vault.create_secret('uzun-tasodifiy-satr-32-belgi', 'notify_secret');
```

Shundan so'ng har bir yangi ariza, qabul, «yo'lda», buyurtma va «tayyor» holatida SMS avtomatik ketadi.
Xatolarni **Edge Functions → notify → Logs** bo'limida ko'rasiz.

## 7-qadam. Internetga chiqarish (Vercel)

1. Loyihani GitHub'ga yuklang. `.env` fayli yuklanmaydi, bu to'g'ri.
2. https://vercel.com → **Add New → Project** → repozitoriyni tanlang.
3. **Root Directory** maydoniga `web` ni yozing.
4. **Environment Variables** bo'limiga `VITE_SUPABASE_URL` va `VITE_SUPABASE_ANON_KEY` ni qo'shing.
5. **Deploy** ni bosing. Bir necha daqiqada `https://...vercel.app` manzili tayyor bo'ladi.
6. O'z domeningiz bo'lsa (masalan `vetchaqiruv.uz`), uni Vercel → **Settings → Domains** bo'limida ulang.
7. Domen tayyor bo'lgach, `APP_URL` sozlamasini yangilang va Supabase **Authentication → URL Configuration → Site URL** ga shu manzilni yozing.

Netlify ham ishlaydi: `web/public/_redirects` fayli tayyor.

Foydalanuvchilar saytni telefonda ochib, **Sozlamalar → Telefonga o'rnatish** (yoki brauzer menyusidagi «Bosh ekranga qo'shish») orqali ilovani o'rnatadi.

## Telegram bot va mini app

Ilovani Telegram bot ichida ochish, SMS kodsiz kirish va bildirishnomalarni bot orqali yuborish: **[TELEGRAM.md](TELEGRAM.md)**.

## 8-qadam. Video qo'ng'iroq

Standart holatda bepul **Jitsi Meet** (`meet.jit.si`) ishlatiladi. Har bir ariza uchun alohida, taxmin qilib bo'lmaydigan xona ochiladi.
meet.jit.si xona ochuvchidan Google yoki GitHub orqali kirishni so'rashi mumkin. Buning oldini olish uchun o'z Jitsi serveringizni o'rnatib, `VITE_JITSI_DOMAIN` ga uning manzilini yozing.

---

## Ma'lumotlarni boshqarish

- **Dori qo'shish:** `20261016000002_seed_drugs.sql` fayliga qator qo'shib, SQL Editor'da qayta ishga tushiring.
- **Foydalanuvchilar:** Authentication → Users.
- **Arizalar, buyurtmalar:** Table Editor.

## Testlar

`tests/run_local.sh` skripti bazani mahalliy PostgreSQL 16 da Supabase muhitiga o'xshatib ishga tushiradi va 40 ta tekshiruvni bajaradi: kirish qoidalari, qabul qilish poygasi, retsept, band qilish, qoldiqdan ayirish, rad etish va qayta yuborish, rasmlarga ruxsat.

```bash
sudo bash tests/run_local.sh     # Linux, PostgreSQL 16 o'rnatilgan bo'lishi kerak
```

## Xavfsizlik bo'yicha eslatma

- `service_role` kaliti va Eskiz paroli faqat `supabase secrets` ichida turadi. Ularni ilova kodiga yoki GitHub'ga qo'ymang.
- Rasmlar maxfiy saqlanadi va faqat ariza ishtirokchilariga vaqtinchalik havola orqali ko'rinadi.
- Chorvadorning telefon raqami faqat o'z tumanidagi veterinarlarga, ular arizani ko'rganda ko'rinadi.

## Keyingi rivojlantirish g'oyalari

- Play Market va App Store uchun mobil ilova ([Capacitor](https://capacitorjs.com) bilan shu kodning o'zidan).
- Push-bildirishnomalar (SMS'ga qo'shimcha, bepul).
- Veterinarlarni baholash va izohlar.
- Administrator paneli: veterinarlarni diplom bo'yicha tasdiqlash.
- To'lov (Click, Payme) orqali maslahat uchun haq olish.
