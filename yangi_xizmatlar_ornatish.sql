-- VETCHAQIRUV — YANGI XIZMATLAR (jun olish, qassob, sun'iy urug'lantirish, homiladorlik tekshiruvi,
-- hayvon kartasi, sun'iy intellekt limiti, dorixona uchun talab).
-- Supabase -> SQL Editor -> New query -> shu faylni to'liq qo'ying -> Run.
-- "vetchaqiruv_ornatish.sql" DAN KEYIN ishga tushiring. Qayta ishga tushirish xavfsiz (idempotent).

-- =====================================================================
-- VetChaqiruv — yangi xizmatlar
--  • sun'iy urug'lantirish, homiladorlikni tekshirish, jun olish (qirqim), qassob
--  • "usta" roli (urug'lantirish texnigi, jun qirquvchi, qassob)
--  • hayvon kartasi va uning tarixi (animals, animal_events)
--  • xizmat natijasini saqlash (save_service_result)
--  • dorixona uchun tumandagi dori talabi (drug_demand)
--  • sun'iy intellekt yordamchisi uchun kunlik limit (ai_usage)
--
-- Supabase SQL Editor'da asosiy sxemadan KEYIN ishga tushiriladi.
-- Qayta ishga tushirish xavfsiz: mavjud ma'lumotlar o'chmaydi.
-- Muhim: asosiy sxema (20261016000001_schema.sql) qayta ishga tushirilsa,
-- undan keyin shu faylni ham qayta ishga tushiring.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ROL: usta (veterinar bo'lmagan mutaxassis)
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('farmer','vet','pharmacy','master'));

-- ---------------------------------------------------------------------
-- 2. MUTAXASSISLAR: qaysi xizmatlarni ko'rsatadi
--    Veterinarlar ham, ustalar ham "vets" jadvalida turadi (kind bilan ajratiladi),
--    shuning uchun ariza, qabul qilish, kuzatuv va xabarnomalar bir xil ishlaydi.
-- ---------------------------------------------------------------------
alter table public.vets add column if not exists kind           text    not null default 'vet';
alter table public.vets add column if not exists services       text[]  not null default '{treatment}';
alter table public.vets add column if not exists has_ultrasound boolean not null default false;
alter table public.vets add column if not exists price_note     text    not null default '';

alter table public.vets drop constraint if exists vets_kind_check;
alter table public.vets add constraint vets_kind_check check (kind in ('vet','master'));
alter table public.vets drop constraint if exists vets_services_check;
alter table public.vets add constraint vets_services_check check (
  cardinality(services) between 1 and 5
  and services <@ array['treatment','insemination','pregnancy','shearing','butcher']::text[]);
-- Davolash va homiladorlikni tekshirish faqat veterinar ishi
alter table public.vets drop constraint if exists vets_master_services_check;
alter table public.vets add constraint vets_master_services_check check (
  kind = 'vet' or not (services && array['treatment','pregnancy']::text[]));
alter table public.vets drop constraint if exists vets_price_note_check;
alter table public.vets add constraint vets_price_note_check check (char_length(price_note) <= 300);
create index if not exists vets_services_idx on public.vets using gin (services);

-- Mutaxassisligida "Sun'iy urug'lantirish" bo'lgan veterinarlar shu xizmatni avtomatik oladi
update public.vets set services = services || '{insemination}'::text[]
 where kind = 'vet' and 'Sun''iy urug''lantirish' = any (specs) and not ('insemination' = any (services));

-- ---------------------------------------------------------------------
-- 3. HAYVON KARTASI
-- ---------------------------------------------------------------------
create table if not exists public.animals (
  id          uuid primary key default gen_random_uuid(),
  farmer_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  species     text not null check (species in ('sigir','qoy','echki','ot','parranda','boshqa')),
  name        text not null default '' check (char_length(name) <= 60),
  tag         text not null default '' check (char_length(tag) <= 40),   -- sirg'a / identifikatsiya raqami
  breed       text not null default '' check (char_length(breed) <= 60),
  sex         text not null default 'f' check (sex in ('f','m')),
  birth_year  int  check (birth_year between 1990 and 2100),
  note        text not null default '' check (char_length(note) <= 500),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists animals_farmer_idx on public.animals (farmer_id, created_at desc);
drop trigger if exists animals_touch on public.animals;
create trigger animals_touch before update on public.animals for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. ARIZALAR: xizmat turi, hayvon, qulay sana, xizmatga xos ma'lumot, natija
-- ---------------------------------------------------------------------
alter table public.cases add column if not exists service        text  not null default 'treatment';
alter table public.cases add column if not exists animal_id      uuid  references public.animals(id) on delete set null;
alter table public.cases add column if not exists preferred_date date;
alter table public.cases add column if not exists details        jsonb not null default '{}'::jsonb;
alter table public.cases add column if not exists result         jsonb;
alter table public.cases add column if not exists result_at      timestamptz;

alter table public.cases drop constraint if exists cases_service_check;
alter table public.cases add constraint cases_service_check
  check (service in ('treatment','insemination','pregnancy','shearing','butcher'));
-- Video maslahat faqat davolash uchun; qolgan xizmatlarda mutaxassis fermaga keladi
alter table public.cases drop constraint if exists cases_service_kind_check;
alter table public.cases add constraint cases_service_kind_check check (kind = 'call' or service = 'treatment');
alter table public.cases drop constraint if exists cases_details_check;
alter table public.cases add constraint cases_details_check
  check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4000);
create index if not exists cases_animal_idx on public.cases (animal_id) where animal_id is not null;

-- ---------------------------------------------------------------------
-- 5. HAYVON TARIXI (kuyikish, urug'lantirish, homiladorlik, tug'ish, emlash...)
-- ---------------------------------------------------------------------
create table if not exists public.animal_events (
  id          bigint generated always as identity primary key,
  animal_id   uuid not null references public.animals(id) on delete cascade,
  farmer_id   uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('heat','insemination','pregnancy_check','birth','vaccination',
                                            'treatment','shearing','slaughter','note')),
  event_date  date not null default current_date,
  result      text check (result is null or result in ('pregnant','open','recheck')),
  details     jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 2000),
  note        text not null default '' check (char_length(note) <= 500),
  case_id     uuid references public.cases(id) on delete set null,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists animal_events_animal_idx on public.animal_events (animal_id, event_date desc, id desc);
create index if not exists animal_events_case_idx on public.animal_events (case_id) where case_id is not null;

-- ---------------------------------------------------------------------
-- 6. KIM NIMANI KO'RADI
-- ---------------------------------------------------------------------
-- Mutaxassis shu tumanda ishlaydi va shu xizmatni ko'rsatadimi?
create or replace function public.is_provider_for(p_region text, p_district text, p_service text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vets v
    where v.id = auth.uid() and v.region = p_region and v.district = p_district
      and coalesce(p_service, 'treatment') = any (v.services)
  );
$$;

create or replace function public.can_see_case(p_case uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cases c
    where c.id = p_case and (
      c.farmer_id = auth.uid() or c.vet_id = auth.uid()
      or (c.status = 'new' and c.vet_id is null
          and not (auth.uid() = any (c.declined_by))
          and public.is_provider_for(c.region, c.district, c.service))
    )
  );
$$;

-- Ochiq ariza faqat shu xizmatni ko'rsatadigan mutaxassislarga ko'rinadi
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases for select to authenticated using (
  farmer_id = auth.uid()
  or vet_id = auth.uid()
  or (status = 'new' and vet_id is null
      and not (auth.uid() = any (declined_by))
      and public.is_provider_for(region, district, service))
);

drop policy if exists cases_insert on public.cases;
create policy cases_insert on public.cases for insert to authenticated with check (
  farmer_id = auth.uid()
  and status = 'new'
  and declined_by = '{}'
  and accepted_at is null and done_at is null
  and rx_at is null and rx_note = ''
  and result is null and result_at is null
  and (vet_id is null or exists (select 1 from public.vets v where v.id = vet_id and service = any (v.services)))
  and (animal_id is null or exists (select 1 from public.animals a where a.id = animal_id and a.farmer_id = auth.uid()))
);

alter table public.animals       enable row level security;
alter table public.animal_events enable row level security;

drop policy if exists animals_owner on public.animals;
create policy animals_owner on public.animals for all to authenticated
  using (farmer_id = auth.uid()) with check (farmer_id = auth.uid());
-- Mutaxassis o'ziga biriktirilgan arizadagi hayvonni ko'radi
drop policy if exists animals_provider_select on public.animals;
create policy animals_provider_select on public.animals for select to authenticated
  using (exists (select 1 from public.cases c where c.animal_id = animals.id and c.vet_id = auth.uid()));

drop policy if exists animal_events_owner_select on public.animal_events;
create policy animal_events_owner_select on public.animal_events for select to authenticated
  using (farmer_id = auth.uid());
drop policy if exists animal_events_provider_select on public.animal_events;
create policy animal_events_provider_select on public.animal_events for select to authenticated
  using (exists (select 1 from public.cases c where c.animal_id = animal_events.animal_id and c.vet_id = auth.uid()));
-- Chorvador o'zi kuzatgan voqeani yozadi (kuyikish, tug'ish, emlash...). Arizaga bog'liq yozuvlar faqat RPC orqali.
drop policy if exists animal_events_owner_insert on public.animal_events;
create policy animal_events_owner_insert on public.animal_events for insert to authenticated with check (
  farmer_id = auth.uid() and created_by = auth.uid() and case_id is null
  and exists (select 1 from public.animals a where a.id = animal_id and a.farmer_id = auth.uid())
);
drop policy if exists animal_events_owner_delete on public.animal_events;
create policy animal_events_owner_delete on public.animal_events for delete to authenticated
  using (farmer_id = auth.uid() and case_id is null);

