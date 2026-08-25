-- Migration 037: Plan parties (Sprint 38)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- The calendar conflated two different things into one mountain card. Kyle, testing on two
-- accounts 2026-08-25: "multiple groups will go to the same mountain, but they typically stay
-- with their core crew, then link up with other friends' crews. If user 2 wasn't invited to a
-- plan, they can still go to the same mountain, but they should not automatically be added to
-- user 1's crew."
--
--   Which mountain you ski  -> not ownable, NEVER gated. The plan editor lets anyone pick any
--                              resort, so a gate here is bypassable in two taps and would mean
--                              asking permission to record your own weekend.
--   Who you ski WITH        -> ownable. Joining requires an invite or an approved request.
--
-- THE VISIBILITY RULE (Kyle, 2026-08-25). Sharing a party reveals that party's DATE only:
-- "they get to see user 3's plans for that specific ski plan. The rest of user 3's ski
-- plans/calendar are not visible, until they become friends." Hence in_my_party(other, DATE).
-- A one-argument shares_party_with(other) would be evaluated against the PERSON and would leak
-- user 3's entire calendar forever after one shared Saturday. Do not "simplify" it.
--
-- Private still wins against anyone you have not brought in: the party branch only matches
-- people actually in the party, and you cannot be in one without the owner inviting you or
-- approving your request.
--
-- WHY MEMBERSHIP IS A JOIN TABLE AND NOT daily_plans.party_id
--
-- upsertDailyPlan writes the whole row through one funnel (src/lib/planUpsert.js), and every
-- field it omits is at risk of being nulled -- that behaviour has already caused real bugs
-- (blanked ETAs, un-privated plans, Sprint 37 TASK 19.6). Putting party_id on daily_plans would
-- put party membership permanently in the blast radius of the most dangerous write path in this
-- codebase, where one forgotten field silently drops people out of their group. A separate
-- table cannot be touched by that upsert at all. It also matches the existing join-table idiom
-- (crew_members, trip_rsvps, ski_ping_recipients).
--
-- SELF-JOIN IS CLOSED BY DEFAULT. authenticated gets NO insert on plan_party_members; the only
-- way in is join_plan_party(), which verifies an accepted invite or request. This is migration
-- 034's lesson applied up front rather than after the hole ships: 034 exists because
-- crew_members let a user insert themselves into any crew_id.
--
-- SCOPE NOTE: this does NOT add the 'crews' visibility value or visible_crew_ids (TASK 19.1).
-- The policy is restructured as a whitelist so 19.1 is one extra OR branch later, but shipping
-- an authorization branch that no application code exercises means shipping a branch nobody has
-- tested. 19.1 lands with the UI that uses it.
--
-- VERIFIED AGAINST THE LIVE DATABASE before writing (2026-08-25):
--   daily_plans: 17 rows, 0 with group_id, 0 with visibility='groups', 1 private
--   the constraint really is named daily_plans_visibility_check
--   crew_invites has no crew_id column -- it is already a per-day ski invite
--
-- ROLLBACK, if anything breaks:
--   DROP POLICY IF EXISTS daily_plans_select_visible ON daily_plans;
--   CREATE POLICY daily_plans_select_visible ON daily_plans
--     FOR SELECT TO authenticated
--     USING (user_id = auth.uid() OR (visibility <> 'private'
--            AND (public.are_friends(user_id) OR public.shares_crew_with(user_id))));
--   ALTER TABLE daily_plans DROP CONSTRAINT IF EXISTS daily_plans_visibility_check;
--   ALTER TABLE daily_plans ADD CONSTRAINT daily_plans_visibility_check
--     CHECK (visibility IN ('friends','groups','private'));
--   DROP FUNCTION IF EXISTS public.join_plan_party(UUID);
--   DROP FUNCTION IF EXISTS public.in_my_party(UUID, DATE);
--   DROP FUNCTION IF EXISTS public.is_in_party(UUID);
--   DROP TABLE IF EXISTS plan_party_members;
--   DROP TABLE IF EXISTS plan_parties;
--   -- group_id is NOT restored by this rollback; it held 0 rows and pointed at a dead table.

