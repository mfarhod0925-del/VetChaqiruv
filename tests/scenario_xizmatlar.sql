-- Yangi xizmatlar testi: ustalar, buyurtmalar, taqvim va eslatmalar, chorva sotish, AI jadvali.
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-0000000000b1', '998901120001'),  -- chorvador B1 (Urgut)
 ('00000000-0000-0000-0000-0000000000b2', '998901120002'),  -- chorvador B2 (Urgut)
 ('00000000-0000-0000-0000-0000000000c1', '998901120003'),  -- usta M1: urug + homila (Urgut)
 ('00000000-0000-0000-0000-0000000000c2', '998901120004'),  -- usta M2: qassob (Payariq, Samarqand)
 ('00000000-0000-0000-0000-0000000000c3', '998901120005'),  -- usta M3: jun (Urgut)
 ('00000000-0000-0000-0000-0000000000c4', '998901120006');  -- usta M4: qassob (Buxoro)

create or replace function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.expect_fail(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'KUTILGAN XATO CHIQMADI: % (%)', code, sql;
exception when others then
  if sqlerrm like 'KUTILGAN XATO%' then raise; end if;
  if position(code in sqlerrm) = 0 then raise exception 'Boshqa xato: % (kutilgan %)', sqlerrm, code; end if;
end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not ok then raise exception 'TEKSHIRUV O''TMADI: %', what; end if; raise notice 'OK  %', what; end $$;

set role authenticated;

-- ---------------- Ustalar ro'yxatdan o'tadi ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
update public.profiles set role = 'master', full_name = 'Usta Bir' where id = auth.uid();
insert into public.masters (id, full_name, phone, region, district, services)
values (auth.uid(), 'Usta Bir', '+998901120003', 'Samarqand viloyati', 'Urgut', '{urug,homila}');
select pg_temp.expect_fail($$insert into public.masters (id, full_name, phone, region, district, services) values ('00000000-0000-0000-0000-0000000000c3','X','+998900000000','Samarqand viloyati','Urgut','{jun}')$$, 'row-level security');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect_fail($$insert into public.masters (id, full_name, phone, region, district, services) values (auth.uid(),'Qassob','+998901120004','Samarqand viloyati','Payariq','{baliq}')$$, 'check constraint');
insert into public.masters (id, full_name, phone, region, district, services)
values (auth.uid(), 'Qassob Ikki', '+998901120004', 'Samarqand viloyati', 'Payariq', '{qassob}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.masters (id, full_name, phone, region, district, services)
values (auth.uid(), 'Jun Usta', '+998901120005', 'Samarqand viloyati', 'Urgut', '{jun}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
insert into public.masters (id, full_name, phone, region, district, services)
values (auth.uid(), 'Buxoro Qassob', '+998901120006', 'Buxoro viloyati', 'Buxoro', '{qassob}');
select pg_temp.check((select count(*) from public.masters) = 4, 'ustalar ro''yxatini hamma ko''radi');

-- ---------------- Chorvador hayvon qo'shadi va urug'lantiruvchi chaqiradi ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
update public.profiles set role = 'farmer', full_name = 'Bobur' where id = auth.uid();
insert into public.animals (id, farmer_id, kind, name) values
  ('22222222-0000-0000-0000-000000000001', auth.uid(), 'sigir', 'Malika');
insert into public.service_orders (id, farmer_id, service, region, district, animal, animal_id, contact_name, phone)
values ('33333333-0000-0000-0000-000000000001', auth.uid(), 'urug', 'Samarqand viloyati', 'Urgut', 'sigir',
        '22222222-0000-0000-0000-000000000001', 'Bobur', '+998901120001');
select pg_temp.expect_fail($$insert into public.service_orders (farmer_id, service, region, district, animal, contact_name, phone, status) values (auth.uid(),'jun','Samarqand viloyati','Urgut','qoy','B','+998901120001','done')$$, 'row-level security');
select pg_temp.expect_fail($$update public.service_orders set status = 'done'$$, 'permission denied');

-- Boshqa chorvadorning hayvoniga bog'lab bo'lmaydi
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect_fail($$insert into public.service_orders (farmer_id, service, region, district, animal, animal_id, contact_name, phone) values (auth.uid(),'urug','Samarqand viloyati','Urgut','sigir','22222222-0000-0000-0000-000000000001','B2','+998901120002')$$, 'row-level security');
select pg_temp.check((select count(*) from public.animals) = 0, 'boshqaning hayvonlari ko''rinmaydi');
select pg_temp.check((select count(*) from public.service_orders) = 0, 'boshqaning buyurtmalari ko''rinmaydi');

-- Kim ko'radi: urug' ustasi ko'radi, jun ustasi va boshqa tumandagi qassob ko'rmaydi
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check((select count(*) from public.service_orders) = 0, 'jun ustasi urug'' buyurtmasini ko''rmaydi');
select pg_temp.expect_fail($$select public.accept_order('33333333-0000-0000-0000-000000000001')$$, 'not_in_area');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) from public.service_orders) = 1, 'urug'' ustasi tumandagi buyurtmani ko''radi');
select public.accept_order('33333333-0000-0000-0000-000000000001');
select pg_temp.expect_fail($$select public.advance_order('33333333-0000-0000-0000-000000000001', 'new')$$, 'bad_transition');
select public.advance_order('33333333-0000-0000-0000-000000000001', 'on_way');
select public.advance_order('33333333-0000-0000-0000-000000000001', 'done', 'Golshteyn, №4512');
select pg_temp.check((select status from public.service_orders where id = '33333333-0000-0000-0000-000000000001') = 'done', 'buyurtma bajarildi');

