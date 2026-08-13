-- Migration 027: Dedupe content_reports + reject empty report reasons
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

ALTER TABLE content_reports
  ADD CONSTRAINT content_reports_unique_report UNIQUE (reporter_id, target_type, target_id);

CREATE OR REPLACE FUNCTION public.report_content(p_target_type TEXT, p_target_id UUID, p_reason TEXT)
RETURNS content_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row content_reports;
  v_reason TEXT;
BEGIN
  IF p_target_type NOT IN ('post', 'response', 'profile', 'username') THEN
    RAISE EXCEPTION 'INVALID_TARGET_TYPE:%', p_target_type;
  END IF;

  v_reason := trim(coalesce(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'EMPTY_REASON';
  END IF;

  INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
  VALUES (auth.uid(), p_target_type, p_target_id, v_reason)
  ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM content_reports
    WHERE reporter_id = auth.uid() AND target_type = p_target_type AND target_id = p_target_id;
  END IF;

  RETURN v_row;
END;
$$;
