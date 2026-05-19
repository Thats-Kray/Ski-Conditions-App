-- Leaderboard RPC — runs as SECURITY DEFINER so it bypasses RLS and can
-- read any user's ski_sessions. Returns aggregated stats per user for the
-- requested season, filtered by mode: 'friends' (you + accepted friends)
-- or 'public' (all users with at least one session this season).

create or replace function public.get_leaderboard(
  p_start_year int,
  p_mode       text default 'friends'
)
returns table (
  id           uuid,
  full_name    text,
  username     text,
  avatar_url   text,
  skill_level  text,
  days         bigint,
  resorts      bigint,
  powder_days  bigint,
  vertical_ft  bigint,
  miles_ski    numeric,
  top_resort   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := (p_start_year || '-10-01')::date;
  v_to   date := ((p_start_year + 1) || '-05-31')::date;
begin
  if p_mode = 'public' then
    return query
      select
        p.id,
        p.full_name,
        p.username,
        p.avatar_url,
        p.skill_level,
        count(s.id)::bigint,
        count(distinct s.resort_name)::bigint,
        count(s.id) filter (where s.is_powder_day)::bigint,
        coalesce(sum(s.vertical_feet), 0)::bigint,
        coalesce(sum(s.miles_skied), 0)::numeric,
        (
          select s2.resort_name
          from ski_sessions s2
          where s2.user_id = p.id
            and s2.session_date between v_from and v_to
          group by s2.resort_name
          order by count(*) desc
          limit 1
        )
      from profiles p
      inner join ski_sessions s
        on s.user_id = p.id
        and s.session_date between v_from and v_to
      group by p.id, p.full_name, p.username, p.avatar_url, p.skill_level;

  else
    -- friends mode: current user + accepted friends (even with 0 days this season)
    return query
      select
        p.id,
        p.full_name,
        p.username,
        p.avatar_url,
        p.skill_level,
        count(s.id)::bigint,
        count(distinct s.resort_name)::bigint,
        count(s.id) filter (where s.is_powder_day)::bigint,
        coalesce(sum(s.vertical_feet), 0)::bigint,
        coalesce(sum(s.miles_skied), 0)::numeric,
        (
          select s2.resort_name
          from ski_sessions s2
          where s2.user_id = p.id
            and s2.session_date between v_from and v_to
          group by s2.resort_name
          order by count(*) desc
          limit 1
        )
      from profiles p
      left join ski_sessions s
        on s.user_id = p.id
        and s.session_date between v_from and v_to
      where p.id = auth.uid()
         or exists (
           select 1 from friend_requests fr
           where fr.status = 'accepted'
             and (
               (fr.requester_id = auth.uid() and fr.recipient_id = p.id)
               or
               (fr.recipient_id = auth.uid() and fr.requester_id = p.id)
             )
         )
      group by p.id, p.full_name, p.username, p.avatar_url, p.skill_level;
  end if;
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.get_leaderboard(int, text) to authenticated;