-- Bajarilgan urug'lantirish taqvimga tushdi va eslatmalar tuzildi
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from public.breedings where animal_id = '22222222-0000-0000-0000-000000000001' and sire = 'Golshteyn, №4512') = 1,
  'urug''lantirish avtomatik taqvimga yozildi');
select pg_temp.check((select count(*) from public.reminders) = 5, 'sigir uchun 5 ta eslatma (kuyikish, tekshiruv, quruq, 7 kun, tug''ish)');
select pg_temp.check((select due_on from public.reminders where kind = 'tugish') = public.today_tashkent() + 283, 'tug''ish sanasi +283 kun');
select pg_temp.expect_fail($$insert into public.reminders (user_id, kind, due_on, title) values (auth.uid(),'x',current_date,'x')$$, 'permission denied');

-- Homiladorlik tekshiruvi: natija talab qilinadi, so'ng taqvimga yoziladi
insert into public.service_orders (id, farmer_id, service, region, district, animal, animal_id, contact_name, phone)
values ('33333333-0000-0000-0000-000000000002', auth.uid(), 'homila', 'Samarqand viloyati', 'Urgut', 'sigir',
        '22222222-0000-0000-0000-000000000001', 'Bobur', '+998901120001');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select public.accept_order('33333333-0000-0000-0000-000000000002');
select pg_temp.expect_fail($$select public.advance_order('33333333-0000-0000-0000-000000000002', 'done')$$, 'need_result');
select public.advance_order('33333333-0000-0000-0000-000000000002', 'done', 'Bo''g''oz', true);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select pregnant from public.breedings where animal_id = '22222222-0000-0000-0000-000000000001') is true, 'tekshiruv natijasi taqvimga yozildi');
select pg_temp.check((select count(*) from public.reminders where sent_at is null) = 3, 'bo''g''oz: kuyikish va tekshiruv eslatmalari olib tashlandi');

-- Tug'ilgach — eslatmalar to'xtaydi
update public.breedings set birth_on = public.today_tashkent() where animal_id = '22222222-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) from public.reminders where sent_at is null) = 0, 'tug''ilgach eslatmalar o''chdi');

