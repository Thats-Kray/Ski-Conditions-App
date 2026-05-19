-- Fix ski_sessions RLS: wrong table name (friendships → friend_requests)
-- and wrong column name (addressee_id → recipient_id).
-- Also add a policy so any authenticated user can read sessions for the
-- global leaderboard.

-- Drop the broken friends policy
drop policy if exists "friends can view sessions" on public.ski_sessions;

-- Recreate it pointing at the correct table and column
create policy "friends can view sessions"
  on public.ski_sessions for select
  using (
    exists (
      select 1 from public.friend_requests
      where status = 'accepted'
        and (
          (requester_id = auth.uid() and recipient_id = ski_sessions.user_id)
          or
          (recipient_id = auth.uid() and requester_id = ski_sessions.user_id)
        )
    )
  );

-- Allow any authenticated user to read all sessions (global leaderboard)
drop policy if exists "authenticated users can view all sessions" on public.ski_sessions;

create policy "authenticated users can view all sessions"
  on public.ski_sessions for select
  using (auth.uid() is not null);