revoke insert, update, delete on public.animals, public.animal_events from anon;
revoke update on public.animal_events from authenticated;

-- ---------------------------------------------------------------------
-- 7. QABUL QILISH VA RAD ETISH — xizmat turini hisobga oladi
-- ---------------------------------------------------------------------
create or replace function public.accept_case(p_case uuid)
returns public.cases language plpgsql security definer set search_path = public as $$
declare c public.cases;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.vets where id = auth.uid()) then raise exception 'not_a_vet'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'case_not_found'; end if;
  if c.status <> 'new' or (c.vet_id is not null and c.vet_id <> auth.uid()) then
    raise exception 'already_taken';
  end if;
  if c.vet_id is null and not public.is_provider_for(c.region, c.district, c.service) then
    raise exception 'not_in_area';
  end if;
  update public.cases
     set vet_id = auth.uid(), status = 'accepted', accepted_at = now(), updated_at = now()
   where id = p_case
  returning * into c;
  update public.vets set status = 'busy' where id = auth.uid() and status = 'online';
  return c;
end $$;

create or replace function public.decline_case(p_case uuid)
returns public.cases language plpgsql security definer set search_path = public as $$
declare c public.cases;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'case_not_found'; end if;
  if c.vet_id = auth.uid() and c.status in ('new','accepted') then
    update public.cases set status = 'declined', declined_at = now(),
           declined_by = array_append(declined_by, auth.uid()), updated_at = now()
     where id = p_case returning * into c;
  elsif c.vet_id is null and c.status = 'new' and public.is_provider_for(c.region, c.district, c.service) then
    update public.cases set declined_by = array_append(declined_by, auth.uid()), updated_at = now()
     where id = p_case returning * into c;
  else
    raise exception 'not_allowed';
  end if;
  return c;
