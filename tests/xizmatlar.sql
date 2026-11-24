-- Yangi xizmatlar testi: urug'lantirish, homiladorlik, qirqim, qassob, hayvon kartasi, dori talabi.
-- scenario.sql dan KEYIN ishga tushiriladi (o'sha foydalanuvchilar va dorilar ishlatiladi).
\set ON_ERROR_STOP on
\set QUIET on

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

reset role;
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-0000000000b1', '998901120001'),  -- chorvador (Oltinsoy)
 ('00000000-0000-0000-0000-0000000000b2', '998901120002'),  -- vet: faqat davolash (Oltinsoy)
 ('00000000-0000-0000-0000-0000000000b3', '998901120003'),  -- vet: urug'lantirish + homiladorlik, UZI bor (Oltinsoy)
 ('00000000-0000-0000-0000-0000000000b4', '998901120004'),  -- usta: qirqim + qassob (Oltinsoy)
 ('00000000-0000-0000-0000-0000000000b5', '998901120005'),  -- dorixona (Oltinsoy)
 ('00000000-0000-0000-0000-0000000000b6', '998901120006');  -- boshqa chorvador

set role authenticated;
-- ---------------- Mutaxassislar ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
insert into public.vets (id, full_name, phone, region, district) values (auth.uid(), 'Davo Vet', '+998901120002', 'Surxondaryo viloyati', 'Oltinsoy');
select pg_temp.check((select services from public.vets where id = auth.uid()) = '{treatment}', 'yangi vet standart holatda faqat davolash xizmatini oladi');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
insert into public.vets (id, full_name, phone, region, district, services, has_ultrasound)
values (auth.uid(), 'Urug Vet', '+998901120003', 'Surxondaryo viloyati', 'Oltinsoy', '{insemination,pregnancy}', true);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
update public.profiles set role = 'master', full_name = 'Usta' where id = auth.uid();
select pg_temp.check((select role from public.profiles where id = auth.uid()) = 'master', 'usta roli saqlanadi');
select pg_temp.expect_fail($$insert into public.vets (id, full_name, phone, region, district, kind, services) values (auth.uid(),'Usta','+998901120004','Surxondaryo viloyati','Oltinsoy','master','{treatment}')$$, 'vets_master_services_check');
select pg_temp.expect_fail($$insert into public.vets (id, full_name, phone, region, district, kind, services) values (auth.uid(),'Usta','+998901120004','Surxondaryo viloyati','Oltinsoy','master','{shearing,uchish}')$$, 'vets_services_check');
insert into public.vets (id, full_name, phone, region, district, kind, services, price_note)
values (auth.uid(), 'Usta Qirquvchi', '+998901120004', 'Surxondaryo viloyati', 'Oltinsoy', 'master', '{shearing,butcher}', 'Qirqim: bosh boshiga');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b5');
insert into public.pharmacies (id, name, phone, region, district, address) values (auth.uid(), 'Oltinsoy Vet', '+998901120005', 'Surxondaryo viloyati', 'Oltinsoy', 'Markaz');

-- ---------------- Hayvon kartasi ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.animals (id, species, name, tag, breed) values ('22222222-0000-0000-0000-000000000001', 'sigir', 'Oqbosh', 'UZ-001', 'Golshtin');
insert into public.animal_events (animal_id, farmer_id, type, event_date) values ('22222222-0000-0000-0000-000000000001', auth.uid(), 'heat', current_date);
select pg_temp.check((select farmer_id from public.animals where id = '22222222-0000-0000-0000-000000000001') = auth.uid(), 'hayvon egasi avtomatik qo''yiladi');
select pg_temp.expect_fail($$insert into public.animal_events (animal_id, farmer_id, type, case_id) values ('22222222-0000-0000-0000-000000000001', auth.uid(), 'insemination', '11111111-0000-0000-0000-000000000001')$$, 'row-level security');
select pg_temp.expect_fail($$update public.animal_events set type = 'birth'$$, 'permission denied');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
select pg_temp.check((select count(*) from public.animals) = 0, 'boshqa chorvadorning hayvoni ko''rinmaydi');
select pg_temp.check((select count(*) from public.animal_events) = 0, 'boshqa chorvadorning hayvon tarixi ko''rinmaydi');
select pg_temp.expect_fail($$insert into public.animal_events (animal_id, farmer_id, type) values ('22222222-0000-0000-0000-000000000001', auth.uid(), 'heat')$$, 'row-level security');
-- boshqaning hayvonini arizaga bog'lab bo'lmaydi
select pg_temp.expect_fail($$insert into public.cases (farmer_id, region, district, animal, contact_name, phone, service, animal_id) values (auth.uid(),'Surxondaryo viloyati','Oltinsoy','sigir','X','+998901120006','insemination','22222222-0000-0000-0000-000000000001')$$, 'row-level security');

-- ---------------- Urug'lantirish arizasi ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.cases (id, farmer_id, region, district, animal, contact_name, phone, service, animal_id, details)
values ('33333333-0000-0000-0000-000000000001', auth.uid(), 'Surxondaryo viloyati', 'Oltinsoy', 'sigir', 'Bek', '+998901120001',
        'insemination', '22222222-0000-0000-0000-000000000001', '{"heat_signs":["Sakrash"],"heat_at":"2026-11-25T07:00"}');
select pg_temp.expect_fail($$insert into public.cases (farmer_id, region, district, animal, contact_name, phone, service, kind) values (auth.uid(),'Surxondaryo viloyati','Oltinsoy','qoy','Bek','+998901120001','shearing','video')$$, 'cases_service_kind_check');
select pg_temp.expect_fail($$insert into public.cases (farmer_id, region, district, animal, contact_name, phone, service, vet_id) values (auth.uid(),'Surxondaryo viloyati','Oltinsoy','sigir','Bek','+998901120001','insemination','00000000-0000-0000-0000-0000000000b2')$$, 'row-level security');
select pg_temp.expect_fail($$insert into public.cases (farmer_id, region, district, animal, contact_name, phone, service, result) values (auth.uid(),'Surxondaryo viloyati','Oltinsoy','sigir','Bek','+998901120001','insemination','{"x":1}')$$, 'row-level security');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((select count(*) from public.cases where id = '33333333-0000-0000-0000-000000000001') = 0, 'faqat davolovchi vet urug''lantirish arizasini ko''rmaydi');
select pg_temp.expect_fail($$select public.accept_case('33333333-0000-0000-0000-000000000001')$$, 'not_in_area');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
select pg_temp.check((select count(*) from public.cases where id = '33333333-0000-0000-0000-000000000001') = 0, 'usta (qirqim/qassob) urug''lantirish arizasini ko''rmaydi');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select pg_temp.check((select count(*) from public.cases where id = '33333333-0000-0000-0000-000000000001') = 1, 'urug''lantiruvchi vet arizani ko''radi');
select pg_temp.check((select count(*) from public.animals) = 0, 'qabul qilinmaguncha hayvon kartasi mutaxassisga ko''rinmaydi');
select pg_temp.expect_fail($$select public.save_service_result('33333333-0000-0000-0000-000000000001', '{}')$$, 'not_allowed');
select 1 from public.accept_case('33333333-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from public.animals) = 1, 'qabul qilgach mutaxassis hayvon kartasini ko''radi');
select pg_temp.check((select count(*) from public.animal_events) = 1, 'mutaxassis hayvon tarixini (kuyikish) ko''radi');
select pg_temp.expect_fail($$select public.save_service_result('33333333-0000-0000-0000-000000000001', '{"date":"bugun"}')$$, 'bad_result');
select pg_temp.expect_fail($$select public.save_service_result('33333333-0000-0000-0000-000000000001', '{"date":"2020-01-01"}')$$, 'bad_result');
select 1 from public.save_service_result('33333333-0000-0000-0000-000000000001', jsonb_build_object('date', current_date, 'bull_breed', 'Golshtin', 'batch', 'A-17', 'note', 'Yaxshi o''tdi'));
select 1 from public.save_service_result('33333333-0000-0000-0000-000000000001', jsonb_build_object('date', current_date, 'bull_breed', 'Golshtin', 'batch', 'A-18'));
select pg_temp.check((select count(*) from public.animal_events where type = 'insemination') = 1, 'natija qayta saqlanganda tarixda bitta yozuv qoladi');
select pg_temp.check((select details->>'batch' from public.animal_events where type = 'insemination') = 'A-18', 'oxirgi natija saqlandi');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select result->>'bull_breed' from public.cases where id = '33333333-0000-0000-0000-000000000001') = 'Golshtin', 'chorvador natijani ko''radi');
select pg_temp.check((select count(*) from public.animal_events where animal_id = '22222222-0000-0000-0000-000000000001') = 2, 'chorvador tarixida kuyikish va urug''lantirish bor');
delete from public.animal_events where type = 'insemination';
select pg_temp.check((select count(*) from public.animal_events where type = 'insemination') = 1, 'chorvador mutaxassis yozgan natijani o''chira olmaydi');

