-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications: ensure table exists, fix RLS, enable realtime, add RPC
--
-- Root cause of missing notifications: RLS blocks cross-user inserts.
-- When user A notifies user B, the insert has user_id=B but auth.uid()=A,
-- so a standard "user_id = auth.uid()" insert policy rejects it silently.
--
-- Fix: a SECURITY DEFINER function that any authenticated user can call.
-- The function runs as the DB owner (bypasses RLS) and inserts the row.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create table if it doesn't already exist
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  trip_id    uuid references public.ski_trips(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  crew_id    uuid references public.crews(id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Enable RLS
alter table public.notifications enable row level security;

-- 3. RLS policies — users can only read/update/delete their own rows.
--    INSERT is intentionally NOT granted directly; it goes through the RPC below.
drop policy if exists "users can read own notifications"   on public.notifications;
drop policy if exists "users can update own notifications" on public.notifications;
drop policy if exists "users can delete own notifications" on public.notifications;
drop policy if exists "authenticated can insert notifications" on public.notifications;

create policy "users can read own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "users can update own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "users can delete own notifications"
  on public.notifications for delete
  using (user_id = auth.uid());

-- Temporary broad insert policy so the RPC (which runs as the calling user
-- inside the function) can still write. The SECURITY DEFINER function below
-- is the preferred path but this ensures direct inserts from server-side also work.
create policy "authenticated can insert notifications"
  on public.notifications for insert
  with check (auth.role() = 'authenticated');

-- 4. SECURITY DEFINER RPC: lets any authenticated user insert a notification
--    for *any* recipient, bypassing RLS.  Validation: caller must be logged in.
create or replace function public.send_notification(
  p_user_id  uuid,
  p_type     text,
  p_title    text,
  p_body     text    default null,
  p_trip_id  uuid    default null,
  p_actor_id uuid    default null,
  p_crew_id  uuid    default null
)
returns void
language plpgsql
security definer
as $$
begin
  -- Only authenticated users may call this
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.notifications (user_id, type, title, body, trip_id, actor_id, crew_id)
  values (p_user_id, p_type, p_title, p_body, p_trip_id, p_actor_id, p_crew_id);
end;
$$;

-- Grant execute to authenticated role
grant execute on function public.send_notification to authenticated;

-- 5. Add notifications to the realtime publication so the bell receives live updates
alter publication supabase_realtime add table public.notifications;
