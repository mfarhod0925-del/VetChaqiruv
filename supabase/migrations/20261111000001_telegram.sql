-- VetChaqiruv: Telegram mini app va bot uchun qo'shimcha
-- Qayta ishga tushirish xavfsiz: mavjud ma'lumotlar o'chmaydi.

-- Telegram foydalanuvchilari: kim botga qaysi raqamni yuborgan.
-- Bu jadvalga faqat server funksiyalari (service_role) kiradi, ilovadan to'g'ridan-to'g'ri o'qib bo'lmaydi.
create table if not exists public.telegram_users (
  tg_id          bigint primary key,                       -- Telegram foydalanuvchi ID
  chat_id        bigint not null,                          -- shaxsiy chat ID (xabar yuborish uchun)
  phone          text check (phone is null or phone ~ '^998[0-9]{9}$'), -- 998XXXXXXXXX, botga yuborilgan raqam
  user_id        uuid references auth.users(id) on delete set null,     -- ilovadagi hisob
  first_name     text,
  last_name      text,
  username       text,
  language_code  text,
  notify         boolean not null default true,            -- bildirishnomalarni Telegram'ga yuborish
  bot_blocked    boolean not null default false,           -- foydalanuvchi botni bloklagan
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists telegram_users_phone_idx on public.telegram_users (phone);
create index if not exists telegram_users_user_idx  on public.telegram_users (user_id);

drop trigger if exists telegram_users_touch on public.telegram_users;
create trigger telegram_users_touch before update on public.telegram_users
  for each row execute function public.touch_updated_at();

alter table public.telegram_users enable row level security;
-- Siyosat (policy) yo'q: anon va authenticated hech narsa ko'rmaydi, faqat service_role.
revoke all on public.telegram_users from anon, authenticated;

-- Telefon raqam bo'yicha mavjud hisobni topish (faqat server funksiyalari uchun).
-- auth.users.phone odatda "998901234567" ko'rinishida saqlanadi.
create or replace function public.tg_find_user_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
    and coalesce(p_phone, '') <> ''
  order by u.created_at
  limit 1;
$$;
revoke all on function public.tg_find_user_by_phone(text) from public, anon, authenticated;
grant execute on function public.tg_find_user_by_phone(text) to service_role;
