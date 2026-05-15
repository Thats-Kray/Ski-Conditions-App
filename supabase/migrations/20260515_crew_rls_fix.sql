-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: infinite recursion in crew_members RLS policies
--
-- The self-referential SELECT policy on crew_members caused infinite recursion.
-- Replace all three crew_members policies with ones that use a security definer
-- helper function, which bypasses RLS when checking membership.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: returns the caller's role in a crew, or NULL if not a member.
-- SECURITY DEFINER skips RLS on the internal query, breaking the recursion.
create or replace function public.my_crew_role(p_crew_id uuid)
returns text
language sql
security definer
stable
as $$
  select role from public.crew_members
  where crew_id = p_crew_id and user_id = auth.uid()
  limit 1
$$;

-- Drop the recursive policies
drop policy if exists "crew members can view members"                        on public.crew_members;
drop policy if exists "crew admin can insert members"                        on public.crew_members;
drop policy if exists "crew members can delete themselves or admin can remove" on public.crew_members;

-- Recreate using the helper
create policy "crew members can view members"
  on public.crew_members for select
  using (public.my_crew_role(crew_id) is not null);

create policy "crew admin can insert members"
  on public.crew_members for insert
  with check (
    user_id = auth.uid()
    or public.my_crew_role(crew_id) = 'admin'
  );

create policy "crew members can delete themselves or admin can remove"
  on public.crew_members for delete
  using (
    user_id = auth.uid()
    or public.my_crew_role(crew_id) = 'admin'
  );
