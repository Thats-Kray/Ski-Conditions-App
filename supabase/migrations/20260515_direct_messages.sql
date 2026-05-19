-- 1:1 direct messages between friends

create table if not exists direct_messages (
  id            uuid        primary key default gen_random_uuid(),
  sender_id     uuid        not null references profiles(id) on delete cascade,
  recipient_id  uuid        not null references profiles(id) on delete cascade,
  content       text        not null check (char_length(content) between 1 and 1000),
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  constraint no_self_dm check (sender_id <> recipient_id)
);

create index if not exists dm_sender_idx    on direct_messages (sender_id,    created_at desc);
create index if not exists dm_recipient_idx on direct_messages (recipient_id, created_at desc);

alter table direct_messages enable row level security;

create policy "dm_select"    on direct_messages for select using     (auth.uid() in (sender_id, recipient_id));
create policy "dm_insert"    on direct_messages for insert with check (auth.uid() = sender_id);
create policy "dm_mark_read" on direct_messages for update using     (auth.uid() = recipient_id)
                                                with check            (auth.uid() = recipient_id);
