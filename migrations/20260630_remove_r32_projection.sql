-- ============================================================================
-- Remove the R32 projection feature from scoring + standings.
-- Supersedes 20260629_new_playoff_scoring.sql and the playoff/r32 columns of
-- 20260629_combined_standings_champion.sql.
-- Run this in the Supabase SQL editor (do NOT run from app code), in order.
--
-- The per-user R32 group projection is gone, so:
--   * calculate_playoff_points: R32 can no longer be a "both-teams" match (that
--     tier was derived from the r32_projection ledger, which no longer exists) →
--     R32 always uses the ONE_OR_NO tier. R16+ feeder logic is unchanged.
--   * combined standings view drops r32_projection_points entirely.
--   * all r32_projection ledger rows are deleted.
-- ============================================================================

-- 1) Re-define calculate_playoff_points without any r32_projection dependency.
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

  -- Feeder match_codes for this slot (R16+). R32 are leaves → no feeders, and
  -- with the projection feature removed R32 can never be a "both-teams" match.
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

    -- both-teams-match: R16+ only, when both feeder winners were predicted right.
    IF v_feeder1 IS NOT NULL THEN
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
      v_both := FALSE; -- R32 (and any leaf) is always one/no tier now
    END IF;

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

-- 2) Regenerate the combined standings view WITHOUT r32_projection_points.
CREATE OR REPLACE VIEW pickem_combined_standings AS
SELECT
  u.id AS user_id,
  u.email,
  up.display_name,
  COALESCE(ledger.group_points, 0)            AS group_points,
  COALESCE(playoff.r32_points, 0)             AS r32_points,
  COALESCE(playoff.r16_points, 0)             AS r16_points,
  COALESCE(playoff.qf_points, 0)              AS qf_points,
  COALESCE(playoff.sf_points, 0)              AS sf_points,
  COALESCE(playoff.final_points, 0)           AS final_points,
  COALESCE(playoff.exact_bonus_points, 0)     AS exact_bonus_points,
  COALESCE(playoff.total_playoff_points, 0)   AS playoff_points,
  COALESCE(champ.champion_points, 0)          AS champion_points,
  COALESCE(ledger.group_points, 0)
    + COALESCE(playoff.total_playoff_points, 0)
    + COALESCE(champ.champion_points, 0)        AS total_points,
  RANK() OVER (ORDER BY (
    COALESCE(ledger.group_points, 0)
    + COALESCE(playoff.total_playoff_points, 0)
    + COALESCE(champ.champion_points, 0)
  ) DESC) AS rank
FROM auth.users u
LEFT JOIN user_preferences up ON up.user_id = u.id
LEFT JOIN (
  SELECT
    user_id,
    -- group_points excludes r32_projection (which is being deleted anyway).
    SUM(CASE WHEN source_type IN ('group_position','match_outcome','match_score') THEN points ELSE 0 END) AS group_points
  FROM pickem_points_ledger
  GROUP BY user_id
) ledger ON ledger.user_id = u.id
LEFT JOIN (
  SELECT
    pp.user_id,
    SUM(pp.points_awarded) AS total_playoff_points,
    SUM(CASE WHEN pm.round = 'R32'              AND pp.predicted_winner_id = pm.winner_team_id THEN 2 ELSE 0 END) AS r32_points,
    SUM(CASE WHEN pm.round = 'R16'              AND pp.predicted_winner_id = pm.winner_team_id THEN 2 ELSE 0 END) AS r16_points,
    SUM(CASE WHEN pm.round = 'QF'               AND pp.predicted_winner_id = pm.winner_team_id THEN 2 ELSE 0 END) AS qf_points,
    SUM(CASE WHEN pm.round = 'SF'               AND pp.predicted_winner_id = pm.winner_team_id THEN 2 ELSE 0 END) AS sf_points,
    SUM(CASE WHEN pm.round IN ('FINAL','THIRD') AND pp.predicted_winner_id = pm.winner_team_id THEN 2 ELSE 0 END) AS final_points,
    SUM(GREATEST(pp.points_awarded
        - CASE WHEN pp.predicted_winner_id = pm.winner_team_id THEN 2 ELSE 0 END, 0)) AS exact_bonus_points
  FROM playoff_predictions pp
  JOIN playoff_matches pm ON pm.id = pp.match_id
  GROUP BY pp.user_id
) playoff ON playoff.user_id = u.id
LEFT JOIN (
  SELECT user_id, SUM(points_awarded) AS champion_points
  FROM pickem_champion_predictions
  GROUP BY user_id
) champ ON champ.user_id = u.id
WHERE u.id IN (
  SELECT DISTINCT user_id FROM pickem_points_ledger
  UNION SELECT DISTINCT user_id FROM playoff_predictions
  UNION SELECT DISTINCT user_id FROM pickem_champion_predictions
);

REVOKE ALL ON pickem_combined_standings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON pickem_combined_standings TO service_role;
ALTER VIEW pickem_combined_standings SET (security_invoker = true);

-- 3) Re-score every published playoff match under the updated function (so any
--    R32 rows scored under the old both-teams tier are corrected).
DO $$
DECLARE v_match_id UUID;
BEGIN
  FOR v_match_id IN
    SELECT id FROM playoff_matches WHERE home_score IS NOT NULL AND winner_team_id IS NOT NULL
  LOOP
    PERFORM calculate_playoff_points(v_match_id);
  END LOOP;
END $$;

-- 4) Delete all r32_projection points from the ledger, then verify none remain.
DELETE FROM pickem_points_ledger WHERE source_type = 'r32_projection';
SELECT COUNT(*) AS remaining_r32_projection_rows
FROM pickem_points_ledger WHERE source_type = 'r32_projection'; -- expected: 0
