# VetChaqiruv — yangi xizmatlar

Ilovaga quyidagilar qo'shildi:

| Bo'lim | Nima qiladi |
|---|---|
| **Jun olish** | Chorvador tumanidagi jun oluvchi ustani chaqiradi. Buyurtma veterinar arizasi kabi ishlaydi |
| **Qassob: so'yish** | Qassobni uyga chaqirish (so'yish va go'shtni tayyorlash) |
| **Qassob: chorva sotish** | Chorvador e'lon beradi, viloyatdagi qassoblar narx taklif qiladi, chorvador ma'qulini tanlaydi |
| **Sun'iy urug'lantirish** | Urug'lantiruvchini chaqirish. Bajarilgach sana hayvon taqvimiga avtomatik yoziladi |
| **Homiladorlikni tekshirish** | Tekshiruvchini chaqirish. Usta «bo'g'oz / bo'g'oz emas» natijasini kiritadi, u taqvimga yoziladi |
| **Hayvon taqvimi** | Har bir sigir, qo'y, echki va ot uchun urug'lantirish tarixi. Bot kuyikish, tekshiruv, quruq davr va tug'ish kunini eslatadi |
| **AI maslahatchi** | Boqish, parvarish va ko'paytirish bo'yicha savol-javob (Claude) |

Yangi rol **Usta** qo'shildi. Jun oluvchi, qassob, urug'lantiruvchi va tekshiruvchi ro'yxatdan o'tib, bir yoki bir nechta xizmatni belgilaydi.
Chorvadorning pastki menyusi endi: **Ariza · Xizmatlar · Arizalarim · Taqvim · Maslahat**.

## Qanday ishlaydi

**Xizmat buyurtmasi.** Chorvador «Xizmatlar» bo'limida xizmatni tanlaydi va buyurtma yuboradi. Buyurtma tumandagi shu xizmatni ko'rsatadigan ustalarga boradi, Telegram yoki SMS orqali xabar keladi. Birinchi qabul qilgan usta biriktiriladi: yo'lga chiqadi, so'ng «Ish bajarildi» ni bosadi. Rad etilsa, chorvador buyurtmani boshqa ustalarga qayta yuboradi.

**Chorva sotish.** Chorvador e'lon beradi: hayvon turi, bosh soni, vazni, narxi va rasmi. E'lon viloyatdagi qassoblarga boradi, ular narx taklif qiladi. Chorvador taklifni qabul qilganda boshqa takliflar avtomatik rad etiladi. Chorvadorning telefon raqami faqat taklifi qabul qilingan qassobga ko'rinadi.

**Taqvim va eslatmalar.** Urug'lantirish sanasi yozilgach, eslatmalar avtomatik tuziladi. Eslatmalar har kuni soat 09:00 da (Toshkent vaqti) botga keladi. Bot ulanmagan bo'lsa, SMS orqali keladi.

| Eslatma | Sigir | Qo'y | Echki | Ot |
|---|---|---|---|---|
| Kuyikishni kuzatish | 19-kun | 15-kun | 19-kun | 19-kun |
| Homiladorlikni tekshirish | 45-kun | 40-kun | 40-kun | 30-kun |
| Sog'ishni to'xtatish (quruq davr) | tug'ishga 60 kun qolganda | — | — | — |
| Tug'ishga bir hafta qoldi | tug'ishdan 7 kun oldin | ← | ← | ← |
| Taxminiy tug'ish kuni | 283-kun | 150-kun | 150-kun | 340-kun |

Hayvon bo'g'oz deb belgilansa, kuyikish va tekshiruv eslatmalari o'chadi. «Bo'g'oz emas» yoki «tug'di» deb belgilansa, qolgan eslatmalar to'xtaydi. Bu muddatlar o'rtacha ko'rsatkichlar, ilovada ham shunday yozilgan.

**AI maslahatchi.** Har bir foydalanuvchi kuniga 30 tagacha savol bera oladi (sozlash mumkin). Jiddiy belgilar haqida so'ralsa, AI avval veterinar chaqirishni tavsiya qiladi. Retsept dorilarining dozasini o'zi buyurmaydi.

---

## O'rnatish

> Asosiy baza (`vetchaqiruv_ornatish.sql`) va Telegram qismi (`telegram_ornatish.sql`) avval o'rnatilgan bo'lishi kerak.

### 1. Bazaga yangi jadvallarni qo'shish

Supabase → **VetChaqiruv-EU** → **SQL Editor → New query**. `xizmatlar_ornatish.sql` faylini Bloknotda oching, butun matnni nusxalab qo'ying va **Run** ni bosing. «Success» chiqishi kerak.

- Fayl `pg_cron` kengaytmasini o'zi yoqishga harakat qiladi. Pastda «pg_cron yoqilmadi» degan xabar chiqsa: **Database → Extensions** bo'limida `pg_cron` ni yoqing, so'ng faylni yana bir marta ishga tushiring. Faylni qayta ishga tushirish xavfsiz.
- Bildirishnomalar va eslatmalar ishlashi uchun README'dagi 6-qadam (vault'dagi `notify_url` va `notify_secret`, `NOTIFY_SECRET` siri) bajarilgan bo'lishi kerak.

