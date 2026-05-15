-- Allow the crew creator to read their own crew immediately after insert,
-- before they've been added to crew_members.
create policy "crew creator can view own crew"
  on public.crews for select
  using (created_by = auth.uid());
