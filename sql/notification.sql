-- Notification queue table and trigger to capture presence changes

create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamp with time zone default now(),
  processed boolean default false,
  processed_at timestamp with time zone
);

create or replace function public.notify_on_presence_change()
returns trigger language plpgsql as $$
begin
  -- insert a minimal payload for processing by Edge Function
  insert into public.notification_queue (payload)
  values (
    jsonb_build_object(
      'user_id', new.user_id,
      'status', new.status,
      'current_game', new.current_game,
      'started_at', to_json(new.started_at)
    )
  );
  return new;
end;
$$;

-- Create trigger on presence table
drop trigger if exists presence_notify_trigger on public.presence;
create trigger presence_notify_trigger
  after insert or update on public.presence
  for each row
  execute procedure public.notify_on_presence_change();

-- Grant select/update to Edge Function role if needed (managed via service role key)
-- Note: The Edge Function will use the Supabase service_role key to select and update the queue.
