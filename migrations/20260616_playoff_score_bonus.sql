-- Update playoff point calculation:
-- score bonus +3 → +2 (to match "+1 +2" display in UI)
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
      v_points := v_points + 2;
    END IF;
    UPDATE playoff_predictions
      SET points_awarded = v_points
      WHERE id = v_pred.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