BEGIN;

-- ── 1. The party ────────────────────────────────────────────────────────────
-- owner_id references profiles(id), matching daily_plans.user_id, so PostgREST can embed
-- profile:profiles(...) on a party the same way it already does on a plan.

CREATE TABLE IF NOT EXISTS public.plan_parties (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ski_date   DATE NOT NULL,
  name       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, ski_date)          -- you host at most one party per day
);

CREATE TABLE IF NOT EXISTS public.plan_party_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id  UUID NOT NULL REFERENCES public.plan_parties(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  -- Denormalised from plan_parties so in_my_party() can filter on date without a second
  -- join. Kept honest by the trigger below.
  ski_date  DATE NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (party_id, user_id),
  UNIQUE (user_id, ski_date)           -- you ski with ONE group per day
);

CREATE INDEX IF NOT EXISTS plan_party_members_user_date
  ON public.plan_party_members (user_id, ski_date);

-- The denormalised ski_date must always equal its party's, or the date scoping the whole
-- visibility rule rests on could be bypassed by writing a mismatched row.
CREATE OR REPLACE FUNCTION public.plan_party_members_sync_date()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT ski_date INTO NEW.ski_date FROM plan_parties WHERE id = NEW.party_id;
  IF NEW.ski_date IS NULL THEN
    RAISE EXCEPTION 'plan_party_members.party_id % does not exist', NEW.party_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_party_members_sync_date_trg ON public.plan_party_members;
CREATE TRIGGER plan_party_members_sync_date_trg
  BEFORE INSERT OR UPDATE ON public.plan_party_members
  FOR EACH ROW EXECUTE FUNCTION public.plan_party_members_sync_date();

-- ── 2. Helpers ──────────────────────────────────────────────────────────────
-- STABLE, not the default VOLATILE: a VOLATILE function cannot be inlined and re-runs per
-- candidate row inside the qual, defeating the daily_plans_date_range index (see 032:52-57).
-- SECURITY DEFINER so the policy never reads an RLS-protected relation inline, which is the
-- recursion class that 20260515_crew_rls_fix.sql and 022 exist to undo.

-- Are p_other and I in the same party ON p_date? The date argument is the entire point.
CREATE OR REPLACE FUNCTION public.in_my_party(p_other UUID, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM plan_party_members mine
    JOIN plan_party_members theirs ON theirs.party_id = mine.party_id
    WHERE mine.user_id    = auth.uid()
      AND mine.ski_date   = p_date
      AND theirs.user_id  = p_other
      AND theirs.ski_date = p_date
  );
$$;