end $$;

-- ---------------------------------------------------------------------
-- 8. XIZMAT NATIJASI (mutaxassis kiritadi). Hayvon kartasi bo'lsa — tarixga ham yoziladi.
--  insemination: {"date":"2026-11-25","bull_breed":"Golshtin","batch":"A-17","note":""}
--  pregnancy:    {"date":"…","result":"pregnant|open|recheck","method":"uzi|rektal","term_days":45,"note":""}
--  shearing:     {"date":"…","heads":25,"wool_kg":60.5,"note":""}
--  butcher:      {"date":"…","heads":1,"note":""}
-- ---------------------------------------------------------------------
create or replace function public.save_service_result(p_case uuid, p_result jsonb)
returns public.cases language plpgsql security definer set search_path = public as $$
declare
  c public.cases; r jsonb; ev_type text; ev_result text; ev_date date; v_note text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found or c.vet_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if c.status not in ('accepted','on_way','arrived','done') then raise exception 'bad_transition'; end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' then raise exception 'bad_result'; end if;
  begin
    ev_date := coalesce(nullif(p_result->>'date', '')::date, current_date);
  exception when others then
    raise exception 'bad_result';
  end;
  if ev_date > current_date + 1 or ev_date < current_date - 400 then raise exception 'bad_result'; end if;
  v_note := left(coalesce(p_result->>'note', ''), 500);

  case c.service
    when 'insemination' then
      ev_type := 'insemination';
      r := jsonb_build_object('bull_breed', left(coalesce(p_result->>'bull_breed', ''), 60),
                              'batch',      left(coalesce(p_result->>'batch', ''), 60));
    when 'pregnancy' then
      ev_type := 'pregnancy_check';
      ev_result := p_result->>'result';
      if ev_result is null or ev_result not in ('pregnant','open','recheck') then raise exception 'bad_result'; end if;
      r := jsonb_build_object(
        'method',    case when p_result->>'method' in ('uzi','rektal') then p_result->>'method' else '' end,
        'term_days', case when (p_result->>'term_days') ~ '^[0-9]{1,3}$' then (p_result->>'term_days')::int end);
    when 'shearing' then
      ev_type := 'shearing';
      r := jsonb_build_object(
        'heads',   case when (p_result->>'heads') ~ '^[0-9]{1,5}$' then (p_result->>'heads')::int end,
        'wool_kg', case when (p_result->>'wool_kg') ~ '^[0-9]{1,6}([.][0-9]{1,2})?$' then (p_result->>'wool_kg')::numeric end);
    when 'butcher' then
      ev_type := 'slaughter';
      r := jsonb_build_object(
        'heads', case when (p_result->>'heads') ~ '^[0-9]{1,5}$' then (p_result->>'heads')::int end);
    else
      raise exception 'bad_service';
  end case;

  update public.cases
     set result = r || jsonb_build_object('date', ev_date, 'result', ev_result, 'note', v_note),
         result_at = now(), updated_at = now()
   where id = p_case returning * into c;

  if c.animal_id is not null then
    delete from public.animal_events where case_id = p_case;
    insert into public.animal_events (animal_id, farmer_id, type, event_date, result, details, note, case_id, created_by)
    values (c.animal_id, c.farmer_id, ev_type, ev_date, ev_result, r, v_note, p_case, auth.uid());
  end if;
  return c;
