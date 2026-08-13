-- Migration 026: Trust Tier & Verification Infrastructure (Sprint 30)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS user_verification (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  oauth_provider    TEXT CHECK (oauth_provider IN ('google', 'facebook')),
  oauth_linked_at   TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  tier              INT NOT NULL DEFAULT 0,
  tier_updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES auth.users(id),
  target_type      TEXT NOT NULL CHECK (target_type IN ('post', 'response', 'profile', 'username')),
  target_id        UUID NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by      UUID REFERENCES auth.users(id),
  reviewed_at      TIMESTAMPTZ,
  resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS moderation_flags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id   UUID NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('openai_moderation', 'profanity_filter')),
  category     TEXT,
  score        NUMERIC,
  auto_held    BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_flags   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_verification' AND policyname='Users can read own verification row') THEN
    CREATE POLICY "Users can read own verification row" ON user_verification FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='content_reports' AND policyname='Users can read own reports') THEN
    CREATE POLICY "Users can read own reports" ON content_reports FOR SELECT TO authenticated
      USING (reporter_id = auth.uid());
  END IF;

  -- Deliberately no policies at all on moderation_flags (internal-only, no admin
  -- UI this sprint — written by the server's service-role client, which bypasses
  -- RLS) and no INSERT policies anywhere above — see Task 1's design notes.
END $$;

-- Tier-check helper, matching Sprint 29's SECURITY DEFINER pattern exactly.
CREATE OR REPLACE FUNCTION public.is_verified(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT tier >= 1 FROM user_verification WHERE user_id = check_user_id), false);
$$;

REVOKE ALL ON FUNCTION public.is_verified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified(UUID) TO authenticated;

-- Records an OAuth link and flips tier to 1 once both conditions are met.
-- Re-verifies against auth.identities — does not trust p_provider blindly.
CREATE OR REPLACE FUNCTION public.mark_oauth_linked(p_provider TEXT)
RETURNS user_verification
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row user_verification;
BEGIN
  IF p_provider NOT IN ('google', 'facebook') THEN
    RAISE EXCEPTION 'UNSUPPORTED_PROVIDER:%', p_provider;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = auth.uid() AND provider = p_provider
  ) THEN
    RAISE EXCEPTION 'OAUTH_NOT_LINKED:%', p_provider;
  END IF;

  INSERT INTO user_verification (user_id, oauth_provider, oauth_linked_at)
  VALUES (auth.uid(), p_provider, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET oauth_provider = EXCLUDED.oauth_provider,
        oauth_linked_at = EXCLUDED.oauth_linked_at
  RETURNING * INTO v_row;

  UPDATE user_verification
  SET tier = 1, tier_updated_at = NOW()
  WHERE user_id = auth.uid() AND tier < 1
    AND oauth_linked_at IS NOT NULL AND phone_verified_at IS NOT NULL
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM user_verification WHERE user_id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_oauth_linked(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_oauth_linked(TEXT) TO authenticated;

-- Records phone verification and flips tier to 1 once both conditions are met.
-- Re-verifies against auth.users.phone_confirmed_at — the client can't just
-- call this without actually completing verifyOtp(type: "phone_change") first.
CREATE OR REPLACE FUNCTION public.mark_phone_verified()
RETURNS user_verification
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row user_verification;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND phone_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PHONE_NOT_VERIFIED';
  END IF;

  INSERT INTO user_verification (user_id, phone_verified_at)
  VALUES (auth.uid(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET phone_verified_at = NOW()
  RETURNING * INTO v_row;

  UPDATE user_verification
  SET tier = 1, tier_updated_at = NOW()
  WHERE user_id = auth.uid() AND tier < 1
    AND oauth_linked_at IS NOT NULL AND phone_verified_at IS NOT NULL
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM user_verification WHERE user_id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_phone_verified() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_phone_verified() TO authenticated;

-- Generic reporting RPC. Insert-only — no downstream automation, matching spec A.5.
CREATE OR REPLACE FUNCTION public.report_content(p_target_type TEXT, p_target_id UUID, p_reason TEXT)
RETURNS content_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row content_reports;
BEGIN
  IF p_target_type NOT IN ('post', 'response', 'profile', 'username') THEN
    RAISE EXCEPTION 'INVALID_TARGET_TYPE:%', p_target_type;
  END IF;

  INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
  VALUES (auth.uid(), p_target_type, p_target_id, trim(p_reason))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.report_content(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_content(TEXT, UUID, TEXT) TO authenticated;

-- Server-side defense-in-depth for username profanity (client-side check in
-- Task 5 uses leo-profanity's much larger dictionary — this is a short,
-- obvious-offenders list, not meant to be exhaustive).
CREATE OR REPLACE FUNCTION public.contains_blocked_word(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'fuck','shit','bitch','cunt','nigger','nigga','faggot','retard','whore','slut'
    ]) AS blocked
    WHERE lower(p_text) LIKE '%' || blocked || '%'
  );
$$;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_not_profane
  CHECK (username IS NULL OR NOT public.contains_blocked_word(username));
