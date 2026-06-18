-- Game Presence Tracker - Supabase schema

-- 1. Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  partner_id uuid references public.profiles(id),
  created_at timestamp with time zone default now()
);

-- 2. Presence (real-time status)
create table if not exists public.presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text check (status in ('online', 'offline', 'playing')),
  current_game text,
  started_at timestamp with time zone,
  updated_at timestamp with time zone default now()
);

-- 3. Game sessions (history)
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  game_name text not null,
  executable_name text,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone,
  duration interval,
  created_at timestamp with time zone default now()
);

-- 4. Devices (push tokens)
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  push_token text,
  platform text,
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.presence enable row level security;
alter table public.game_sessions enable row level security;
alter table public.devices enable row level security;

-- Policies (examples)
-- Profiles
create policy if not exists "read own profile" on public.profiles for select using (auth.uid() = id);
create policy if not exists "update own profile" on public.profiles for update using (auth.uid() = id);
create policy if not exists "partner can read profile" on public.profiles for select using (auth.uid() = id or auth.uid() = partner_id);

-- Presence
create policy if not exists "insert own presence" on public.presence for insert with check (auth.uid() = user_id);
create policy if not exists "update own presence" on public.presence for update using (auth.uid() = user_id);
create policy if not exists "user and partner can read presence" on public.presence for select using (auth.uid() = user_id or auth.uid() = (select partner_id from public.profiles where id = user_id));

-- Game sessions
create policy if not exists "insert own sessions" on public.game_sessions for insert with check (auth.uid() = user_id);
create policy if not exists "read own and partner sessions" on public.game_sessions for select using (auth.uid() = user_id or auth.uid() = (select partner_id from public.profiles where id = user_id));
create policy if not exists "update own sessions" on public.game_sessions for update using (auth.uid() = user_id);

-- Devices
create policy if not exists "insert own device" on public.devices for insert with check (auth.uid() = user_id);
create policy if not exists "read own devices" on public.devices for select using (auth.uid() = user_id);

-- Enable realtime on presence table (run in Supabase SQL Editor or via psql)
-- alter publication supabase_realtime add table public.presence;
