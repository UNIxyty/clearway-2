-- ============================================================================
-- Record a penalty-shootout score (when a knockout is level after extra time).
--
-- Like ot_*_score, pen_*_score are DISPLAY ONLY and NEVER used by
-- calculate_playoff_points (which keys off the 90-min home_score/away_score). The
-- shootout only decides winner_team_id. NULL when there was no shootout.
--
-- Run in the Supabase SQL editor (do NOT run from app code).
-- ============================================================================

ALTER TABLE playoff_matches
  ADD COLUMN IF NOT EXISTS pen_home_score INT,
  ADD COLUMN IF NOT EXISTS pen_away_score INT;
