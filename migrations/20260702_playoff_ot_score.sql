-- ============================================================================
-- Record the extra-time / final scoreline separately from the 90-minute score.
--
-- home_score / away_score remain the 90-MINUTE full-time score — this is what
-- calculate_playoff_points uses (a knockout drawn at 90 min that's decided in ET
-- must still score against the 90-min line, e.g. 2-2). ot_home_score /
-- ot_away_score hold the score AFTER extra time (before penalties), for display
-- only. NULL when the match didn't go to extra time.
--
-- Run in the Supabase SQL editor (do NOT run from app code).
-- ============================================================================

ALTER TABLE playoff_matches
  ADD COLUMN IF NOT EXISTS ot_home_score INT,
  ADD COLUMN IF NOT EXISTS ot_away_score INT;