CREATE OR REPLACE FUNCTION public.is_in_party(p_party_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM plan_parties       WHERE id = p_party_id AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM plan_party_members WHERE party_id = p_party_id AND user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.in_my_party(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_in_party(UUID)       FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.in_my_party(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_in_party(UUID)       TO authenticated;

-- ── 3. Joining is a function, never a client INSERT ─────────────────────────
-- Verifies an accepted crew_invites row in EITHER direction for this party's date:
--   the owner invited you       (inviter = owner, invitee = you)
--   you asked and they approved (inviter = you, invitee = owner, kind = 'request')

ALTER TABLE public.crew_invites
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'invite';

ALTER TABLE public.crew_invites DROP CONSTRAINT IF EXISTS crew_invites_kind_check;
ALTER TABLE public.crew_invites ADD CONSTRAINT crew_invites_kind_check
  CHECK (kind IN ('invite','request'));

CREATE OR REPLACE FUNCTION public.join_plan_party(p_party_id UUID)
RETURNS public.plan_party_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_party plan_parties;
  v_row   plan_party_members;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO v_party FROM plan_parties WHERE id = p_party_id;
  IF v_party IS NULL THEN
    RAISE EXCEPTION 'No such party';
  END IF;

  IF v_party.owner_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM crew_invites ci
    WHERE ci.status = 'accepted'
      AND ci.ski_date = v_party.ski_date
      AND (
        (ci.inviter_id = v_party.owner_id AND ci.invitee_id = auth.uid())
        OR
        (ci.inviter_id = auth.uid() AND ci.invitee_id = v_party.owner_id AND ci.kind = 'request')
      )
  ) THEN
    RAISE EXCEPTION 'You need an accepted invite or approved request to join this party';
  END IF;

  INSERT INTO plan_party_members (party_id, user_id, ski_date)
  VALUES (p_party_id, auth.uid(), v_party.ski_date)
  ON CONFLICT (user_id, ski_date)
  DO UPDATE SET party_id = EXCLUDED.party_id, joined_at = NOW()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.join_plan_party(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_plan_party(UUID) TO authenticated;

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
-- Unguarded DROP + CREATE, not the DO/IF NOT EXISTS form: per migration 021 the guarded form
-- silently skips and leaves a broken policy in place (032:94-95, 034:99-100).

ALTER TABLE public.plan_parties       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_party_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_parties_select ON public.plan_parties;
CREATE POLICY plan_parties_select ON public.plan_parties
  FOR SELECT TO authenticated USING (public.is_in_party(id));

DROP POLICY IF EXISTS plan_parties_insert_own ON public.plan_parties;
CREATE POLICY plan_parties_insert_own ON public.plan_parties
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS plan_parties_update_own ON public.plan_parties;
CREATE POLICY plan_parties_update_own ON public.plan_parties
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS plan_parties_delete_own ON public.plan_parties;
CREATE POLICY plan_parties_delete_own ON public.plan_parties
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS plan_party_members_select ON public.plan_party_members;
CREATE POLICY plan_party_members_select ON public.plan_party_members
  FOR SELECT TO authenticated USING (public.is_in_party(party_id));

-- You may leave, or be removed by the owner. There is deliberately NO INSERT policy:
-- join_plan_party() is the only way in.
DROP POLICY IF EXISTS plan_party_members_delete ON public.plan_party_members;
CREATE POLICY plan_party_members_delete ON public.plan_party_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM plan_parties p WHERE p.id = party_id AND p.owner_id = auth.uid())
  );

-- Belt and braces on top of "no INSERT policy": without table privileges a client cannot
-- insert or update membership even if a policy is added by mistake later.
REVOKE INSERT, UPDATE ON public.plan_party_members FROM authenticated;
REVOKE ALL ON public.plan_parties       FROM anon;
REVOKE ALL ON public.plan_party_members FROM anon;

-- ── 5. daily_plans: whitelist the policy, add the party branch ──────────────
-- The old policy keyed off `visibility <> 'private'` -- a BLACKLIST of one value, so any new
-- value would be readable by every friend and crewmate. Migration 032's own comments flagged
-- this. It is now a whitelist: only 'friends' is shared broadly.

DROP POLICY IF EXISTS daily_plans_select_visible ON public.daily_plans;

CREATE POLICY daily_plans_select_visible ON public.daily_plans
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    -- Party members see this ONE date, and only if they are actually in the party. This
    -- branch intentionally sits outside the visibility test: the owner invited them or
    -- approved their request, so they have already chosen to reveal that day.
    OR public.in_my_party(user_id, ski_date)
    OR (
      visibility = 'friends'
      AND (public.are_friends(user_id) OR public.shares_crew_with(user_id))
    )
  );

-- ── 6. Retire the dead 'groups' concept (TASK 18.1) ─────────────────────────
-- Verified live: 0 rows use group_id, 0 rows use visibility='groups'. group_id pointed at the
-- `groups` table, which has no code path.

ALTER TABLE public.daily_plans DROP COLUMN IF EXISTS group_id;

ALTER TABLE public.daily_plans DROP CONSTRAINT IF EXISTS daily_plans_visibility_check;
ALTER TABLE public.daily_plans ADD CONSTRAINT daily_plans_visibility_check
  CHECK (visibility IN ('friends','private'));

COMMIT;
