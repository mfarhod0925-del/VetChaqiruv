-- =====================================================================
-- VetChaqiruv — asosiy sxema
-- Supabase SQL Editor'da bir marta ishga tushiriladi.
-- Jadvallar, kirish qoidalari (RLS), xavfsiz funksiyalar (RPC),
-- rasm saqlash joyi va jonli yangilanishlar.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. PROFILLAR
-- Har bir foydalanuvchi (telefon orqali kirgan) uchun bitta qator.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text check (role in ('farmer','vet','pharmacy')),
  full_name   text not null default '' check (char_length(full_name) <= 120),
  phone       text not null default '' check (char_length(phone) <= 32),
  region      text check (char_length(region) <= 80),
  district    text check (char_length(district) <= 80),
  village     text not null default '' check (char_length(village) <= 160),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Yangi foydalanuvchi ro'yxatdan o'tganda profil avtomatik yaratiladi.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, coalesce(new.phone, ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. VETERINARLAR
-- ---------------------------------------------------------------------
create table if not exists public.vets (
  id          uuid primary key references public.profiles(id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 2 and 120),
  phone       text not null check (char_length(phone) between 9 and 32),
  region      text not null,
  district    text not null,
  village     text not null default '' check (char_length(village) <= 160),
  experience  int  not null default 0 check (experience between 0 and 70),
  specs       text[] not null default '{}',
  status      text not null default 'online' check (status in ('online','busy','offline')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists vets_area_idx on public.vets (region, district);

-- ---------------------------------------------------------------------
-- 3. DORIXONALAR, DORILAR, QOLDIQ
-- ---------------------------------------------------------------------
create table if not exists public.pharmacies (
  id          uuid primary key references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 120),
  phone       text not null default '' check (char_length(phone) <= 32),
  region      text not null,
  district    text not null,
  address     text not null check (char_length(address) between 2 and 200),
  hours       text not null default '' check (char_length(hours) <= 60),
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pharmacies_area_idx on public.pharmacies (region, district);

create table if not exists public.drugs (
  id            text primary key,
  name          text not null,
  form          text not null default '',
  default_price int  not null default 0 check (default_price >= 0),
  active        boolean not null default true,
  sort          int not null default 0
);

create table if not exists public.pharmacy_stock (
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  drug_id     text not null references public.drugs(id) on delete cascade,
  qty         int  not null default 0 check (qty >= 0),
  price       int  not null default 0 check (price >= 0),
  updated_at  timestamptz not null default now(),
  primary key (pharmacy_id, drug_id)
);

-- ---------------------------------------------------------------------
-- 4. ARIZALAR (chaqiruv / video maslahat)
-- ---------------------------------------------------------------------
create table if not exists public.cases (
  id            uuid primary key default gen_random_uuid(),
  farmer_id     uuid not null references public.profiles(id) on delete cascade,
  vet_id        uuid references public.vets(id) on delete set null,
  region        text not null,
  district      text not null,
  animal        text not null check (animal in ('sigir','qoy','echki','ot','parranda','boshqa')),
  animal_count  int  not null default 1 check (animal_count between 1 and 10000),
  symptoms      text[] not null default '{}',
  urgency       text not null default 'bugun' check (urgency in ('shoshilinch','bugun','maslahat')),
  kind          text not null default 'call' check (kind in ('call','video')),
  note          text not null default '' check (char_length(note) <= 2000),
  contact_name  text not null check (char_length(contact_name) between 1 and 120),
  phone         text not null check (char_length(phone) between 9 and 32),
  village       text not null default '' check (char_length(village) <= 160),
  lat           double precision,
  lng           double precision,
  photo_path    text,
  status        text not null default 'new'
                check (status in ('new','accepted','on_way','arrived','done','declined','cancelled')),
  declined_by   uuid[] not null default '{}',
  rx_note       text not null default '',
  rx_at         timestamptz,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  on_way_at     timestamptz,
  arrived_at    timestamptz,
  done_at       timestamptz,
  declined_at   timestamptz,
  cancelled_at  timestamptz,
  updated_at    timestamptz not null default now()
);
create index if not exists cases_farmer_idx on public.cases (farmer_id, created_at desc);
create index if not exists cases_vet_idx    on public.cases (vet_id, created_at desc);
create index if not exists cases_pool_idx   on public.cases (region, district, status) where vet_id is null;

-- Retsept qatorlari (veterinar yozadi)
create table if not exists public.prescription_items (
  id        bigint generated always as identity primary key,
  case_id   uuid not null references public.cases(id) on delete cascade,
  drug_id   text not null references public.drugs(id),
  dose      text not null default '' check (char_length(dose) <= 200),
  position  int  not null default 0
);
create index if not exists prescription_items_case_idx on public.prescription_items (case_id);

-- Yozishma
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  case_id     uuid not null references public.cases(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null default '' check (char_length(body) <= 2000),
  photo_path  text,
  created_at  timestamptz not null default now(),
  check (char_length(body) > 0 or photo_path is not null)
);
create index if not exists messages_case_idx on public.messages (case_id, created_at);

-- ---------------------------------------------------------------------
-- 5. DORI BAND QILISH (buyurtma)
-- ---------------------------------------------------------------------
create table if not exists public.reservations (
  id            uuid primary key default gen_random_uuid(),
  farmer_id     uuid not null references public.profiles(id) on delete cascade,
  pharmacy_id   uuid not null references public.pharmacies(id) on delete cascade,
  case_id       uuid references public.cases(id) on delete set null,
  status        text not null default 'new' check (status in ('new','ready','done','cancelled')),
  total         int  not null default 0,
  contact_name  text not null default '',
  phone         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists reservations_farmer_idx   on public.reservations (farmer_id, created_at desc);
create index if not exists reservations_pharmacy_idx on public.reservations (pharmacy_id, created_at desc);

create table if not exists public.reservation_items (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  drug_id        text not null references public.drugs(id),
  qty            int  not null check (qty > 0),
  price          int  not null check (price >= 0),
  primary key (reservation_id, drug_id)
);

-- =====================================================================
-- YORDAMCHI FUNKSIYALAR (RLS ichida ishlatiladi)
-- security definer: RLS'ni chetlab o'tib faqat kerakli tekshiruvni qiladi
-- =====================================================================
create or replace function public.is_vet_in_area(p_region text, p_district text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vets v
    where v.id = auth.uid() and v.region = p_region and v.district = p_district
  );
$$;

create or replace function public.is_case_participant(p_case uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cases c
    where c.id = p_case and (c.farmer_id = auth.uid() or c.vet_id = auth.uid())
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
          and public.is_vet_in_area(c.region, c.district))
    )
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists vets_touch on public.vets;
create trigger vets_touch before update on public.vets for each row execute function public.touch_updated_at();
drop trigger if exists pharmacies_touch on public.pharmacies;
create trigger pharmacies_touch before update on public.pharmacies for each row execute function public.touch_updated_at();
drop trigger if exists stock_touch on public.pharmacy_stock;
create trigger stock_touch before update on public.pharmacy_stock for each row execute function public.touch_updated_at();

-- =====================================================================
-- KIRISH QOIDALARI (Row Level Security)
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.vets               enable row level security;
alter table public.pharmacies         enable row level security;
alter table public.drugs              enable row level security;
alter table public.pharmacy_stock     enable row level security;
alter table public.cases              enable row level security;
alter table public.prescription_items enable row level security;
alter table public.messages           enable row level security;
alter table public.reservations       enable row level security;
alter table public.reservation_items  enable row level security;

-- Profil: faqat o'zi o'qiydi va o'zgartiradi
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Veterinarlar: hamma (kirgan) ko'radi, har kim faqat o'z yozuvini boshqaradi
drop policy if exists vets_read on public.vets;
create policy vets_read on public.vets for select to authenticated using (true);
drop policy if exists vets_insert on public.vets;
create policy vets_insert on public.vets for insert to authenticated with check (id = auth.uid());
drop policy if exists vets_update on public.vets;
create policy vets_update on public.vets for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists vets_delete on public.vets;
create policy vets_delete on public.vets for delete to authenticated using (id = auth.uid());

-- Dorixonalar
drop policy if exists pharmacies_read on public.pharmacies;
create policy pharmacies_read on public.pharmacies for select to authenticated using (true);
drop policy if exists pharmacies_insert on public.pharmacies;
create policy pharmacies_insert on public.pharmacies for insert to authenticated with check (id = auth.uid());
drop policy if exists pharmacies_update on public.pharmacies;
create policy pharmacies_update on public.pharmacies for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists pharmacies_delete on public.pharmacies;
create policy pharmacies_delete on public.pharmacies for delete to authenticated using (id = auth.uid());

-- Dorilar ro'yxati: hamma o'qiydi, faqat admin (SQL orqali) o'zgartiradi
drop policy if exists drugs_read on public.drugs;
create policy drugs_read on public.drugs for select to anon, authenticated using (true);

-- Qoldiq: hamma o'qiydi, dorixona egasi o'zgartiradi
drop policy if exists stock_read on public.pharmacy_stock;
create policy stock_read on public.pharmacy_stock for select to authenticated using (true);
drop policy if exists stock_write on public.pharmacy_stock;
create policy stock_write on public.pharmacy_stock for all to authenticated
  using (pharmacy_id = auth.uid()) with check (pharmacy_id = auth.uid());

-- Arizalar: chorvador o'zinikini, veterinar o'ziga biriktirilganni
-- va o'z tumanidagi ochiq (hali hech kim olmagan) arizalarni ko'radi.
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases for select to authenticated using (
  farmer_id = auth.uid()
  or vet_id = auth.uid()
  or (status = 'new' and vet_id is null
      and not (auth.uid() = any (declined_by))
      and public.is_vet_in_area(region, district))
);
-- Yaratish: faqat o'z nomidan, faqat "new" holatida
drop policy if exists cases_insert on public.cases;
create policy cases_insert on public.cases for insert to authenticated with check (
  farmer_id = auth.uid()
  and status = 'new'
  and declined_by = '{}'
  and accepted_at is null and done_at is null
  and rx_at is null and rx_note = ''
  and (vet_id is null or exists (select 1 from public.vets v where v.id = vet_id))
);
-- O'zgartirish faqat quyidagi RPC funksiyalar orqali (to'g'ridan-to'g'ri UPDATE yopiq).

-- Retsept: arizani ko'ra oladigan ishtirokchilar o'qiydi; yozish RPC orqali
drop policy if exists rx_select on public.prescription_items;
create policy rx_select on public.prescription_items for select to authenticated
  using (public.is_case_participant(case_id));

-- Yozishma: faqat chorvador va biriktirilgan veterinar
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.is_case_participant(case_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_case_participant(case_id));

-- Buyurtmalar: chorvador va dorixona ko'radi; yaratish/o'zgartirish RPC orqali
drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations for select to authenticated
  using (farmer_id = auth.uid() or pharmacy_id = auth.uid());
drop policy if exists reservation_items_select on public.reservation_items;
create policy reservation_items_select on public.reservation_items for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id
                 and (r.farmer_id = auth.uid() or r.pharmacy_id = auth.uid())));

-- Mehmonlar (anon) hech narsa yoza olmaydi
revoke insert, update, delete on all tables in schema public from anon;
-- To'g'ridan-to'g'ri o'zgartirish yopiq jadvallar
revoke update, delete on public.cases, public.prescription_items, public.reservations, public.reservation_items from authenticated;
revoke insert on public.prescription_items, public.reservations, public.reservation_items from authenticated;
revoke insert, update, delete on public.drugs from authenticated;

-- =====================================================================
-- RPC FUNKSIYALAR — barcha holat o'zgarishlari shu yerda tekshiriladi
-- Xatolar inglizcha kod bilan qaytadi, ilova ularni o'zbekchaga o'giradi.
-- =====================================================================

-- Veterinar arizani qabul qiladi (bir vaqtda faqat bitta vet qabul qila oladi)
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
  if c.vet_id is null and not public.is_vet_in_area(c.region, c.district) then
    raise exception 'not_in_area';
  end if;
  update public.cases
     set vet_id = auth.uid(), status = 'accepted', accepted_at = now(), updated_at = now()
   where id = p_case
  returning * into c;
  update public.vets set status = 'busy' where id = auth.uid() and status = 'online';
  return c;
end $$;

-- Veterinar rad etadi (ochiq arizada — o'zi uchun yashiradi; o'ziga biriktirilganda — chorvadorga qaytaradi)
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
  elsif c.vet_id is null and c.status = 'new' and public.is_vet_in_area(c.region, c.district) then
    update public.cases set declined_by = array_append(declined_by, auth.uid()), updated_at = now()
     where id = p_case returning * into c;
  else
    raise exception 'not_allowed';
  end if;
  return c;
end $$;

-- Veterinar keyingi bosqichga o'tkazadi: on_way → arrived → done
create or replace function public.advance_case(p_case uuid, p_status text)
returns public.cases language plpgsql security definer set search_path = public as $$
declare c public.cases; ok boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'case_not_found'; end if;
  if c.vet_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  ok := (c.kind = 'call'  and ((c.status = 'accepted' and p_status in ('on_way','done'))
                            or (c.status = 'on_way'   and p_status in ('arrived','done'))
                            or (c.status = 'arrived'  and p_status = 'done')))
     or (c.kind = 'video' and c.status = 'accepted' and p_status = 'done');
  if not ok then raise exception 'bad_transition'; end if;
  update public.cases set
     status     = p_status,
     on_way_at  = case when p_status = 'on_way'  then now() else on_way_at end,
     arrived_at = case when p_status = 'arrived' then now() else arrived_at end,
     done_at    = case when p_status = 'done'    then now() else done_at end,
     updated_at = now()
   where id = p_case returning * into c;
  if p_status = 'done' and not exists (
       select 1 from public.cases where vet_id = auth.uid() and status in ('accepted','on_way','arrived')) then
    update public.vets set status = 'online' where id = auth.uid() and status = 'busy';
  end if;
  return c;
end $$;

-- Chorvador bekor qiladi
create or replace function public.cancel_case(p_case uuid)
returns public.cases language plpgsql security definer set search_path = public as $$
declare c public.cases;
begin
  select * into c from public.cases where id = p_case for update;
  if not found or c.farmer_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if c.status not in ('new','accepted','on_way') then raise exception 'bad_transition'; end if;
  update public.cases set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where id = p_case returning * into c;
  return c;
end $$;

-- Chorvador rad etilgan arizani tumandagi barcha veterinarlarga qayta yuboradi
create or replace function public.resend_case(p_case uuid)
returns public.cases language plpgsql security definer set search_path = public as $$
declare c public.cases;
begin
  select * into c from public.cases where id = p_case for update;
  if not found or c.farmer_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if c.status <> 'declined' then raise exception 'bad_transition'; end if;
  update public.cases set status = 'new', vet_id = null, declined_at = null, updated_at = now()
   where id = p_case returning * into c;
  return c;
end $$;

-- Veterinar retsept yozadi / tahrirlaydi.  p_items: [{"drug_id":"oks","dose":"1 ml/10 kg"}]
create or replace function public.save_prescription(p_case uuid, p_items jsonb, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare c public.cases;
begin
  select * into c from public.cases where id = p_case for update;
  if not found or c.vet_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if c.status not in ('accepted','on_way','arrived','done') then raise exception 'bad_transition'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'bad_items';
  end if;
  delete from public.prescription_items where case_id = p_case;
  insert into public.prescription_items (case_id, drug_id, dose, position)
  select p_case, x.drug_id, left(coalesce(x.dose, ''), 200), (row_number() over ())::int
    from jsonb_to_recordset(p_items) as x(drug_id text, dose text);
  update public.cases set rx_note = left(coalesce(p_note, ''), 1000), rx_at = now(), updated_at = now()
   where id = p_case;
end $$;

-- Chorvador dori band qiladi. Narx dorixona qoldig'idan olinadi (soxtalashtirib bo'lmaydi).
-- p_items: [{"drug_id":"oks","qty":2}]
create or replace function public.create_reservation(p_pharmacy uuid, p_items jsonb, p_case uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r_id uuid; it record; st public.pharmacy_stock; v_total int := 0; n int := 0;
  p public.profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.pharmacies where id = p_pharmacy) then raise exception 'pharmacy_not_found'; end if;
  if p_case is not null and not exists (select 1 from public.cases where id = p_case and farmer_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'bad_items'; end if;
  select * into p from public.profiles where id = auth.uid();

  insert into public.reservations (farmer_id, pharmacy_id, case_id, contact_name, phone)
  values (auth.uid(), p_pharmacy, p_case, coalesce(p.full_name, ''), coalesce(p.phone, ''))
  returning id into r_id;

  for it in select x.drug_id, x.qty from jsonb_to_recordset(p_items) as x(drug_id text, qty int) loop
    if it.qty is null or it.qty <= 0 then continue; end if;
    select * into st from public.pharmacy_stock where pharmacy_id = p_pharmacy and drug_id = it.drug_id;
    if not found or st.qty < it.qty then raise exception 'insufficient_stock:%', it.drug_id; end if;
    insert into public.reservation_items (reservation_id, drug_id, qty, price) values (r_id, it.drug_id, it.qty, st.price);
    v_total := v_total + it.qty * st.price; n := n + 1;
  end loop;
  if n = 0 then raise exception 'bad_items'; end if;
  update public.reservations set total = v_total where id = r_id;
  return r_id;
end $$;

-- Buyurtma holati. Dorixona: new→ready/cancelled, ready→done/cancelled. Chorvador: new/ready→cancelled.
-- "done" bo'lganda qoldiqdan avtomatik ayiriladi.
create or replace function public.set_reservation_status(p_res uuid, p_status text)
returns public.reservations language plpgsql security definer set search_path = public as $$
declare r public.reservations; it record; is_pharm boolean; is_farmer boolean;
begin
  select * into r from public.reservations where id = p_res for update;
  if not found then raise exception 'not_found'; end if;
  is_pharm := r.pharmacy_id = auth.uid();
  is_farmer := r.farmer_id = auth.uid();
  if not (
       (is_pharm and ((r.status = 'new' and p_status in ('ready','cancelled'))
                   or (r.status = 'ready' and p_status in ('done','cancelled'))))
    or (is_farmer and r.status in ('new','ready') and p_status = 'cancelled')
  ) then raise exception 'bad_transition'; end if;

  if p_status = 'done' then
    for it in select * from public.reservation_items where reservation_id = p_res loop
      update public.pharmacy_stock set qty = qty - it.qty
       where pharmacy_id = r.pharmacy_id and drug_id = it.drug_id and qty >= it.qty;
      if not found then raise exception 'insufficient_stock:%', it.drug_id; end if;
    end loop;
  end if;
  update public.reservations set status = p_status, updated_at = now() where id = p_res returning * into r;
  return r;
end $$;

-- Dorixona qoldig'ini bir martada saqlash.  p_rows: [{"drug_id":"oks","qty":10,"price":68000}]
create or replace function public.save_stock(p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.pharmacies where id = auth.uid()) then raise exception 'not_a_pharmacy'; end if;
  insert into public.pharmacy_stock (pharmacy_id, drug_id, qty, price)
  select auth.uid(), x.drug_id, greatest(coalesce(x.qty, 0), 0), greatest(coalesce(x.price, 0), 0)
    from jsonb_to_recordset(p_rows) as x(drug_id text, qty int, price int)
    join public.drugs d on d.id = x.drug_id
  on conflict (pharmacy_id, drug_id) do update set qty = excluded.qty, price = excluded.price;
end $$;

-- RPC'larni faqat kirgan foydalanuvchilar chaqira oladi
revoke execute on function public.accept_case(uuid), public.decline_case(uuid), public.advance_case(uuid, text),
  public.cancel_case(uuid), public.resend_case(uuid), public.save_prescription(uuid, jsonb, text),
  public.create_reservation(uuid, jsonb, uuid), public.set_reservation_status(uuid, text), public.save_stock(jsonb)
  from public, anon;
grant execute on function public.accept_case(uuid), public.decline_case(uuid), public.advance_case(uuid, text),
  public.cancel_case(uuid), public.resend_case(uuid), public.save_prescription(uuid, jsonb, text),
  public.create_reservation(uuid, jsonb, uuid), public.set_reservation_status(uuid, text), public.save_stock(jsonb)
  to authenticated;

-- =====================================================================
-- RASMLAR (Storage)
-- Yo'l: photos/<foydalanuvchi_id>/<fayl>.jpg  — maxfiy bucket
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists photos_upload on storage.objects;
create policy photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.cases c where c.photo_path = storage.objects.name and public.can_see_case(c.id))
    or exists (select 1 from public.messages m where m.photo_path = storage.objects.name and public.is_case_participant(m.case_id))
  )
);

drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- JONLI YANGILANISHLAR (Realtime)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['cases','messages','reservations','vets','pharmacy_stock','prescription_items'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- SMS BILDIRISHNOMALAR UCHUN TRIGGER
-- Vault'da 'notify_url' va 'notify_secret' bo'lsa, "notify" Edge Function chaqiriladi.
-- Ular bo'lmasa hech narsa qilmaydi (ilova baribir ishlaydi).
-- =====================================================================
create extension if not exists pg_net;

create or replace function public.notify_edge()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  begin
    select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_url'    limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  exception when others then
    return new;
  end;
  if v_url is null or v_secret is null then return new; end if;
  -- Faqat holat o'zgarganda yoki yangi yozuvda
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body    := jsonb_build_object(
                 'type', tg_op, 'table', tg_table_name,
                 'record', to_jsonb(new),
                 'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) end)
  );
  return new;
exception when others then
  -- Bildirishnoma xatosi asosiy amalni to'xtatmasin
  raise warning 'notify_edge: %', sqlerrm;
  return new;
end $$;

drop trigger if exists cases_notify on public.cases;
create trigger cases_notify after insert or update on public.cases
  for each row execute function public.notify_edge();
drop trigger if exists reservations_notify on public.reservations;
create trigger reservations_notify after insert or update on public.reservations
  for each row execute function public.notify_edge();