end $$;

-- ---------------------------------------------------------------------
-- 9. DORI TALABI: dorixona o'z tumanidagi retseptlarda qaysi dorilar ko'p yozilayotganini ko'radi
--    (faqat umumiy son, chorvador va ariza ma'lumotlari ko'rinmaydi)
-- ---------------------------------------------------------------------
create or replace function public.drug_demand(p_days int default 30)
returns table (drug_id text, cases int)
language sql stable security definer set search_path = public as $$
  select pi.drug_id, count(distinct pi.case_id)::int as cases
    from public.pharmacies p
    join public.cases c on c.region = p.region and c.district = p.district
    join public.prescription_items pi on pi.case_id = c.id
   where p.id = auth.uid()
     and c.rx_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
   group by pi.drug_id
   order by 2 desc, 1
   limit 20;
$$;

-- ---------------------------------------------------------------------
-- 10. SUN'IY INTELLEKT YORDAMCHISI: foydalanuvchiga kunlik so'rov limiti
--     Jadvalga faqat server funksiyasi (service_role) kiradi.
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null default current_date,
  calls    int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.ai_take_quota(p_user uuid, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.ai_usage (user_id, day, calls) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
  returning calls into n;
  return n <= p_limit;
end $$;

-- ---------------------------------------------------------------------
-- 11. HUQUQLAR
-- ---------------------------------------------------------------------
revoke execute on function public.save_service_result(uuid, jsonb), public.drug_demand(int) from public, anon;
grant  execute on function public.save_service_result(uuid, jsonb), public.drug_demand(int) to authenticated;
revoke execute on function public.ai_take_quota(uuid, int) from public, anon, authenticated;
grant  execute on function public.ai_take_quota(uuid, int) to service_role;

-- Jonli yangilanishlar
do $$
declare t text;
begin
  foreach t in array array['animals','animal_events'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
