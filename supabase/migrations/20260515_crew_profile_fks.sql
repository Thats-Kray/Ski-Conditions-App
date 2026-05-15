-- PostgREST can only auto-resolve joins within the public schema.
-- crew_members.user_id and crew_messages.user_id reference auth.users (different schema),
-- so the profile:user_id(...) join fails. Adding FKs to public.profiles fixes this.

alter table public.crew_members
  add constraint crew_members_user_profile_fk
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.crew_messages
  add constraint crew_messages_user_profile_fk
  foreign key (user_id) references public.profiles(id) on delete cascade;
