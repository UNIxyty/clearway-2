-- ============================================================================
-- NEW playoff scoring (tiered by whether BOTH real teams were user-predicted).
-- Supersedes 20260619_flat_playoff_points.sql.
--
-- Per prediction on a published match:
--   winner_correct = predicted_winner_id = winner_team_id
--   exact          = predicted scores = actual scores
--   both_teams     = did the user predict BOTH teams would be in this match?
--                    R32 : they earned an r32_projection ledger point for this
--                          slot (source_id = match_code, points > 0) — i.e.
--                          computeUserPredictedR32 produced this exact pair.
--                    R16+: they correctly predicted the winner of BOTH feeder
--                          matches (so both teams here are teams they advanced).
--
-- Points (the `SCORING:` markers are parsed by scripts/check-playoff-points-sync.ts
-- and MUST equal lib/playoffs/scoring-constants.ts):
--   both_teams:    winner+exact=5, exact-only=3, winner-only=2
--   one/no teams:  winner+exact=4, exact-only=2, winner-only=2
--
-- Example: real R16_M01 = Germany 2–1 Algeria, winner Germany.
--   User A predicted Germany to win R32_M01 AND Algeria to win R32_M02 (both
--   feeder winners correct) → both_teams = true. They picked Germany 2–1 →
--   winner+exact → 5 pts.
--   User B only picked Germany to win here (wrong/var feeders) → one/no tier,
--   winner-only → 2 pts.
--
-- Run order: run THIS first, then 20260629_recalculate_points.sql.
-- Run this in the Supabase SQL editor (do NOT run from app code).
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_playoff_points(p_match_id UUID)
RETURNS void AS $$
DECLARE
  v_match    playoff_matches%ROWTYPE;
  v_pred     playoff_predictions%ROWTYPE;
  v_points   INT;
  v_winner   BOOLEAN;
  v_exact    BOOLEAN;
  v_both     BOOLEAN;
  v_feeder1  TEXT;
  v_feeder2  TEXT;
BEGIN
  SELECT * INTO v_match FROM playoff_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Feeder match_codes for this slot (R16+). R32 are leaves → no feeders.
  v_feeder1 := NULL; v_feeder2 := NULL;
  CASE v_match.match_code
    WHEN 'R16_M01' THEN v_feeder1 := 'R32_M01'; v_feeder2 := 'R32_M02';
    WHEN 'R16_M02' THEN v_feeder1 := 'R32_M03'; v_feeder2 := 'R32_M04';
    WHEN 'R16_M03' THEN v_feeder1 := 'R32_M05'; v_feeder2 := 'R32_M06';
    WHEN 'R16_M04' THEN v_feeder1 := 'R32_M07'; v_feeder2 := 'R32_M08';
    WHEN 'R16_M05' THEN v_feeder1 := 'R32_M09'; v_feeder2 := 'R32_M10';
    WHEN 'R16_M06' THEN v_feeder1 := 'R32_M11'; v_feeder2 := 'R32_M12';
    WHEN 'R16_M07' THEN v_feeder1 := 'R32_M13'; v_feeder2 := 'R32_M14';
    WHEN 'R16_M08' THEN v_feeder1 := 'R32_M15'; v_feeder2 := 'R32_M16';
    WHEN 'QF_M01'  THEN v_feeder1 := 'R16_M01'; v_feeder2 := 'R16_M02';
    WHEN 'QF_M02'  THEN v_feeder1 := 'R16_M03'; v_feeder2 := 'R16_M04';
    WHEN 'QF_M03'  THEN v_feeder1 := 'R16_M05'; v_feeder2 := 'R16_M06';
    WHEN 'QF_M04'  THEN v_feeder1 := 'R16_M07'; v_feeder2 := 'R16_M08';
    WHEN 'SF_M01'  THEN v_feeder1 := 'QF_M01';  v_feeder2 := 'QF_M02';
    WHEN 'SF_M02'  THEN v_feeder1 := 'QF_M03';  v_feeder2 := 'QF_M04';
    WHEN 'FINAL_M01' THEN v_feeder1 := 'SF_M01'; v_feeder2 := 'SF_M02';
    WHEN 'THIRD_M01' THEN v_feeder1 := 'SF_M01'; v_feeder2 := 'SF_M02';
    ELSE NULL;
  END CASE;

  FOR v_pred IN SELECT * FROM playoff_predictions WHERE match_id = p_match_id LOOP
    v_winner := (v_pred.predicted_winner_id IS NOT NULL
                 AND v_pred.predicted_winner_id = v_match.winner_team_id);
    v_exact  := (v_pred.predicted_home_score = v_match.home_score
                 AND v_pred.predicted_away_score = v_match.away_score);

    -- both-teams-match determination
    IF v_match.round = 'R32' THEN
      v_both := EXISTS (
        SELECT 1 FROM pickem_points_ledger l
        WHERE l.user_id = v_pred.user_id
          AND l.source_type = 'r32_projection'
          AND l.source_id = v_match.match_code
          AND l.points > 0
      );
    ELSIF v_feeder1 IS NOT NULL THEN
      v_both := (
        EXISTS (
          SELECT 1 FROM playoff_predictions p1
          JOIN playoff_matches m1 ON m1.id = p1.match_id
          WHERE p1.user_id = v_pred.user_id AND m1.match_code = v_feeder1
            AND m1.winner_team_id IS NOT NULL
            AND p1.predicted_winner_id = m1.winner_team_id
        )
        AND EXISTS (
          SELECT 1 FROM playoff_predictions p2
          JOIN playoff_matches m2 ON m2.id = p2.match_id
          WHERE p2.user_id = v_pred.user_id AND m2.match_code = v_feeder2
            AND m2.winner_team_id IS NOT NULL
            AND p2.predicted_winner_id = m2.winner_team_id
        )
      );
    ELSE
      v_both := FALSE;
    END IF;

    -- apply the tiered point values
    v_points := 0;
    IF v_both THEN
      IF v_winner AND v_exact THEN
        v_points := 5; -- SCORING:BOTH_TEAMS_MATCH.EXACT_SCORE_AND_WINNER=5
      ELSIF v_exact THEN
        v_points := 3; -- SCORING:BOTH_TEAMS_MATCH.EXACT_SCORE_ONLY=3
      ELSIF v_winner THEN
        v_points := 2; -- SCORING:BOTH_TEAMS_MATCH.WINNER_ONLY=2
      END IF;
    ELSE
      IF v_winner AND v_exact THEN
        v_points := 4; -- SCORING:ONE_OR_NO_TEAMS_MATCH.EXACT_SCORE_AND_WINNER=4
      ELSIF v_exact THEN
        v_points := 2; -- SCORING:ONE_OR_NO_TEAMS_MATCH.EXACT_SCORE_ONLY=2
      ELSIF v_winner THEN
        v_points := 2; -- SCORING:ONE_OR_NO_TEAMS_MATCH.WINNER_ONLY=2
      END IF;
    END IF;

    UPDATE playoff_predictions SET points_awarded = v_points WHERE id = v_pred.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
