-- ─────────────────────────────────────────────────────────────────────────────
-- Crew invite notification flow
-- ─────────────────────────────────────────────────────────────────────────────

-- crew_id on notifications (so the bell knows which crew to act on)
alter table public.notifications
  add column if not exists crew_id uuid references public.crews(id) on delete cascade;

-- status on crew_members: pending = invited but not yet accepted
alter table public.crew_members
  add column if not exists status text not null default 'active'
  check (status in ('active', 'pending'));

-- is_system on crew_messages: "Kyle has entered the chat" style messages
alter table public.crew_messages
  add column if not exists is_system boolean not null default false;
