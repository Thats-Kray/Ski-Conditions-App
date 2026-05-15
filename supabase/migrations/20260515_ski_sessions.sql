-- ─────────────────────────────────────────────────────────────────────────────
-- Ski Sessions — tracks individual logged ski days for the leaderboard
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.ski_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  resort_name      text not null,
  session_date     date not null,
  trip_id          uuid references public.ski_trips(id) on delete set null,
  is_powder_day    boolean not null default false,
  notes            text,
  -- Strava fields — null until Phase 2 integration
  strava_activity_id bigint unique,
  vertical_feet    int,
  miles_skied      numeric(8,2),
  top_speed_mph    numeric(5,1),
  moving_time_secs int,
  created_at       timestamptz not null default now(),
  -- one session per user per day per resort
  unique (user_id, session_date, resort_name)
);

alter table public.ski_sessions enable row level security;

-- Users can read their own sessions
create policy "users can view own sessions"
  on public.ski_sessions for select
  using (user_id = auth.uid());

-- Friends can see each other's sessions (for leaderboard)
create policy "friends can view sessions"
  on public.ski_sessions for select
  using (
    exists (
      select 1 from public.friendships
      where status = 'accepted'
        and (
          (requester_id = auth.uid() and addressee_id = ski_sessions.user_id)
          or
          (addressee_id = auth.uid() and requester_id = ski_sessions.user_id)
        )
    )
  );

-- Users can log their own sessions
create policy "users can insert own sessions"
  on public.ski_sessions for insert
  with check (user_id = auth.uid());

-- Users can update their own sessions
create policy "users can update own sessions"
  on public.ski_sessions for update
  using (user_id = auth.uid());

-- Users can delete their own sessions
create policy "users can delete own sessions"
  on public.ski_sessions for delete
  using (user_id = auth.uid());

-- Indexes
create index if not exists ski_sessions_user_id_idx  on public.ski_sessions(user_id);
create index if not exists ski_sessions_date_idx     on public.ski_sessions(session_date desc);
create index if not exists ski_sessions_season_idx   on public.ski_sessions(user_id, session_date);
