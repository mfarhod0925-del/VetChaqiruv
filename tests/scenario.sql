-- To'liq ish oqimi testi: chorvador → veterinar → retsept → dorixona → band qilish → qoldiq.
-- Har bir tekshiruv muvaffaqiyatsiz bo'lsa ON_ERROR_STOP testni to'xtatadi.
\set ON_ERROR_STOP on
\set QUIET on

-- Foydalanuvchilar (auth.users → profiles trigger)
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-0000000000f1', '998901110001'),  -- chorvador F1
 ('00000000-0000-0000-0000-0000000000f2', '998901110002'),  -- chorvador F2
 ('00000000-0000-0000-0000-0000000000a1', '998901110003'),  -- vet V1 (Urgut)
 ('00000000-0000-0000-0000-0000000000a2', '998901110004'),  -- vet V2 (Urgut)
 ('00000000-0000-0000-0000-0000000000a3', '998901110005'),  -- vet V3 (Payariq)
 ('00000000-0000-0000-0000-0000000000d1', '998901110006');  -- dorixona P1 (Urgut)

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

select pg_temp.check((select count(*) from public.profiles) = 6, 'profil trigger 6 ta profil yaratdi');

-- ---------------- Veterinarlar va dorixona ro'yxatdan o'tadi ----------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.vets (id, full_name, phone, region, district) values (auth.uid(), 'Vet Bir', '+998901110003', 'Samarqand viloyati', 'Urgut');
select pg_temp.expect_fail($$insert into public.vets (id, full_name, phone, region, district) values ('00000000-0000-0000-0000-0000000000a2','Soxta','+998900000000','Samarqand viloyati','Urgut')$$, 'row-level security');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.vets (id, full_name, phone, region, district) values (auth.uid(), 'Vet Ikki', '+998901110004', 'Samarqand viloyati', 'Urgut');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
insert into public.vets (id, full_name, phone, region, district) values (auth.uid(), 'Vet Uch', '+998901110005', 'Samarqand viloyati', 'Payariq');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
insert into public.pharmacies (id, name, phone, region, district, address) values (auth.uid(), 'Agrovet', '+998901110006', 'Samarqand viloyati', 'Urgut', 'Bozor yonida');
select public.save_stock('[{"drug_id":"oks","qty":5,"price":70000},{"drug_id":"mel","qty":1,"price":110000},{"drug_id":"yoq_dori","qty":3,"price":1}]');
select pg_temp.check((select count(*) from public.pharmacy_stock) = 2, 'save_stock: noma''lum dori e''tiborsiz qoldirildi, 2 qator');
select pg_temp.check((select count(*) from public.vets) = 3, 'veterinarlar ro''yxatini hamma ko''radi');

-- ---------------- Chorvador ariza yuboradi ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
update public.profiles set full_name = 'Ali', role = 'farmer' where id = auth.uid();
select pg_temp.check((select full_name from public.profiles where id = auth.uid()) = 'Ali', 'profil o''zgartirildi');
select pg_temp.check((select count(*) from public.profiles) = 1, 'boshqalarning profili ko''rinmaydi');
insert into public.cases (id, farmer_id, region, district, animal, symptoms, contact_name, phone)
values ('11111111-0000-0000-0000-000000000001', auth.uid(), 'Samarqand viloyati', 'Urgut', 'sigir', '{Isitma}', 'Ali', '+998901110001');
select pg_temp.expect_fail($$insert into public.cases (farmer_id, region, district, animal, contact_name, phone, status) values (auth.uid(),'Samarqand viloyati','Urgut','sigir','Ali','+998901110001','done')$$, 'row-level security');
select pg_temp.expect_fail($$insert into public.cases (farmer_id, region, district, animal, contact_name, phone) values ('00000000-0000-0000-0000-0000000000f2','Samarqand viloyati','Urgut','sigir','X','+998901110001')$$, 'row-level security');
select pg_temp.expect_fail($$update public.cases set status = 'done'$$, 'permission denied');
reset role;
select pg_temp.check((select count(*) from net.calls) = 1, 'yangi ariza notify chaqiruvini navbatga qo''ydi (vault bor)');
set role authenticated;

