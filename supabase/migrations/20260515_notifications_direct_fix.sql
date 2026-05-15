-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICATION DIRECT FIX — paste this entire block into the Supabase SQL editor
-- It is safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop every INSERT policy on notifications (whatever names they have)
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where tablename = 'notifications' and schemaname = 'public' and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.notifications', r.policyname);
  end loop;
end $$;

-- 2. Allow any authenticated user to insert a notification for ANY recipient.
--    This is intentional: user A sends a notification to user B (cross-user).
create policy "authenticated can insert notifications"
  on public.notifications for insert
  with check (auth.uid() is not null);

-- 3. Add crew_id column if it doesn't already exist (safe idempotent alter)
alter table public.notifications
  add column if not exists crew_id uuid;

-- 4. Add realtime publication if not already there
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- 5. Quick verification — run this to confirm the policy was created:
--    select policyname, cmd from pg_policies where tablename = 'notifications';
--
-- 6. Manual test — replace with a real user UUID from auth.users:
--    insert into public.notifications (user_id, type, title, body)
--    values ('paste-recipient-uuid-here', 'test', 'Notification test ✅', 'You should see this in the bell');