### 2. AI kalitini olish

1. https://console.anthropic.com saytida ro'yxatdan o'ting.
2. **Billing** bo'limida hisobni to'ldiring. Har bir savol uchun kichik to'lov yechiladi. Narxlarni o'sha sahifada ko'rasiz, oylik xarajat chegarasini ham qo'yish mumkin.
3. **API Keys → Create Key** ni bosib kalitni (`sk-ant-...`) nusxalang. Uni hech kimga bermang.
4. Supabase → **Edge Functions → Secrets** ga quyidagilarni qo'shing:
   - `ANTHROPIC_API_KEY` = shu kalit (majburiy)
   - `AI_DAILY_LIMIT` = bir kishiga kunlik savollar soni (ixtiyoriy, standart 30)
   - `AI_MODEL` = boshqa model kerak bo'lsa (ixtiyoriy, standart `claude-sonnet-5-5`)

### 3. Server funksiyalari

`supabase_panel_uchun` papkasidagi fayllardan foydalaning (usul `OQIBCHIQING.txt` da yozilgan):

| Funksiya | Nima qilish kerak |
|---|---|
| `ai-chat` | **Yangi** funksiya yarating, `ai-chat.ts` ni qo'ying. **Verify JWT ni o'chiring** |
| `bot` | Kodini yangi `bot.ts` bilan almashtiring (eslatmalar va yangi tavsif) |
| `notify` | Kodini yangi `notify.ts` bilan almashtiring (ustalar, e'lonlar, takliflar) |

So'ng brauzerda bir marta oching: `https://aoojizjokvvpgtkoayoo.supabase.co/functions/v1/bot?setup=1`. Bu bot tavsifini yangilaydi.

### 4. Ilova

Kod GitHub'ga yuklangan, Vercel saytni o'zi qayta chiqaradi. Qo'shimcha ish shart emas.

---

## Sinash

1. **Usta.** Ikkinchi telefondan kiring: Sozlamalar → Rol → **Usta**. «Qassob» va «Sun'iy urug'lantirish» xizmatlarini belgilang, tumaningizni tanlang.
2. **Buyurtma.** Birinchi telefondan: Xizmatlar → Sun'iy urug'lantirish → buyurtma bering. Ustaga xabar kelishi kerak. Usta «Qabul qilish» → «Ish bajarildi» ni bosadi.
3. **Taqvim.** Chorvador: Taqvim → hayvon qo'shing. Urug'lantirishni yozing va «Yaqin kunlarda» bo'limida eslatmalar chiqqanini tekshiring.
4. **Bozor.** Chorvador: Xizmatlar → Chorva sotish → e'lon bering. Qassob «Bozor» bo'limida ko'radi va narx taklif qiladi. Chorvador taklifni qabul qiladi va qassobga chorvador telefoni ko'rinadi.
5. **AI.** «Maslahat» bo'limida savol bering.

Eslatmani darhol sinash uchun SQL Editor'da `select public.reminders_tick();` ni ishga tushiring. Bugungi eslatmalar botga keladi.

**Muammo bo'lsa:** Supabase → **Edge Functions → ai-chat / bot / notify → Logs**.

| Belgi | Sabab |
|---|---|
| «AI maslahatchi hali sozlanmagan» | `ANTHROPIC_API_KEY` sirini kiritilmagan |
| «AI javob bera olmadi: API kaliti noto'g'ri» | Kalit xato nusxalangan yoki o'chirilgan |
| «AI javob bera olmadi: xato 400» | Billing'da mablag' yo'q yoki model nomi noto'g'ri |
| Eslatmalar kelmayapti | `pg_cron` yoqilmagan yoki vault'da `notify_url` yo'q |
| Ustaga xabar kelmayapti | Usta holati «Ishda emas», yoki boshqa tumanda, yoki shu xizmatni belgilamagan |

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `xizmatlar_ornatish.sql` (= `supabase/migrations/20261127000001_xizmatlar.sql`) | Jadvallar, kirish qoidalari, RPC'lar, eslatmalar triggeri, pg_cron |
| `supabase/functions/ai-chat/` | AI maslahatchi |
| `supabase/functions/bot/` | `?cron=1` — kunlik eslatmalar |
| `supabase/functions/notify/` | Yangi bildirishnomalar |
| `web/src/pages/Services.jsx`, `farmer/NewOrder.jsx`, `OrderDetail.jsx` | Xizmatlar va buyurtmalar |
| `web/src/pages/master/` | Usta kabineti, profili va chorva bozori |
| `web/src/pages/farmer/Sell.jsx`, `ListingDetail.jsx` | Chorva sotish va takliflar |
| `web/src/pages/farmer/Animals.jsx` | Hayvon taqvimi |
| `web/src/pages/Ai.jsx` | AI suhbat |
| `tests/scenario_xizmatlar.sql` | Baza testi: `bash tests/run_local.sh` |
