-- =====================================================================
-- VetChaqiruv — yangi xizmatlar
--   • Ustalar: jun oluvchi, qassob, sun'iy urug'lantiruvchi, homiladorlikni tekshiruvchi
--   • Xizmat buyurtmalari (veterinar arizasi kabi: tumandagi ustalarga boradi)
--   • Chorva sotish: chorvador e'lon beradi, qassoblar narx taklif qiladi
--   • Hayvon taqvimi: urug'lantirish sanasi, tekshiruv va tug'ish eslatmalari (botga keladi)
--   • AI maslahatchi suhbatlari
-- Asosiy sxemadan (vetchaqiruv_ornatish.sql) KEYIN ishga tushiriladi. Qayta ishga tushirish xavfsiz.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. YANGI ROL: usta
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('farmer','vet','pharmacy','master'));

-- Xizmat turlari: jun | qassob | urug | homila
create or replace function public.service_ok(s text)
returns boolean language sql immutable as $$ select s in ('jun','qassob','urug','homila') $$;

-- Bo'g'ozlik muddati (kun)
create or replace function public.gestation_days(p_kind text)
returns int language sql immutable as $$
  select case p_kind when 'sigir' then 283 when 'qoy' then 150 when 'echki' then 150 when 'ot' then 340 else 283 end
$$;

create or replace function public.today_tashkent()
returns date language sql stable as $$ select (now() at time zone 'Asia/Tashkent')::date $$;

