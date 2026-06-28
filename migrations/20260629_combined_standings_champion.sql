-- ============================================================================
-- Update pickem_combined_standings to include World Champion points.
-- Supersedes the playoff/total columns in 20260626_combined_standings_view.sql.
-- Run this in the Supabase SQL editor (do NOT run from app code).
--
-- Changes vs the prior view:
--   * LEFT JOIN pickem_champion_predictions → champion_points column.
--   * total_points and rank now add champion_points.
-- group_points still EXCLUDES r32_projection (unchanged).
-- ============================================================================

CREATE OR REPLACE VIEW pickem_combined_standings AS
SELECT
  u.id AS user_id,
  u.email,
  up.display_name,
  COALESCE(ledger.group_points, 0)            AS group_points,
  COALESCE(ledger.r32_projection_points, 0)   AS r32_projection_points,
  COALESCE(playoff.r32_points, 0)             AS r32_points,
  COALESCE(playoff.r16_points, 0)             AS r16_points,
  COALESCE(playoff.qf_points, 0)              AS qf_points,
  COALESCE(playoff.sf_points, 0)              AS sf_points,
  COALESCE(playoff.final_points, 0)           AS final_points,
  COALESCE(playoff.exact_bonus_points, 0)     AS exact_bonus_points,
  COALESCE(playoff.total_playoff_points, 0)   AS playoff_points,
  COALESCE(champ.champion_points, 0)          AS champion_points,
  COALESCE(ledger.group_points, 0)
    + COALESCE(ledger.r32_projection_points, 0)
    + COALESCE(playoff.total_playoff_points, 0)
    + COALESCE(champ.champion_points, 0)        AS total_points,
  RANK() OVER (ORDER BY (
    COALESCE(ledger.group_points, 0)
    + COALESCE(ledger.r32_projection_points, 0)
    + COALESCE(playoff.total_playoff_points, 0)
    + COALESCE(champ.champion_points, 0)
  ) DESC) AS rank
FROM auth.users u
LEFT JOIN user_preferences up ON up.user_id = u.id
LEFT JOIN (
  SELECT
    user_id,
    SUM(CASE WHEN source_type IN ('group_position','match_outcome','match_score') THEN points ELSE 0 END) AS group_points,
    SUM(CASE WHEN source_type = 'r32_projection' THEN points ELSE 0 END) AS r32_projection_points
  FROM pickem_points_ledger
  GROUP BY user_id
) ledger ON ledger.user_id = u.id
LEFT JOIN (
  SELECT
    pp.user_id,
    SUM(pp.points_awarded) AS total_playoff_points,
    -- per-round "winner base" = correct winners × 2 (flat winner value);
    -- the remainder of points_awarded is folded into exact_bonus_points.
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
  UNION
  SELECT DISTINCT user_id FROM playoff_predictions
  UNION
  SELECT DISTINCT user_id FROM pickem_champion_predictions
);

GRANT SELECT ON pickem_combined_standings TO service_role, authenticated;