-- ---------------- Kim nimani ko'radi ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(*) from public.cases) = 0, 'boshqa chorvador arizani ko''rmaydi');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check((select count(*) from public.cases) = 0, 'boshqa tuman veterinari ko''rmaydi');
select pg_temp.expect_fail($$select public.accept_case('11111111-0000-0000-0000-000000000001')$$, 'not_in_area');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check((select count(*) from public.cases) = 1, 'shu tuman veterinari V2 ko''radi');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) from public.cases) = 1, 'shu tuman veterinari V1 ko''radi');

-- ---------------- V1 qabul qiladi, V2 endi qabul qila olmaydi ----------------
select status from public.accept_case('11111111-0000-0000-0000-000000000001');
select pg_temp.check((select status from public.vets where id = auth.uid()) = 'busy', 'qabul qilgach V1 holati "band"');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_fail($$select public.accept_case('11111111-0000-0000-0000-000000000001')$$, 'already_taken');
select pg_temp.check((select count(*) from public.cases) = 0, 'qabul qilingan ariza V2 dan yashirildi');
select pg_temp.expect_fail($$insert into public.messages (case_id, sender_id, body) values ('11111111-0000-0000-0000-000000000001', auth.uid(), 'salom')$$, 'row-level security');

-- ---------------- Yozishma ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into public.messages (case_id, sender_id, body) values ('11111111-0000-0000-0000-000000000001', auth.uid(), 'Tezroq keling');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.messages (case_id, sender_id, body) values ('11111111-0000-0000-0000-000000000001', auth.uid(), 'Yo''ldaman');
select pg_temp.check((select count(*) from public.messages) = 2, 'vet ikkala xabarni ko''radi');
select pg_temp.expect_fail($$insert into public.messages (case_id, sender_id, body) values ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'soxta')$$, 'row-level security');

-- ---------------- Bosqichlar ----------------
select pg_temp.expect_fail($$select public.advance_case('11111111-0000-0000-0000-000000000001','arrived')$$, 'bad_transition');
select public.advance_case('11111111-0000-0000-0000-000000000001','on_way');
select public.advance_case('11111111-0000-0000-0000-000000000001','arrived');

-- ---------------- Retsept ----------------
select public.save_prescription('11111111-0000-0000-0000-000000000001',
  '[{"drug_id":"oks","dose":"1 ml / 10 kg"},{"drug_id":"mel","dose":"2.5 ml / 100 kg"}]', 'Suv ko''p bering');
select pg_temp.expect_fail($$select public.save_prescription('11111111-0000-0000-0000-000000000001','[{"drug_id":"yoq","dose":""}]','')$$, 'foreign key');
select pg_temp.check((select count(*) from public.prescription_items) = 2, 'retsept 2 qator (xato urinish o''zgartirmadi)');
select public.advance_case('11111111-0000-0000-0000-000000000001','done');
select pg_temp.check((select status from public.vets where id = auth.uid()) = 'online', 'yakunlagach V1 yana "bo''sh"');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_fail($$select public.save_prescription('11111111-0000-0000-0000-000000000001','[{"drug_id":"oks","dose":""}]','')$$, 'not_allowed');
select pg_temp.check((select count(*) from public.prescription_items) = 0, 'begona vet retseptni ko''rmaydi');

-- ---------------- Chorvador dori band qiladi ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check((select count(*) from public.prescription_items) = 2, 'chorvador retseptni ko''radi');
select pg_temp.check((select status from public.cases) = 'done', 'chorvador "yakunlandi" holatini ko''radi');
select pg_temp.expect_fail($$select public.create_reservation('00000000-0000-0000-0000-0000000000d1','[{"drug_id":"mel","qty":5}]','11111111-0000-0000-0000-000000000001')$$, 'insufficient_stock');
create temp table r as select public.create_reservation('00000000-0000-0000-0000-0000000000d1',
  '[{"drug_id":"oks","qty":2},{"drug_id":"mel","qty":1}]', '11111111-0000-0000-0000-000000000001') as id;
grant select on r to authenticated;
select pg_temp.check((select total from public.reservations) = 2*70000 + 110000, 'jami narx dorixona narxidan hisoblandi (250 000)');
select pg_temp.check((select contact_name from public.reservations) = 'Ali', 'buyurtmaga chorvador ismi yozildi');
select pg_temp.expect_fail($$select public.set_reservation_status((select id from r),'done')$$, 'bad_transition');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(*) from public.reservations) = 0, 'boshqa chorvador buyurtmani ko''rmaydi');

