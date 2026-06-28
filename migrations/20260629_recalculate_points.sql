-- ============================================================================
-- One-time recalculation after the scoring rules changed. Run AFTER
-- 20260629_new_playoff_scoring.sql and 20260629_champion_predictions.sql.
-- Run this in the Supabase SQL editor (do NOT run from app code).
-- ============================================================================

-- 1) Re-score every published playoff match with the new tiered logic.
DO $$
DECLARE
  v_match_id UUID;
BEGIN
  FOR v_match_id IN
    SELECT id FROM playoff_matches
    WHERE home_score IS NOT NULL
      AND winner_team_id IS NOT NULL
  LOOP
    PERFORM calculate_playoff_points(v_match_id);
  END LOOP;
END $$;

-- 2) Award champion points IF the FINAL already has a winner. Safe no-op-ish:
--    skips (with a notice) when the Final hasn't been played yet.
DO $$
DECLARE
  v_comp UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM playoff_matches WHERE round = 'FINAL' AND winner_team_id IS NOT NULL) THEN
    FOR v_comp IN SELECT DISTINCT competition_id FROM pickem_champion_predictions LOOP
      PERFORM calculate_champion_points(v_comp);
    END LOOP;
  ELSE
    RAISE NOTICE 'Final not decided yet — champion points will be calculated on publish.';
  END IF;
END $$;
