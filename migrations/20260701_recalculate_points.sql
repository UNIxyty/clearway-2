-- ============================================================================
-- One-time recalculation after the scoring rewrite (v2). Every existing
-- points_awarded was computed under the old tiers and is wrong. Run AFTER
-- 20260701_playoff_scoring_v2.sql. Supabase SQL editor only.
-- ============================================================================

-- 1) Re-score every published playoff match with the new function.
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

-- 2) Champion points are unchanged, but recompute if the Final is decided so the
--    combined standings stay consistent.
DO $$
DECLARE v_comp UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM playoff_matches WHERE round = 'FINAL' AND winner_team_id IS NOT NULL) THEN
    FOR v_comp IN SELECT DISTINCT competition_id FROM pickem_champion_predictions LOOP
      PERFORM calculate_champion_points(v_comp);
    END LOOP;
  ELSE
    RAISE NOTICE 'Final not decided yet — champion points unchanged.';
  END IF;
END $$;