-- ---------------- Dorixona buyurtmani bajaradi ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select count(*) from public.reservation_items) = 2, 'dorixona buyurtma qatorlarini ko''radi');
select public.set_reservation_status((select id from r), 'ready');
select public.set_reservation_status((select id from r), 'done');
select pg_temp.check((select qty from public.pharmacy_stock where drug_id = 'oks') = 3, 'qoldiq: oks 5 → 3');
select pg_temp.check((select qty from public.pharmacy_stock where drug_id = 'mel') = 0, 'qoldiq: mel 1 → 0');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
update public.pharmacy_stock set qty = 99;
select pg_temp.check((select qty from public.pharmacy_stock where drug_id = 'oks') = 3, 'chorvador dorixona qoldig''ini o''zgartira olmaydi');

-- ---------------- Rad etish, qayta yuborish, bekor qilish ----------------
insert into public.cases (id, farmer_id, vet_id, region, district, animal, contact_name, phone, kind, photo_path)
values ('11111111-0000-0000-0000-000000000002', auth.uid(), '00000000-0000-0000-0000-0000000000a3',
        'Samarqand viloyati', 'Urgut', 'qoy', 'Ali', '+998901110001', 'video',
        '00000000-0000-0000-0000-0000000000f1/qoy.jpg');
insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-0000000000f1/qoy.jpg');
select pg_temp.expect_fail($$insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-0000000000f2/x.jpg')$$, 'row-level security');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) from public.cases where id = '11111111-0000-0000-0000-000000000002') = 0, 'boshqa vetga biriktirilgan ariza V1 ga ko''rinmaydi');
select pg_temp.check((select count(*) from storage.objects) = 0, 'V1 begona arizaning rasmini ko''rmaydi');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check((select count(*) from storage.objects) = 1, 'biriktirilgan vet V3 ariza rasmini ko''radi');
select public.decline_case('11111111-0000-0000-0000-000000000002');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check((select status from public.cases where id = '11111111-0000-0000-0000-000000000002') = 'declined', 'chorvador "rad etildi"ni ko''radi');
select public.resend_case('11111111-0000-0000-0000-000000000002');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check((select count(*) from public.cases) = 1, 'qayta yuborilgach Urgut veti V2 ko''radi');
select pg_temp.check((select count(*) from storage.objects) = 1, 'ochiq arizaning rasmini tuman veti ko''radi');
select public.decline_case('11111111-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from public.cases) = 0, 'V2 rad etgach unga yashirildi');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check((select count(*) from public.cases where id = '11111111-0000-0000-0000-000000000002') = 0, 'oldin rad etgan V3 ga ham yashirin');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) from public.cases where id = '11111111-0000-0000-0000-000000000002') = 1, 'V1 hali ko''radi');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect_fail($$select public.cancel_case('11111111-0000-0000-0000-000000000002')$$, 'not_allowed');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select public.cancel_case('11111111-0000-0000-0000-000000000002');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) from public.cases where id = '11111111-0000-0000-0000-000000000002') = 0, 'bekor qilingan ariza vetlardan yo''qoldi');

-- ---------------- Mehmon (tizimga kirmagan) ----------------
reset role;
set role anon;
select pg_temp.as_user('');
select pg_temp.check((select count(*) from public.cases) = 0 and (select count(*) from public.vets) = 0, 'mehmon arizalar va vetlarni ko''rmaydi');
select pg_temp.check((select count(*) from public.drugs) = 20, 'mehmon dorilar ro''yxatini ko''radi');
select pg_temp.expect_fail($$select public.accept_case('11111111-0000-0000-0000-000000000001')$$, 'permission denied');
reset role;
select pg_temp.check((select count(*) from net.calls) >= 8, 'bildirishnomalar navbatga qo''yildi: ' || (select count(*) from net.calls));
select pg_temp.check((select count(*) from net.calls where body->>'table' = 'reservations') = 3, 'buyurtma: yaratildi, tayyor, berildi = 3 ta');
\echo 'BARCHA TESTLAR O''TDI'
