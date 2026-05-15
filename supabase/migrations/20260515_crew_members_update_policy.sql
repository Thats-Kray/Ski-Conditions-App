-- crew_members had no UPDATE policy, so acceptCrewInvite's status→active
-- update was silently blocked and the accepted crew never appeared in the list.

create policy "members can update own row"
  on public.crew_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
