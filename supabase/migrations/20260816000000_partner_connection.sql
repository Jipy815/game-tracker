-- Secure, one-time partner linking for two independently authenticated users.
-- This migration is intentionally self-contained so it can also be run in the
-- Supabase SQL editor for projects created before migrations were introduced.

alter table public.presence add column if not exists current_executable text;

create table if not exists public.partner_connection_codes (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  redeemed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((used_at is null) = (redeemed_by is null))
);

create index if not exists partner_connection_codes_creator_active_idx
  on public.partner_connection_codes (creator_id, expires_at desc)
  where used_at is null;

alter table public.partner_connection_codes enable row level security;

-- Only the functions below can modify partner links. The temporary local
-- setting is set exclusively by their security-definer transaction.
create or replace function public.prevent_untrusted_partner_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.partner_id is distinct from new.partner_id
     and current_setting('game_presence.partner_link_change', true) is distinct from 'allowed' then
    raise exception 'Partner links can only be changed through the connection flow';
  end if;
  return new;
end;
$$;

create or replace function public.create_partner_connection_code()
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  existing_partner_id uuid;
  generated_code text;
  code_expiry timestamptz := now() + interval '15 minutes';
  inserted_count integer;
begin
  if requesting_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select partner_id into existing_partner_id
  from public.profiles
  where id = requesting_user_id
  for update;

  if not found then
    raise exception 'Profile is not ready yet';
  end if;
  if existing_partner_id is not null then
    raise exception 'This account is already connected';
  end if;

  -- A regenerated code invalidates any earlier unused code for this user.
  update public.partner_connection_codes
  set expires_at = now()
  where creator_id = requesting_user_id
    and used_at is null
    and expires_at > now();

  for attempt in 1..5 loop
    generated_code := upper(encode(gen_random_bytes(5), 'hex'));
    insert into public.partner_connection_codes (creator_id, code_hash, expires_at)
    values (requesting_user_id, digest(generated_code, 'sha256'), code_expiry)
    on conflict (code_hash) do nothing;

    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then
      return query select generated_code, code_expiry;
      return;
    end if;
  end loop;

  raise exception 'Unable to generate a connection code';
end;
$$;

create or replace function public.redeem_partner_connection_code(submitted_code text)
returns table(partner_id uuid, partner_display_name text, partner_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  normalized_code text := upper(regexp_replace(trim(coalesce(submitted_code, '')), '\\s+', '', 'g'));
  connection_record public.partner_connection_codes%rowtype;
  requester_partner_id uuid;
  creator_partner_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if length(normalized_code) <> 10 then
    raise exception 'That connection code is invalid or has expired';
  end if;

  select * into connection_record
  from public.partner_connection_codes
  where code_hash = digest(normalized_code, 'sha256')
    and used_at is null
    and expires_at > now()
  for update;

  if not found or connection_record.creator_id = requesting_user_id then
    raise exception 'That connection code is invalid or has expired';
  end if;

  -- Lock both profiles in a stable order before checking or changing either
  -- relationship, preventing concurrent links from creating a partial pair.
  perform id
  from public.profiles
  where id in (requesting_user_id, connection_record.creator_id)
  order by id
  for update;

  select partner_id into requester_partner_id
  from public.profiles where id = requesting_user_id;
  select partner_id into creator_partner_id
  from public.profiles where id = connection_record.creator_id;

  if requester_partner_id is not null or creator_partner_id is not null then
    raise exception 'One of these accounts is already connected';
  end if;

  perform set_config('game_presence.partner_link_change', 'allowed', true);
  update public.profiles set partner_id = connection_record.creator_id where id = requesting_user_id;
  update public.profiles set partner_id = requesting_user_id where id = connection_record.creator_id;
  update public.partner_connection_codes
  set used_at = now(), redeemed_by = requesting_user_id
  where id = connection_record.id;

  return query
  select id, display_name, email
  from public.profiles
  where id = connection_record.creator_id;
end;
$$;

create or replace function public.disconnect_partner()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  existing_partner_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select partner_id into existing_partner_id
  from public.profiles
  where id = requesting_user_id;

  if existing_partner_id is null then
    return;
  end if;

  perform id
  from public.profiles
  where id in (requesting_user_id, existing_partner_id)
  order by id
  for update;

  perform set_config('game_presence.partner_link_change', 'allowed', true);
  update public.profiles set partner_id = null where id = requesting_user_id;
  update public.profiles
  set partner_id = null
  where id = existing_partner_id and partner_id = requesting_user_id;
end;
$$;

revoke all on table public.partner_connection_codes from anon, authenticated;
revoke all on function public.create_partner_connection_code() from public;
revoke all on function public.redeem_partner_connection_code(text) from public;
revoke all on function public.disconnect_partner() from public;
grant execute on function public.create_partner_connection_code() to authenticated;
grant execute on function public.redeem_partner_connection_code(text) to authenticated;
grant execute on function public.disconnect_partner() to authenticated;
