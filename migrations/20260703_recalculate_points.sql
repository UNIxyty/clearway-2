-- ============================================================================
-- Recalculate after the NO_MATCHUP scoring change (v3). Run AFTER
-- 20260703_playoff_scoring_v3.sql. Supabase SQL editor only.
-- ============================================================================

DO $$
DECLARE v_match_id UUID;
BEGIN
  FOR v_match_id IN
    SELECT id FROM playoff_matches
    WHERE home_score IS NOT NULL AND winner_team_id IS NOT NULL
  LOOP
    PERFORM calculate_playoff_points(v_match_id);
  END LOOP;
END $$;
