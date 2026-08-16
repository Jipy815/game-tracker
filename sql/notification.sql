-- Notification queue migration. Run after sql/schema.sql.
create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed boolean not null default false,
  processed_at timestamptz,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text
);

alter table public.notification_queue add column if not exists status text;
alter table public.notification_queue add column if not exists attempts integer not null default 0;
alter table public.notification_queue add column if not exists next_attempt_at timestamptz not null default now();
alter table public.notification_queue add column if not exists claimed_at timestamptz;
alter table public.notification_queue add column if not exists last_error text;
update public.notification_queue
set status = case when processed then 'sent' else 'pending' end
where status is null;
alter table public.notification_queue alter column status set default 'pending';
alter table public.notification_queue alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_queue_status_check'
      and conrelid = 'public.notification_queue'::regclass
  ) then
    alter table public.notification_queue
      add constraint notification_queue_status_check
      check (status in ('pending', 'processing', 'sent', 'failed'));
  end if;
end;
$$;

create index if not exists notification_queue_ready_idx
  on public.notification_queue (next_attempt_at, created_at)
  where status in ('pending', 'failed');

create or replace function public.notify_on_presence_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or old.status is distinct from new.status
     or old.current_game is distinct from new.current_game then
    insert into public.notification_queue (payload)
    values (
      jsonb_build_object(
        'user_id', new.user_id,
        'status', new.status,
        'current_game', new.current_game,
        'started_at', new.started_at
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists presence_notify_trigger on public.presence;
create trigger presence_notify_trigger
  after insert or update on public.presence
  for each row execute procedure public.notify_on_presence_change();

-- Atomically claims ready rows so concurrent function invocations cannot send duplicates.
create or replace function public.claim_notification_queue(batch_size integer default 25)
returns setof public.notification_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with ready as (
    select id
    from public.notification_queue
    where (status = 'pending' or (status = 'failed' and attempts < 5))
      and next_attempt_at <= now()
    order by created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.notification_queue queue
  set status = 'processing',
      attempts = queue.attempts + 1,
      claimed_at = now(),
      last_error = null
  from ready
  where queue.id = ready.id
  returning queue.*;
end;
$$;

alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;
revoke all on function public.claim_notification_queue(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_queue(integer) to service_role;
