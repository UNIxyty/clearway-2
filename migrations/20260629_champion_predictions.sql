-- ============================================================================
-- World Champion prediction: table + RLS + scoring RPC.
-- Run order: run this AFTER 20260629_new_playoff_scoring.sql.
-- Run this in the Supabase SQL editor (do NOT run from app code).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pickem_champion_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  competition_id UUID REFERENCES pickem_competitions(id) ON DELETE CASCADE,
  predicted_team_id UUID REFERENCES pickem_teams(id),
  points_awarded INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, competition_id)
);

ALTER TABLE pickem_champion_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own champion prediction"
  ON pickem_champion_predictions FOR ALL TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all champion predictions"
  ON pickem_champion_predictions FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'is_admin' = 'true'));

-- RPC to calculate champion points after the FINAL result is published.
CREATE OR REPLACE FUNCTION calculate_champion_points(p_competition_id UUID)
RETURNS void AS $$
DECLARE
  v_champion_id UUID;
  v_pred pickem_champion_predictions%ROWTYPE;
BEGIN
  -- Winner of the FINAL match. NOTE: playoff_matches has no competition_id column
  -- (single-competition bracket), so we select the FINAL row directly.
  SELECT winner_team_id INTO v_champion_id
  FROM playoff_matches
  WHERE round = 'FINAL'
  LIMIT 1;

  IF v_champion_id IS NULL THEN
    RAISE EXCEPTION 'Final match has no winner set yet';
  END IF;

  FOR v_pred IN
    SELECT * FROM pickem_champion_predictions
    WHERE competition_id = p_competition_id
  LOOP
    UPDATE pickem_champion_predictions
    SET points_awarded = CASE
      WHEN v_pred.predicted_team_id = v_champion_id THEN 6 -- SCORING:WORLD_CHAMPION=6
      ELSE 0
    END,
    updated_at = NOW()
    WHERE id = v_pred.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
