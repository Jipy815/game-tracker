-- Game Presence Tracker core schema. Run this before sql/notification.sql.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  partner_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null check (status in ('online', 'offline', 'playing')),
  current_game text,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_name text not null,
  executable_name text,
  start_time timestamptz not null,
  end_time timestamptz,
  duration interval,
  created_at timestamptz not null default now(),
  check (end_time is null or end_time >= start_time)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  push_token text not null,
  platform text not null default 'expo',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Bring databases created from the original prototype up to this shape.
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.devices add column if not exists last_seen_at timestamptz not null default now();
update public.devices set platform = 'expo' where platform is null;
delete from public.devices where push_token is null;
alter table public.devices alter column push_token set not null;
alter table public.devices alter column platform set not null;
create unique index if not exists devices_user_push_token_key on public.devices (user_id, push_token);
create index if not exists profiles_partner_id_idx on public.profiles (partner_id);
create index if not exists game_sessions_user_started_idx on public.game_sessions (user_id, start_time desc);
create index if not exists game_sessions_open_by_executable_idx on public.game_sessions (user_id, executable_name) where end_time is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Mobile clients may select only an already linked partner. Linking is an administrative/service-role action.
create or replace function public.prevent_untrusted_partner_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.partner_id is distinct from new.partner_id
     and auth.uid() is not null
     and auth.role() <> 'service_role' then
    raise exception 'Partner links can only be changed by a trusted server action';
  end if;
  return new;
end;
$$;

create or replace function public.is_linked_partner(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles current_profile
    where current_profile.id = auth.uid()
      and current_profile.partner_id = target_profile_id
  );
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles for any users that existed before the auth trigger was installed.
insert into public.profiles (id, email, display_name)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'display_name', split_part(coalesce(email, ''), '@', 1))
from auth.users
on conflict (id) do nothing;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists prevent_untrusted_partner_change on public.profiles;
create trigger prevent_untrusted_partner_change before update on public.profiles
  for each row execute procedure public.prevent_untrusted_partner_change();

drop trigger if exists presence_set_updated_at on public.presence;
create trigger presence_set_updated_at before update on public.presence
  for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.presence enable row level security;
alter table public.game_sessions enable row level security;
alter table public.devices enable row level security;

drop policy if exists "read own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "partner can read profile" on public.profiles;
drop policy if exists profiles_select_authorized on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_authorized on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.is_linked_partner(id));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "insert own presence" on public.presence;
drop policy if exists "update own presence" on public.presence;
drop policy if exists "user and partner can read presence" on public.presence;
drop policy if exists presence_select_authorized on public.presence;
drop policy if exists presence_insert_own on public.presence;
drop policy if exists presence_update_own on public.presence;
create policy presence_select_authorized on public.presence
  for select to authenticated
  using (auth.uid() = user_id or public.is_linked_partner(user_id));
create policy presence_insert_own on public.presence
  for insert to authenticated
  with check (auth.uid() = user_id);
create policy presence_update_own on public.presence
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "insert own sessions" on public.game_sessions;
drop policy if exists "read own and partner sessions" on public.game_sessions;
drop policy if exists "update own sessions" on public.game_sessions;
drop policy if exists game_sessions_select_authorized on public.game_sessions;
drop policy if exists game_sessions_insert_own on public.game_sessions;
drop policy if exists game_sessions_update_own on public.game_sessions;
create policy game_sessions_select_authorized on public.game_sessions
  for select to authenticated
  using (auth.uid() = user_id or public.is_linked_partner(user_id));
create policy game_sessions_insert_own on public.game_sessions
  for insert to authenticated
  with check (auth.uid() = user_id);
create policy game_sessions_update_own on public.game_sessions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "insert own device" on public.devices;
drop policy if exists "read own devices" on public.devices;
drop policy if exists devices_select_own on public.devices;
drop policy if exists devices_insert_own on public.devices;
drop policy if exists devices_update_own on public.devices;
drop policy if exists devices_delete_own on public.devices;
create policy devices_select_own on public.devices
  for select to authenticated
  using (auth.uid() = user_id);
create policy devices_insert_own on public.devices
  for insert to authenticated
  with check (auth.uid() = user_id);
create policy devices_update_own on public.devices
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy devices_delete_own on public.devices
  for delete to authenticated
  using (auth.uid() = user_id);

grant execute on function public.is_linked_partner(uuid) to authenticated;

-- Enable in the Supabase SQL editor once per project (it is not idempotent in PostgreSQL):
-- alter publication supabase_realtime add table public.presence;