-- ---------------------------------------------------------------------
-- 1. USTALAR
-- ---------------------------------------------------------------------
create table if not exists public.masters (
  id          uuid primary key references public.profiles(id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 2 and 120),
  phone       text not null check (char_length(phone) between 9 and 32),
  region      text not null,
  district    text not null,
  village     text not null default '' check (char_length(village) <= 160),
  services    text[] not null check (cardinality(services) between 1 and 4
                and services <@ array['jun','qassob','urug','homila']::text[]),
  experience  int  not null default 0 check (experience between 0 and 70),
  about       text not null default '' check (char_length(about) <= 500),
  status      text not null default 'online' check (status in ('online','busy','offline')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists masters_area_idx on public.masters (region, district);

create or replace function public.is_master_for(p_service text, p_region text, p_district text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.masters m
    where m.id = auth.uid() and m.region = p_region and m.district = p_district and p_service = any (m.services)
  );
$$;

-- Qassob o'z viloyatidagi e'lonlarni ko'radi (qassoblar tumanlar orasida ham yuradi)
create or replace function public.is_buyer_in_region(p_region text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.masters m where m.id = auth.uid() and m.region = p_region and 'qassob' = any (m.services)
  );
$$;

-- ---------------------------------------------------------------------
-- 2. HAYVON TAQVIMI
-- ---------------------------------------------------------------------
create table if not exists public.animals (
  id          uuid primary key default gen_random_uuid(),
  farmer_id   uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('sigir','qoy','echki','ot')),
  name        text not null check (char_length(name) between 1 and 60),  -- laqabi yoki sirg'a raqami
  tag         text not null default '' check (char_length(tag) <= 40),
  birth_date  date,
  note        text not null default '' check (char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists animals_farmer_idx on public.animals (farmer_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3. XIZMAT BUYURTMALARI (veterinar arizasiga o'xshash)
-- ---------------------------------------------------------------------
create table if not exists public.service_orders (
  id             uuid primary key default gen_random_uuid(),
  farmer_id      uuid not null references public.profiles(id) on delete cascade,
  master_id      uuid references public.masters(id) on delete set null,
  service        text not null check (public.service_ok(service)),
  region         text not null,
  district       text not null,
  village        text not null default '' check (char_length(village) <= 160),
  animal         text not null check (animal in ('sigir','buqa','qoy','echki','ot','boshqa')),
  animal_count   int  not null default 1 check (animal_count between 1 and 10000),
  animal_id      uuid references public.animals(id) on delete set null,
  preferred_date date,
  note           text not null default '' check (char_length(note) <= 1000),
  contact_name   text not null check (char_length(contact_name) between 1 and 120),
  phone          text not null check (char_length(phone) between 9 and 32),
  lat            double precision,
  lng            double precision,
  status         text not null default 'new'
                 check (status in ('new','accepted','on_way','done','declined','cancelled')),
  declined_by    uuid[] not null default '{}',
  result         text not null default '' check (char_length(result) <= 500),
  pregnant       boolean,          -- homiladorlik tekshiruvi natijasi
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  on_way_at      timestamptz,
  done_at        timestamptz,
  declined_at    timestamptz,
  cancelled_at   timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists orders_farmer_idx on public.service_orders (farmer_id, created_at desc);
create index if not exists orders_master_idx on public.service_orders (master_id, created_at desc);
create index if not exists orders_pool_idx   on public.service_orders (region, district, service, status) where master_id is null;

-- ---------------------------------------------------------------------
-- 4. URUG'LANTIRISH YOZUVLARI VA ESLATMALAR
-- ---------------------------------------------------------------------
create table if not exists public.breedings (
  id           uuid primary key default gen_random_uuid(),
  animal_id    uuid not null references public.animals(id) on delete cascade,
  farmer_id    uuid not null references public.profiles(id) on delete cascade,
  bred_on      date not null,
  method       text not null default 'suniy' check (method in ('suniy','tabiiy')),
  sire         text not null default '' check (char_length(sire) <= 120),   -- buqa / urug' zoti, raqami
  pregnant     boolean,                                                     -- null = hali tekshirilmagan
  checked_on   date,
  birth_on     date,                                                        -- haqiqiy tug'ilgan kun
  outcome_note text not null default '' check (char_length(outcome_note) <= 300),
  order_id     uuid references public.service_orders(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (birth_on is null or birth_on >= bred_on),
  check (checked_on is null or checked_on >= bred_on)
);
create index if not exists breedings_animal_idx on public.breedings (animal_id, bred_on desc);

create table if not exists public.reminders (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  breeding_id  uuid references public.breedings(id) on delete cascade,
  kind         text not null,            -- kuyikish | tekshiruv | quruq | tugish7 | tugish
  due_on       date not null,
  title        text not null,
  body         text not null default '',
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders (due_on) where sent_at is null;
create index if not exists reminders_user_idx on public.reminders (user_id, due_on);

-- Urug'lantirish yozuvi o'zgarganda eslatmalarni qayta tuzadi (yuborilganlariga tegmaydi).
-- Muddatlar umumiy tavsiya: aniq sanani veterinar bilan kelishish kerak.
create or replace function public.breeding_reminders()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a public.animals;
  nm text;
  due_birth date;
  heat int; chk int;
  today date := public.today_tashkent();
begin
  delete from public.reminders where breeding_id = new.id and sent_at is null;
  if new.birth_on is not null or new.pregnant is false then return new; end if;

  select * into a from public.animals where id = new.animal_id;
  nm := a.name || ' (' || case a.kind when 'sigir' then 'sigir' when 'qoy' then 'qo''y' when 'echki' then 'echki' else 'ot' end || ')';
  due_birth := new.bred_on + public.gestation_days(a.kind);
  heat := case a.kind when 'qoy' then 15 else 19 end;           -- jinsiy sikl: qo'y ~17, boshqalar ~21 kun
  chk  := case a.kind when 'sigir' then 45 when 'ot' then 30 else 40 end;

  insert into public.reminders (user_id, breeding_id, kind, due_on, title, body)
  select new.farmer_id, new.id, x.kind, x.due, x.title, x.body
  from (values
    ('kuyikish', new.bred_on + heat,
      nm || ': kuyikishni kuzating',
      'Urug''lantirilganiga ' || heat || ' kun bo''ldi. Keyingi 3–5 kunda qayta kuyikish belgilari (bezovtalik, shilliq ajralma) bo''lsa, urug''lantirish o''tmagan. Unda mutaxassisni qayta chaqiring.'),
    ('tekshiruv', new.bred_on + chk,
      nm || ': homiladorlikni tekshirish vaqti',
      'Urug''lantirilganiga ' || chk || ' kun bo''ldi. Bo''g''ozlikni aniqlash uchun mutaxassis chaqiring. Ilovada «Homiladorlikni tekshirish» xizmatini buyurtma qilishingiz mumkin.'),
    ('quruq', due_birth - 60,
      nm || ': sog''ishni to''xtatish vaqti',
      'Taxminiy tug''ishga 60 kun qoldi (' || to_char(due_birth, 'DD.MM.YYYY') || '). Sigirni quruq davrga o''tkazing, ozuqasini veterinar bilan kelishing.'),
    ('tugish7', due_birth - 7,
      nm || ': tug''ishga bir hafta qoldi',
      'Taxminiy tug''ish kuni: ' || to_char(due_birth, 'DD.MM.YYYY') || '. Toza, quruq joy tayyorlang, veterinar telefonini yoningizda saqlang.'),
    ('tugish', due_birth,
      nm || ': taxminiy tug''ish kuni',
      'Bugun taxminiy tug''ish kuni. Tug''ruq qiyin kechsa, darhol veterinar chaqiring. Tug''ilgach, ilovada sanani belgilang.')
  ) as x(kind, due, title, body)
  where x.due >= today
    and (x.kind <> 'quruq' or a.kind = 'sigir')
    and (new.pregnant is null or x.kind not in ('kuyikish','tekshiruv'));
  return new;
end $$;

drop trigger if exists breedings_reminders on public.breedings;
create trigger breedings_reminders after insert or update of bred_on, pregnant, birth_on on public.breedings
  for each row execute function public.breeding_reminders();

-- ---------------------------------------------------------------------
-- 5. CHORVA SOTISH: E'LONLAR VA TAKLIFLAR
-- ---------------------------------------------------------------------
create table if not exists public.listings (
  id           uuid primary key default gen_random_uuid(),
  farmer_id    uuid not null references public.profiles(id) on delete cascade,
  region       text not null,
  district     text not null,
  village      text not null default '' check (char_length(village) <= 160),
  animal       text not null check (animal in ('sigir','buqa','qoy','echki','ot','boshqa')),
  head_count   int  not null default 1 check (head_count between 1 and 1000),
  weight_kg    int  check (weight_kg between 1 and 2000),       -- bitta boshning taxminiy tirik vazni
  age_text     text not null default '' check (char_length(age_text) <= 40),
  price        bigint check (price > 0),                         -- so'ralgan narx (jami), ixtiyoriy
  note         text not null default '' check (char_length(note) <= 500),
  photo_path   text,
  status       text not null default 'open' check (status in ('open','sold','closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create index if not exists listings_area_idx on public.listings (region, status, created_at desc);
create index if not exists listings_farmer_idx on public.listings (farmer_id, created_at desc);

create table if not exists public.offers (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  buyer_id    uuid not null references public.masters(id) on delete cascade,
  price       bigint not null check (price > 0),
  note        text not null default '' check (char_length(note) <= 300),
  status      text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (listing_id, buyer_id)
);
create index if not exists offers_listing_idx on public.offers (listing_id);
create index if not exists offers_buyer_idx on public.offers (buyer_id, updated_at desc);

create or replace function public.is_listing_owner(p_listing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.listings l where l.id = p_listing and l.farmer_id = auth.uid());
$$;

create or replace function public.can_see_listing(p_listing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.listings l where l.id = p_listing and (
      l.farmer_id = auth.uid()
      or (l.status = 'open' and public.is_buyer_in_region(l.region))
      or exists (select 1 from public.offers o where o.listing_id = l.id and o.buyer_id = auth.uid())
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 6. AI MASLAHATCHI SUHBATLARI
-- ---------------------------------------------------------------------
create table if not exists public.ai_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null check (char_length(content) between 1 and 8000),
  created_at  timestamptz not null default now()
);
create index if not exists ai_messages_user_idx on public.ai_messages (user_id, created_at);

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['masters','animals','service_orders','breedings','listings','offers'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- =====================================================================
-- KIRISH QOIDALARI (RLS)
-- =====================================================================
alter table public.masters        enable row level security;
alter table public.animals        enable row level security;
alter table public.service_orders enable row level security;
alter table public.breedings      enable row level security;
alter table public.reminders      enable row level security;
alter table public.listings       enable row level security;
alter table public.offers         enable row level security;
alter table public.ai_messages    enable row level security;

-- Ustalar: hamma ko'radi, har kim o'zinikini boshqaradi
drop policy if exists masters_read on public.masters;
create policy masters_read on public.masters for select to authenticated using (true);
drop policy if exists masters_insert on public.masters;
create policy masters_insert on public.masters for insert to authenticated with check (id = auth.uid());
drop policy if exists masters_update on public.masters;
create policy masters_update on public.masters for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists masters_delete on public.masters;
create policy masters_delete on public.masters for delete to authenticated using (id = auth.uid());

-- Hayvonlar va urug'lantirish yozuvlari: faqat egasi
drop policy if exists animals_own on public.animals;
create policy animals_own on public.animals for all to authenticated
  using (farmer_id = auth.uid()) with check (farmer_id = auth.uid());
drop policy if exists breedings_own on public.breedings;
create policy breedings_own on public.breedings for all to authenticated
  using (farmer_id = auth.uid())
  with check (farmer_id = auth.uid()
              and exists (select 1 from public.animals a where a.id = animal_id and a.farmer_id = auth.uid()));

-- Eslatmalar: faqat o'qish (trigger yozadi)
drop policy if exists reminders_own on public.reminders;
create policy reminders_own on public.reminders for select to authenticated using (user_id = auth.uid());

-- Xizmat buyurtmalari
drop policy if exists orders_select on public.service_orders;
create policy orders_select on public.service_orders for select to authenticated using (
  farmer_id = auth.uid()
  or master_id = auth.uid()
  or (status = 'new' and master_id is null
      and not (auth.uid() = any (declined_by))
      and public.is_master_for(service, region, district))
);
drop policy if exists orders_insert on public.service_orders;
create policy orders_insert on public.service_orders for insert to authenticated with check (
  farmer_id = auth.uid()
  and status = 'new' and declined_by = '{}' and result = '' and pregnant is null
  and accepted_at is null and done_at is null
  and (master_id is null or exists (select 1 from public.masters m where m.id = master_id and service = any (m.services)))
  and (animal_id is null or exists (select 1 from public.animals a where a.id = animal_id and a.farmer_id = auth.uid()))
);

-- E'lonlar
drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings for select to authenticated using (public.can_see_listing(id));
drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert to authenticated
  with check (farmer_id = auth.uid() and status = 'open' and closed_at is null);
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update to authenticated
  using (farmer_id = auth.uid() and status = 'open')
  with check (farmer_id = auth.uid() and status = 'open' and closed_at is null);

-- Takliflar: qassob o'zinikini, e'lon egasi o'z e'loniga kelganlarini ko'radi
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers for select to authenticated
  using (buyer_id = auth.uid() or public.is_listing_owner(listing_id));

-- AI suhbat: o'zinikini o'qiydi va tozalaydi (yozish faqat server orqali)
drop policy if exists ai_select on public.ai_messages;
create policy ai_select on public.ai_messages for select to authenticated using (user_id = auth.uid());
drop policy if exists ai_delete on public.ai_messages;
create policy ai_delete on public.ai_messages for delete to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.masters, public.animals, public.service_orders, public.breedings,
  public.reminders, public.listings, public.offers, public.ai_messages from anon;
revoke update, delete on public.service_orders, public.offers from authenticated;
revoke insert on public.offers, public.reminders, public.ai_messages from authenticated;
revoke update, delete on public.reminders from authenticated;
revoke update on public.ai_messages from authenticated;
revoke delete on public.listings from authenticated;

-- =====================================================================
-- RPC: XIZMAT BUYURTMALARI
-- =====================================================================
create or replace function public.accept_order(p_order uuid)
returns public.service_orders language plpgsql security definer set search_path = public as $$
declare o public.service_orders;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.masters where id = auth.uid()) then raise exception 'not_a_master'; end if;
  select * into o from public.service_orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status <> 'new' or (o.master_id is not null and o.master_id <> auth.uid()) then raise exception 'already_taken'; end if;
  if o.master_id is null and not public.is_master_for(o.service, o.region, o.district) then raise exception 'not_in_area'; end if;
  update public.service_orders set master_id = auth.uid(), status = 'accepted', accepted_at = now()
   where id = p_order returning * into o;
  return o;
end $$;

create or replace function public.decline_order(p_order uuid)
returns public.service_orders language plpgsql security definer set search_path = public as $$
declare o public.service_orders;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into o from public.service_orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.master_id = auth.uid() and o.status in ('new','accepted') then
    update public.service_orders set status = 'declined', declined_at = now(),
           declined_by = array_append(declined_by, auth.uid())
     where id = p_order returning * into o;
  elsif o.master_id is null and o.status = 'new' and public.is_master_for(o.service, o.region, o.district) then
    update public.service_orders set declined_by = array_append(declined_by, auth.uid())
     where id = p_order returning * into o;
  else
    raise exception 'not_allowed';
  end if;
  return o;
end $$;

-- Usta: accepted → on_way → done (yoki to'g'ridan-to'g'ri done).
-- Urug'lantirish bajarilsa va hayvon taqvimdan tanlangan bo'lsa — taqvimga yozuv qo'shiladi.
-- Homiladorlik tekshiruvi natijasi (p_pregnant) oxirgi urug'lantirish yozuviga yoziladi.
create or replace function public.advance_order(p_order uuid, p_status text, p_result text default '', p_pregnant boolean default null)
returns public.service_orders language plpgsql security definer set search_path = public as $$
declare o public.service_orders; b_id uuid; today date := public.today_tashkent();
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into o from public.service_orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.master_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if not ((o.status = 'accepted' and p_status in ('on_way','done')) or (o.status = 'on_way' and p_status = 'done')) then
    raise exception 'bad_transition';
  end if;
  if p_status = 'done' and o.service = 'homila' and p_pregnant is null then raise exception 'need_result'; end if;

  update public.service_orders set
     status    = p_status,
     on_way_at = case when p_status = 'on_way' then now() else on_way_at end,
     done_at   = case when p_status = 'done' then now() else done_at end,
     result    = case when p_status = 'done' then left(coalesce(p_result, ''), 500) else result end,
     pregnant  = case when p_status = 'done' and o.service = 'homila' then p_pregnant else pregnant end
   where id = p_order returning * into o;

  if p_status = 'done' and o.animal_id is not null then
    if o.service = 'urug' then
      insert into public.breedings (animal_id, farmer_id, bred_on, method, sire, order_id)
      values (o.animal_id, o.farmer_id, today, 'suniy', left(coalesce(p_result, ''), 120), o.id);
    elsif o.service = 'homila' then
      select id into b_id from public.breedings
       where animal_id = o.animal_id and birth_on is null order by bred_on desc limit 1;
      if b_id is not null then
        update public.breedings set pregnant = p_pregnant, checked_on = today where id = b_id;
      end if;
    end if;
  end if;
  return o;
end $$;

create or replace function public.cancel_order(p_order uuid)
returns public.service_orders language plpgsql security definer set search_path = public as $$
declare o public.service_orders;
begin
  select * into o from public.service_orders where id = p_order for update;
  if not found or o.farmer_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if o.status not in ('new','accepted','on_way') then raise exception 'bad_transition'; end if;
  update public.service_orders set status = 'cancelled', cancelled_at = now() where id = p_order returning * into o;
  return o;
end $$;

create or replace function public.resend_order(p_order uuid)
returns public.service_orders language plpgsql security definer set search_path = public as $$
declare o public.service_orders;
begin
  select * into o from public.service_orders where id = p_order for update;
  if not found or o.farmer_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if o.status <> 'declined' then raise exception 'bad_transition'; end if;
  update public.service_orders set status = 'new', master_id = null, declined_at = null where id = p_order returning * into o;
  return o;
end $$;

-- =====================================================================
-- RPC: CHORVA SOTISH
-- =====================================================================
-- Qassob narx taklif qiladi (qayta taklif qilsa — yangilanadi)
create or replace function public.make_offer(p_listing uuid, p_price bigint, p_note text default '')
returns public.offers language plpgsql security definer set search_path = public as $$
declare l public.listings; o public.offers;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into l from public.listings where id = p_listing for update;
  if not found then raise exception 'listing_not_found'; end if;
  if l.status <> 'open' then raise exception 'listing_closed'; end if;
  if l.farmer_id = auth.uid() then raise exception 'not_allowed'; end if;
  if not public.is_buyer_in_region(l.region) then raise exception 'not_a_buyer'; end if;
  if p_price is null or p_price <= 0 then raise exception 'bad_price'; end if;
  insert into public.offers (listing_id, buyer_id, price, note)
  values (p_listing, auth.uid(), p_price, left(coalesce(p_note, ''), 300))
  on conflict (listing_id, buyer_id) do update
    set price = excluded.price, note = excluded.note, status = 'pending'
  returning * into o;
  return o;
end $$;

create or replace function public.withdraw_offer(p_offer uuid)
returns public.offers language plpgsql security definer set search_path = public as $$
declare o public.offers;
begin
  select * into o from public.offers where id = p_offer for update;
  if not found or o.buyer_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if o.status <> 'pending' then raise exception 'bad_transition'; end if;
  update public.offers set status = 'withdrawn' where id = p_offer returning * into o;
  return o;
end $$;

-- E'lon egasi taklifni qabul qiladi yoki rad etadi
create or replace function public.answer_offer(p_offer uuid, p_accept boolean)
returns public.offers language plpgsql security definer set search_path = public as $$
declare o public.offers; l public.listings;
begin
  select * into o from public.offers where id = p_offer for update;
  if not found then raise exception 'not_found'; end if;
  select * into l from public.listings where id = o.listing_id for update;
  if l.farmer_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if l.status <> 'open' or o.status <> 'pending' then raise exception 'bad_transition'; end if;
  if p_accept then
    update public.offers set status = 'accepted' where id = p_offer returning * into o;
    update public.offers set status = 'rejected' where listing_id = l.id and id <> p_offer and status = 'pending';
    update public.listings set status = 'sold', closed_at = now() where id = l.id;
  else
    update public.offers set status = 'rejected' where id = p_offer returning * into o;
  end if;
  return o;
end $$;

create or replace function public.close_listing(p_listing uuid)
returns public.listings language plpgsql security definer set search_path = public as $$
declare l public.listings;
begin
  select * into l from public.listings where id = p_listing for update;
  if not found or l.farmer_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if l.status <> 'open' then raise exception 'bad_transition'; end if;
  update public.listings set status = 'closed', closed_at = now() where id = p_listing returning * into l;
  update public.offers set status = 'rejected' where listing_id = p_listing and status = 'pending';
  return l;
end $$;

-- Taklifi qabul qilingan qassobga chorvadorning ismi va telefoni
create or replace function public.listing_contact(p_listing uuid)
returns table (full_name text, phone text, village text) language sql stable security definer set search_path = public as $$
  select p.full_name, p.phone, l.village
    from public.listings l join public.profiles p on p.id = l.farmer_id
   where l.id = p_listing
     and exists (select 1 from public.offers o where o.listing_id = l.id and o.buyer_id = auth.uid() and o.status = 'accepted');
$$;

revoke execute on function public.accept_order(uuid), public.decline_order(uuid),
  public.advance_order(uuid, text, text, boolean), public.cancel_order(uuid), public.resend_order(uuid),
  public.make_offer(uuid, bigint, text), public.withdraw_offer(uuid), public.answer_offer(uuid, boolean),
  public.close_listing(uuid), public.listing_contact(uuid)
  from public, anon;
grant execute on function public.accept_order(uuid), public.decline_order(uuid),
  public.advance_order(uuid, text, text, boolean), public.cancel_order(uuid), public.resend_order(uuid),
  public.make_offer(uuid, bigint, text), public.withdraw_offer(uuid), public.answer_offer(uuid, boolean),
  public.close_listing(uuid), public.listing_contact(uuid)
  to authenticated;

-- E'lon rasmlarini ko'ra oladiganlar: e'lonni ko'ra oladiganlar
drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.cases c where c.photo_path = storage.objects.name and public.can_see_case(c.id))
    or exists (select 1 from public.messages m where m.photo_path = storage.objects.name and public.is_case_participant(m.case_id))
    or exists (select 1 from public.listings l where l.photo_path = storage.objects.name and public.can_see_listing(l.id))
  )
);

-- =====================================================================
-- JONLI YANGILANISHLAR
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['masters','service_orders','listings','offers','breedings','reminders'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- BILDIRISHNOMALAR (mavjud notify_edge triggeri orqali → "notify" funksiyasi)
-- =====================================================================
drop trigger if exists orders_notify on public.service_orders;
create trigger orders_notify after insert or update on public.service_orders
  for each row execute function public.notify_edge();
drop trigger if exists listings_notify on public.listings;
create trigger listings_notify after insert on public.listings
  for each row execute function public.notify_edge();
drop trigger if exists offers_notify on public.offers;
create trigger offers_notify after insert or update on public.offers
  for each row execute function public.notify_edge();

-- =====================================================================
-- KUNLIK ESLATMALAR: har kuni 09:00 (Toshkent) da "bot" funksiyasi eslatmalarni yuboradi.
-- Vault'dagi notify_url / notify_secret ishlatiladi (README, 6-qadam).
-- =====================================================================
create or replace function public.reminders_tick()
returns void language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_url'    limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url     := regexp_replace(v_url, '/notify/?$', '/bot') || '?cron=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body    := '{}'::jsonb
  );
end $$;
revoke execute on function public.reminders_tick() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'vetchaqiruv-eslatmalar';
  perform cron.schedule('vetchaqiruv-eslatmalar', '0 4 * * *', 'select public.reminders_tick()');
exception when others then
  raise notice 'pg_cron yoqilmadi (%). Eslatmalar avtomatik yuborilmaydi: Database → Extensions → pg_cron ni yoqib, shu faylni qayta ishga tushiring.', sqlerrm;
end $$;
