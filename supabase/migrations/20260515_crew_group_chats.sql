-- ─────────────────────────────────────────────────────────────────────────────
-- Crew Group Chats
-- Tables: crews, crew_members, crew_messages
-- ─────────────────────────────────────────────────────────────────────────────

-- ── crews (table + non-cross-referencing policies) ───────────────────────────

create table if not exists public.crews (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  emoji        text not null default '🎿',
  description  text,
  invite_only  boolean not null default false,
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.crews enable row level security;

create policy "authenticated users can create crews"
  on public.crews for insert
  with check (auth.uid() = created_by);

create policy "crew admin can update crew"
  on public.crews for update
  using (created_by = auth.uid());

create policy "crew admin can delete crew"
  on public.crews for delete
  using (created_by = auth.uid());


-- ── crew_members ─────────────────────────────────────────────────────────────

create table if not exists public.crew_members (
  id        uuid primary key default gen_random_uuid(),
  crew_id   uuid not null references public.crews(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (crew_id, user_id)
);

alter table public.crew_members enable row level security;

create policy "crew members can view members"
  on public.crew_members for select
  using (
    exists (
      select 1 from public.crew_members as cm
      where cm.crew_id = crew_members.crew_id
        and cm.user_id = auth.uid()
    )
  );

create policy "crew admin can insert members"
  on public.crew_members for insert
  with check (
    user_id = auth.uid()
    or
    exists (
      select 1 from public.crew_members as cm
      where cm.crew_id = crew_members.crew_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    )
  );

create policy "crew members can delete themselves or admin can remove"
  on public.crew_members for delete
  using (
    user_id = auth.uid()
    or
    exists (
      select 1 from public.crew_members as cm
      where cm.crew_id = crew_members.crew_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    )
  );


-- ── crews SELECT policy (added after crew_members exists) ────────────────────

create policy "crew members can view crew"
  on public.crews for select
  using (
    exists (
      select 1 from public.crew_members
      where crew_members.crew_id = crews.id
        and crew_members.user_id = auth.uid()
    )
  );


-- ── crew_messages ─────────────────────────────────────────────────────────────

create table if not exists public.crew_messages (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references public.crews(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

alter table public.crew_messages enable row level security;

create policy "crew members can read messages"
  on public.crew_messages for select
  using (
    exists (
      select 1 from public.crew_members
      where crew_members.crew_id = crew_messages.crew_id
        and crew_members.user_id = auth.uid()
    )
  );

create policy "crew members can send messages"
  on public.crew_messages for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.crew_members
      where crew_members.crew_id = crew_messages.crew_id
        and crew_members.user_id = auth.uid()
    )
  );

create policy "users can delete own messages"
  on public.crew_messages for delete
  using (user_id = auth.uid());


-- ── Realtime ──────────────────────────────────────────────────────────────────
-- If these fail, enable manually: Database → Replication → supabase_realtime

alter publication supabase_realtime add table public.crew_messages;
alter publication supabase_realtime add table public.crew_members;


-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists crew_members_user_id_idx  on public.crew_members(user_id);
create index if not exists crew_members_crew_id_idx  on public.crew_members(crew_id);
create index if not exists crew_messages_crew_id_idx on public.crew_messages(crew_id);
create index if not exists crew_messages_created_idx on public.crew_messages(crew_id, created_at desc);
