-- Playoff bracket tables for WC 2026 knockout stage

CREATE TABLE playoff_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_number INT NOT NULL,
  round TEXT NOT NULL,
  match_code TEXT NOT NULL UNIQUE,
  home_team_id UUID REFERENCES pickem_teams(id),
  away_team_id UUID REFERENCES pickem_teams(id),
  home_score INT,
  away_score INT,
  winner_team_id UUID REFERENCES pickem_teams(id),
  kickoff_at TIMESTAMPTZ,
  venue TEXT,
  city TEXT,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE playoff_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID REFERENCES playoff_matches(id) ON DELETE CASCADE,
  predicted_winner_id UUID REFERENCES pickem_teams(id),
  predicted_home_score INT,
  predicted_away_score INT,
  points_awarded INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, match_id)
);

ALTER TABLE playoff_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE playoff_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read playoff matches"
  ON playoff_matches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage playoff matches"
  ON playoff_matches FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM user_preferences WHERE is_admin = true));

CREATE POLICY "Users manage own playoff predictions"
  ON playoff_predictions FOR ALL TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all playoff predictions"
  ON playoff_predictions FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM user_preferences WHERE is_admin = true));

CREATE OR REPLACE FUNCTION calculate_playoff_points(p_match_id UUID)
RETURNS void AS $$
DECLARE
  v_match playoff_matches%ROWTYPE;
  v_pred playoff_predictions%ROWTYPE;
  v_points INT;
BEGIN
  SELECT * INTO v_match FROM playoff_matches WHERE id = p_match_id;
  FOR v_pred IN
    SELECT * FROM playoff_predictions WHERE match_id = p_match_id
  LOOP
    v_points := 0;
    IF v_pred.predicted_winner_id = v_match.winner_team_id THEN
      v_points := CASE v_match.round
        WHEN 'R32'   THEN 1
        WHEN 'R16'   THEN 2
        WHEN 'QF'    THEN 5
        WHEN 'SF'    THEN 8
        WHEN 'FINAL' THEN 10
        WHEN 'THIRD' THEN 3
        ELSE 0
      END;
    END IF;
    IF v_pred.predicted_home_score = v_match.home_score
       AND v_pred.predicted_away_score = v_match.away_score THEN
      v_points := v_points + 3;
    END IF;
    UPDATE playoff_predictions
      SET points_awarded = v_points
      WHERE id = v_pred.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
