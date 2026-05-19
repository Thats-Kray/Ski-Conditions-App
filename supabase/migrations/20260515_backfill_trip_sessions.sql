-- Backfill ski_sessions for trip hosts (past trips)
-- Host implicitly attended their own trip
insert into ski_sessions (user_id, resort_name, session_date, trip_id)
select
  t.host_id,
  t.resort_key,
  t.ski_date,
  t.id
from ski_trips t
where t.ski_date <= current_date
  and t.resort_key is not null
  and t.ski_date    is not null
on conflict (user_id, session_date, resort_name) do nothing;

-- Backfill ski_sessions for "going" RSVPs (past trips)
insert into ski_sessions (user_id, resort_name, session_date, trip_id)
select
  r.user_id,
  t.resort_key,
  t.ski_date,
  t.id
from trip_rsvps r
join ski_trips t on t.id = r.trip_id
where r.status = 'going'
  and t.ski_date <= current_date
  and t.resort_key is not null
  and t.ski_date    is not null
on conflict (user_id, session_date, resort_name) do nothing;
