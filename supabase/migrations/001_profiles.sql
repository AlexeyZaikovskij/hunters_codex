-- 001: профили игроков.
-- Профиль создаётся автоматически при регистрации (триггер на auth.users).
-- Пока здесь только базовые поля; склонность, ранг, уровень и т.д. добавятся следующими миграциями.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Профили (ники) видны всем — для рейтингов и PvP.
drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles for select
  using (true);

-- Менять можно только свой профиль.
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
