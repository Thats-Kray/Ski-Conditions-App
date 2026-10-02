-- Migration 049: Powder Alert SMS channel + delivery scheduling
--
-- Adds a channel choice (email vs SMS) and a day/time schedule to the existing
-- powder-alert preference (migration 015), plus a short-lived OTP table used to
-- verify a phone number before it can be used for SMS delivery.
--
-- ORDER OF OPERATIONS MATTERS — APPLY THIS BEFORE DEPLOYING THE BRANCH:
--   1. Run this whole file (ALTER, CREATE TABLE, and the GRANT) in the Supabase
--      SQL Editor.
--   2. NOTIFY pgrst, 'reload schema';
--   3. Only then deploy/push the frontend and server code.
-- Getting this order wrong breaks the app the same two ways migration 048 did:
--   * Code first, column absent: every profile save sends the new fields, so
--     EVERY save fails with PGRST204 ("column not found in schema cache").
--   * ALTER without the GRANT: migration 031 replaced profiles' table-level
--     SELECT with an explicit column list, so a new column is invisible to
--     authenticated/anon until explicitly granted — reads/RETURNING on these
--     columns fail with Postgres 42501 ("permission denied for column ...").
--
-- Only SELECT needs a column-level grant here — INSERT and UPDATE on
-- public.profiles are still table-level (031 only column-scoped SELECT), so
-- they cover new columns automatically.
--
-- ROLLBACK, if anything breaks:
--   ALTER TABLE profiles
--     DROP COLUMN IF EXISTS alert_channel,
--     DROP COLUMN IF EXISTS alert_phone_verified_at,
--     DROP COLUMN IF EXISTS alert_day_of_week,
--     DROP COLUMN IF EXISTS alert_time_slot;
--   DROP TABLE IF EXISTS alert_phone_otps;
--   (the column grants disappear with the columns)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS alert_channel TEXT NOT NULL DEFAULT 'email'
    CHECK (alert_channel IN ('email', 'sms')),
  ADD COLUMN IF NOT EXISTS alert_phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alert_day_of_week TEXT NOT NULL DEFAULT 'wed'
    CHECK (alert_day_of_week IN ('mon', 'tue', 'wed', 'thu', 'fri')),
  ADD COLUMN IF NOT EXISTS alert_time_slot TEXT NOT NULL DEFAULT 'morning'
    CHECK (alert_time_slot IN ('morning', 'midday', 'evening'));

GRANT SELECT (alert_channel, alert_phone_verified_at, alert_day_of_week, alert_time_slot)
  ON public.profiles TO authenticated, anon;

-- Short-lived OTP codes for verifying a phone number before it can be used for
-- SMS alerts. Deliberately separate from user_verification/mark_phone_verified
-- (migration 026) — that system verifies auth.users.phone for the account's
-- identity-trust tier, a different feature entirely. Conflating the two would
-- mean "where should your powder alert go" silently also changes login
-- behavior or identity tier.
CREATE TABLE IF NOT EXISTS alert_phone_otps (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS enabled with ZERO policies, same pattern as moderation_flags: every
-- access to this table goes through server/smsAlerts.js using the
-- service-role key, which bypasses RLS entirely. Enabling RLS with no
-- policies means that even if this table inherited anon/authenticated's
-- broad schema-wide default privileges (the still-open TASK 18.6 condition),
-- the default-deny behavior blocks every row operation for those roles
-- regardless. Not re-auditing TASK 18.6 here — this follows the existing,
-- already-verified-safe pattern for a new table.
ALTER TABLE alert_phone_otps ENABLE ROW LEVEL SECURITY;
