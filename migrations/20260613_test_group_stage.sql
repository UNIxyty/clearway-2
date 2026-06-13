-- ============================================================
-- TEST: Fill group stage match results for WC2026
-- ============================================================
-- Run this to simulate all 72 group stage matches being finished.
-- Home team wins every match 2-0, producing clear group standings:
--   1st place: team with most home games → 9 pts
--   2nd place: second-most home wins   → 6 pts
--   3rd / 4th: proportionally fewer pts
-- After running, use the admin panel to seed playoff R32 teams.
-- ============================================================

BEGIN;

-- Step 1: Set actual match results for all group stage fixtures
UPDATE pickem_matches
SET
  home_score = 2,
  away_score = 0,
  status     = 'finished',
  updated_at = NOW()
WHERE competition_id = (
  SELECT id FROM pickem_competitions WHERE slug = 'wc-2026'
)
AND stage = 'group';

-- Verify update
SELECT
  group_code,
  COUNT(*)                                        AS total_matches,
  COUNT(*) FILTER (WHERE status = 'finished')    AS finished
FROM pickem_matches
WHERE competition_id = (SELECT id FROM pickem_competitions WHERE slug = 'wc-2026')
  AND stage = 'group'
GROUP BY group_code
ORDER BY group_code;

COMMIT;


-- ============================================================
-- OPTIONAL: Seed YOUR predictions to test the R32 draw page
-- ============================================================
-- Replace <YOUR_USER_ID> with your user UUID from:
--   Supabase → Authentication → Users → copy your user ID
--
-- This inserts "predict home wins 2-0" for every group match,
-- which lets the R32 draw page calculate your predicted qualifiers.
-- ============================================================

-- BEGIN;

-- INSERT INTO pickem_user_match_predictions
--   (user_id, competition_id, match_id,
--    predicted_home_score, predicted_away_score, predicted_outcome)
-- SELECT
--   '<YOUR_USER_ID>'::uuid,
--   m.competition_id,
--   m.id,
--   2,        -- predicted home score
--   0,        -- predicted away score
--   'home'    -- predicted outcome
-- FROM pickem_matches m
-- WHERE m.competition_id = (
--   SELECT id FROM pickem_competitions WHERE slug = 'wc-2026'
-- )
-- AND m.stage = 'group'
-- ON CONFLICT (user_id, match_id) DO UPDATE SET
--   predicted_home_score = EXCLUDED.predicted_home_score,
--   predicted_away_score = EXCLUDED.predicted_away_score,
--   predicted_outcome    = EXCLUDED.predicted_outcome;

-- SELECT COUNT(*) AS predictions_inserted
-- FROM pickem_user_match_predictions
-- WHERE user_id = '<YOUR_USER_ID>'::uuid
--   AND competition_id = (SELECT id FROM pickem_competitions WHERE slug = 'wc-2026');

-- COMMIT;
