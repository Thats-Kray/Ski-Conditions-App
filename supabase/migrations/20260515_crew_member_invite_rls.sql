-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: allow any active crew member to invite others (not just admin)
-- Also tighten my_crew_role() to only count active memberships so pending
-- invitees don't get full member privileges.
-- ─────────────────────────────────────────────────────────────────────────────

-- Update helper: only return a role for *active* members
create or replace function public.my_crew_role(p_crew_id uuid)
returns text
language sql
security definer
stable
as $$
  select role from public.crew_members
  where crew_id = p_crew_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1
$$;

-- Drop the admin-only insert policy and replace with any-active-member policy
drop policy if exists "crew admin can insert members" on public.crew_members;

create policy "crew members can insert members"
  on public.crew_members for insert
  with check (
    user_id = auth.uid()                          -- joining yourself
    or public.my_crew_role(crew_id) is not null   -- any active member can invite
  );