-- Qo'lda urug'lantirish yozuvi (qo'y): quruq davr eslatmasi yo'q
insert into public.animals (id, farmer_id, kind, name) values ('22222222-0000-0000-0000-000000000002', auth.uid(), 'qoy', 'Oqqo''y');
insert into public.breedings (animal_id, farmer_id, bred_on, method) values ('22222222-0000-0000-0000-000000000002', auth.uid(), public.today_tashkent(), 'tabiiy');
select pg_temp.check((select count(*) from public.reminders where sent_at is null) = 4, 'qo''y uchun 4 ta eslatma (quruq davrsiz)');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect_fail($$insert into public.breedings (animal_id, farmer_id, bred_on) values ('22222222-0000-0000-0000-000000000002', auth.uid(), current_date)$$, 'row-level security');

-- Rad etish va qayta yuborish
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
insert into public.service_orders (id, farmer_id, service, region, district, animal, animal_count, contact_name, phone)
values ('33333333-0000-0000-0000-000000000003', auth.uid(), 'jun', 'Samarqand viloyati', 'Urgut', 'qoy', 40, 'B2', '+998901120002');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select public.accept_order('33333333-0000-0000-0000-000000000003');
select public.decline_order('33333333-0000-0000-0000-000000000003');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.resend_order('33333333-0000-0000-0000-000000000003');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check((select count(*) from public.service_orders where status = 'new') = 0, 'rad etgan usta qayta yuborilgan buyurtmani ko''rmaydi');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.cancel_order('33333333-0000-0000-0000-000000000003');

-- ---------------- Chorva sotish ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.listings (id, farmer_id, region, district, animal, head_count, weight_kg, price)
values ('44444444-0000-0000-0000-000000000001', auth.uid(), 'Samarqand viloyati', 'Urgut', 'buqa', 2, 350, 30000000);
select pg_temp.expect_fail($$insert into public.listings (farmer_id, region, district, animal, status) values (auth.uid(),'Samarqand viloyati','Urgut','qoy','sold')$$, 'row-level security');
update public.listings set price = 29000000 where id = '44444444-0000-0000-0000-000000000001';
select pg_temp.expect_fail($$update public.listings set status = 'sold' where id = '44444444-0000-0000-0000-000000000001'$$, 'row-level security');

-- Viloyatdagi qassob ko'radi (boshqa tumanda bo'lsa ham), Buxoro qassobi va oddiy usta ko'rmaydi
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
select pg_temp.check((select count(*) from public.listings) = 0, 'boshqa viloyat qassobi e''lonni ko''rmaydi');
select pg_temp.expect_fail($$select public.make_offer('44444444-0000-0000-0000-000000000001', 1000)$$, 'not_a_buyer');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) from public.listings) = 0, 'qassob bo''lmagan usta e''lonni ko''rmaydi');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check((select count(*) from public.listings) = 1, 'viloyatdagi qassob e''lonni ko''radi');
select public.make_offer('44444444-0000-0000-0000-000000000001', 26000000, 'Ertaga olib ketaman');
select public.make_offer('44444444-0000-0000-0000-000000000001', 27000000, 'Narxni oshirdim');
select pg_temp.check((select count(*) from public.offers) = 1 and (select price from public.offers) = 27000000, 'qayta taklif yangilandi');
select pg_temp.expect_fail($$select public.make_offer('44444444-0000-0000-0000-000000000001', -5)$$, 'bad_price');
select pg_temp.check((select count(*) from public.listing_contact('44444444-0000-0000-0000-000000000001')) = 0, 'qabul qilinmaguncha telefon ko''rinmaydi');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((select count(*) from public.offers) = 0, 'begona taklifni ko''rmaydi');
select pg_temp.expect_fail($$select public.answer_offer((select id from public.offers limit 1), true)$$, 'not_found');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from public.offers) = 1, 'e''lon egasi taklifni ko''radi');
select public.answer_offer((select id from public.offers limit 1), true);
select pg_temp.check((select status from public.listings where id = '44444444-0000-0000-0000-000000000001') = 'sold', 'e''lon sotildi');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check((select phone from public.listing_contact('44444444-0000-0000-0000-000000000001')) = '998901120001', 'xaridor chorvador telefonini oldi');
select pg_temp.check((select count(*) from public.listings) = 1, 'xaridor sotilgan e''lonni ko''rishda davom etadi');
select pg_temp.expect_fail($$select public.make_offer('44444444-0000-0000-0000-000000000001', 1)$$, 'listing_closed');

-- ---------------- AI suhbat jadvali ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_fail($$insert into public.ai_messages (user_id, role, content) values (auth.uid(),'user','salom')$$, 'permission denied');

-- ---------------- Bildirishnomalar navbati ----------------
reset role;
select pg_temp.check((select count(*) from net.calls where body->>'table' = 'service_orders') >= 5, 'buyurtma holatlari notify''ga ketdi');
select pg_temp.check((select count(*) from net.calls where body->>'table' = 'listings') = 1, 'yangi e''lon notify''ga ketdi');
select pg_temp.check((select count(*) from net.calls where body->>'table' = 'offers') >= 2, 'taklif va javob notify''ga ketdi');
select public.reminders_tick();
select pg_temp.check((select url from net.calls order by ctid desc limit 1) = 'http://x/bot?cron=1', 'kunlik eslatma bot?cron=1 ni chaqiradi');

\echo 'XIZMATLAR TESTI MUVAFFAQIYATLI'