-- ---------------- Homiladorlik tekshiruvi ----------------
insert into public.cases (id, farmer_id, region, district, animal, contact_name, phone, service, animal_id, details)
values ('33333333-0000-0000-0000-000000000002', auth.uid(), 'Surxondaryo viloyati', 'Oltinsoy', 'sigir', 'Bek', '+998901120001',
        'pregnancy', '22222222-0000-0000-0000-000000000001', '{"method_wish":"uzi"}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
select pg_temp.expect_fail($$select public.accept_case('33333333-0000-0000-0000-000000000002')$$, 'not_in_area');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select 1 from public.accept_case('33333333-0000-0000-0000-000000000002');
select pg_temp.expect_fail($$select public.save_service_result('33333333-0000-0000-0000-000000000002', '{"result":"balki"}')$$, 'bad_result');
select 1 from public.save_service_result('33333333-0000-0000-0000-000000000002', '{"result":"pregnant","method":"uzi","term_days":"45"}');
select pg_temp.check((select result from public.animal_events where type = 'pregnancy_check') = 'pregnant', 'homiladorlik natijasi tarixga yozildi');
select pg_temp.check((select (details->>'term_days')::int from public.animal_events where type = 'pregnancy_check') = 45, 'homiladorlik muddati saqlandi');

-- ---------------- Jun olish (qirqim) ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.cases (id, farmer_id, region, district, animal, animal_count, contact_name, phone, service, preferred_date)
values ('33333333-0000-0000-0000-000000000003', auth.uid(), 'Surxondaryo viloyati', 'Oltinsoy', 'qoy', 25, 'Bek', '+998901120001', 'shearing', current_date + 3);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select pg_temp.check((select count(*) from public.cases where id = '33333333-0000-0000-0000-000000000003') = 0, 'veterinar qirqim buyurtmasini ko''rmaydi');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
select pg_temp.check((select count(*) from public.cases where id = '33333333-0000-0000-0000-000000000003') = 1, 'usta qirqim buyurtmasini ko''radi');
select 1 from public.accept_case('33333333-0000-0000-0000-000000000003');
select 1 from public.advance_case('33333333-0000-0000-0000-000000000003', 'on_way');
select 1 from public.advance_case('33333333-0000-0000-0000-000000000003', 'arrived');
select 1 from public.save_service_result('33333333-0000-0000-0000-000000000003', '{"heads":"25","wool_kg":"62.5"}');
select 1 from public.advance_case('33333333-0000-0000-0000-000000000003', 'done');
select pg_temp.check((select (result->>'wool_kg')::numeric from public.cases where id = '33333333-0000-0000-0000-000000000003') = 62.5, 'qirqim natijasi (jun kg) saqlandi');
select pg_temp.check((select status from public.vets where id = auth.uid()) = 'online', 'usta ish tugagach yana bo''sh');

-- ---------------- Qassob ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.cases (id, farmer_id, region, district, animal, contact_name, phone, service, details)
values ('33333333-0000-0000-0000-000000000004', auth.uid(), 'Surxondaryo viloyati', 'Oltinsoy', 'qoy', 'Bek', '+998901120001', 'butcher', '{"tasks":["So''yish","Bo''laklash"],"inspection":true}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
select 1 from public.accept_case('33333333-0000-0000-0000-000000000004');
select 1 from public.save_service_result('33333333-0000-0000-0000-000000000004', '{"heads":1}');
select pg_temp.check((select (result->>'heads')::int from public.cases where id = '33333333-0000-0000-0000-000000000004') = 1, 'qassob natijasi saqlandi');

-- ---------------- Davolash: natija RPC'si ishlamaydi, eski oqim o'zgarmagan ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.cases (id, farmer_id, region, district, animal, symptoms, contact_name, phone)
values ('33333333-0000-0000-0000-000000000005', auth.uid(), 'Surxondaryo viloyati', 'Oltinsoy', 'sigir', '{Isitma}', 'Bek', '+998901120001');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select pg_temp.check((select count(*) from public.cases where id = '33333333-0000-0000-0000-000000000005') = 0, 'faqat urug''lantiruvchi vet davolash arizasini ko''rmaydi');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select 1 from public.accept_case('33333333-0000-0000-0000-000000000005');
select pg_temp.expect_fail($$select public.save_service_result('33333333-0000-0000-0000-000000000005', '{"heads":1}')$$, 'bad_service');
select 1 from public.save_prescription('33333333-0000-0000-0000-000000000005', '[{"drug_id":"oks","dose":"1 ml/10 kg"},{"drug_id":"mel","dose":""}]');

-- ---------------- Dori talabi ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b5');
select pg_temp.check((select count(*) from public.drug_demand(30)) = 2, 'dorixona tumandagi talabni ko''radi (2 xil dori)');
select pg_temp.check((select cases from public.drug_demand(30) where drug_id = 'oks') = 1, 'talab arizalar soni bo''yicha');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from public.drug_demand(30)) = 0, 'dorixona bo''lmagan foydalanuvchiga talab ko''rinmaydi');

-- ---------------- SI limiti faqat server uchun ----------------
select pg_temp.expect_fail($$select public.ai_take_quota(auth.uid(), 5)$$, 'permission denied');
select pg_temp.expect_fail($$select * from public.ai_usage$$, 'permission denied');
reset role;
grant usage on schema public to service_role; -- haqiqiy Supabase'da bor (test muhiti uchun)
set role service_role;
select pg_temp.check(public.ai_take_quota('00000000-0000-0000-0000-0000000000b1', 2), 'SI limiti: 1-so''rov');
select pg_temp.check(public.ai_take_quota('00000000-0000-0000-0000-0000000000b1', 2), 'SI limiti: 2-so''rov');
select pg_temp.check(not public.ai_take_quota('00000000-0000-0000-0000-0000000000b1', 2), 'SI limiti: 3-so''rov rad etiladi');
reset role;

select 'XIZMATLAR TESTLARI MUVAFFAQIYATLI';
