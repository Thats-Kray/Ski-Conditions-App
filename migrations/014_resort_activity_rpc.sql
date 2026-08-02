-- Migration 014: Community activity signal — resort session counts
-- Run in Supabase SQL Editor.

create or replace function public.get_resort_activity_counts(from_date date)
returns table (resort_name text, session_count bigint)
language sql security definer set search_path = public
as $$
  select resort_name, count(*)::bigint as session_count
  from ski_sessions
  where session_date >= from_date
  group by resort_name;
$$;

grant execute on function public.get_resort_activity_counts(date) to authenticated;
