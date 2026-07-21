-- ============================================================================
-- Playoff scoring v3 — same matchup/score/progressor model as v2, but the
-- NO_MATCHUP tier now rewards getting BOTH the winner and the scoreline:
--
--   matchup:     score+prog → 5, score → 3, prog → 2, else 0   (unchanged)
--   NOT matchup: score+prog → 4, score OR prog → 2, else 0     (was: 2/0)
--
-- Supersedes the function in 20260701_playoff_scoring_v2.sql. Applies to EVERY
-- round: R32 (slot teams), R16→Final (feeder winners), and the THIRD-place match
-- (feeder LOSERS — fixes a v2 bug where it used the SF winners). Scoring still
-- keys off the 90-min home_score/away_score (ET/pens are display-only). Markers
-- SCORING:<path>=<n> are validated by scripts/check-playoff-points-sync.ts.
--
-- Run THIS first, then 20260703_recalculate_points.sql. Supabase SQL editor only.
-- ============================================================================

-- Helper: the team a user predicted to WIN a given match_code (NULL if no pick).
CREATE OR REPLACE FUNCTION _pp_pred_winner(p_user UUID, p_code TEXT)
RETURNS UUID AS $$
  SELECT p.predicted_winner_id
  FROM playoff_predictions p
  JOIN playoff_matches m ON m.id = p.match_id
  WHERE p.user_id = p_user AND m.match_code = p_code
  LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION calculate_playoff_points(p_match_id UUID)
RETURNS void AS $$
DECLARE
  v_match    playoff_matches%ROWTYPE;
  v_pred     playoff_predictions%ROWTYPE;
  v_points   INT;
  v_feeder1  TEXT;
  v_feeder2  TEXT;
  v_uhome    UUID;   -- user's predicted home team for this match
  v_uaway    UUID;   -- user's predicted away team for this match
  v_matchup  BOOLEAN;
  v_score    BOOLEAN;
  v_prog     BOOLEAN;
  v_flipped  BOOLEAN;
BEGIN
  SELECT * INTO v_match FROM playoff_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Feeder match_codes for this slot (R16+). R32 are leaves → NULL feeders.
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
    -- The user's two predicted teams for this match, in their home/away order.
    IF v_match.match_code = 'THIRD_M01' THEN
      -- The bronze match is the SF LOSERS (not winners). A user's predicted
      -- third-place team = the SF participant they did NOT pick to win. SF
      -- participants are the user's QF winner picks.
      v_uhome := CASE
        WHEN _pp_pred_winner(v_pred.user_id, 'SF_M01') = _pp_pred_winner(v_pred.user_id, 'QF_M01')
          THEN _pp_pred_winner(v_pred.user_id, 'QF_M02')
        ELSE _pp_pred_winner(v_pred.user_id, 'QF_M01')
      END;
      v_uaway := CASE
        WHEN _pp_pred_winner(v_pred.user_id, 'SF_M02') = _pp_pred_winner(v_pred.user_id, 'QF_M03')
          THEN _pp_pred_winner(v_pred.user_id, 'QF_M04')
        ELSE _pp_pred_winner(v_pred.user_id, 'QF_M03')
      END;
    ELSIF v_feeder1 IS NULL THEN
      v_uhome := v_match.home_team_id;  -- R32: slot teams are the actual teams
      v_uaway := v_match.away_team_id;
    ELSE
      v_uhome := _pp_pred_winner(v_pred.user_id, v_feeder1);
      v_uaway := _pp_pred_winner(v_pred.user_id, v_feeder2);
    END IF;

    -- MATCHUP_MATCHES — set equality (order independent).
    v_matchup := (v_uhome IS NOT NULL AND v_uaway IS NOT NULL
      AND v_match.home_team_id IS NOT NULL AND v_match.away_team_id IS NOT NULL
      AND (
        (v_uhome = v_match.home_team_id AND v_uaway = v_match.away_team_id) OR
        (v_uhome = v_match.away_team_id AND v_uaway = v_match.home_team_id)
      ));

    -- PROGRESSOR_MATCHES.
    v_prog := (v_pred.predicted_winner_id IS NOT NULL
      AND v_pred.predicted_winner_id = v_match.winner_team_id);

    -- SCORE_MATCHES.
    v_score := FALSE;
    IF v_pred.predicted_home_score IS NOT NULL AND v_pred.predicted_away_score IS NOT NULL
       AND v_match.home_score IS NOT NULL AND v_match.away_score IS NOT NULL THEN
      IF v_matchup THEN
        v_flipped := (v_uhome = v_match.away_team_id);
        IF v_flipped THEN
          v_score := (v_pred.predicted_home_score = v_match.away_score
                  AND v_pred.predicted_away_score = v_match.home_score);
        ELSE
          v_score := (v_pred.predicted_home_score = v_match.home_score
                  AND v_pred.predicted_away_score = v_match.away_score);
        END IF;
      ELSE
        v_score := (LEAST(v_pred.predicted_home_score, v_pred.predicted_away_score)
                      = LEAST(v_match.home_score, v_match.away_score)
                AND GREATEST(v_pred.predicted_home_score, v_pred.predicted_away_score)
                      = GREATEST(v_match.home_score, v_match.away_score));
      END IF;
    END IF;

    -- Highest applicable tier only.
    IF v_matchup THEN
      IF v_score AND v_prog THEN
        v_points := 5; -- SCORING:MATCHUP_MATCHES.SCORE_AND_PROGRESSOR=5
      ELSIF v_score THEN
        v_points := 3; -- SCORING:MATCHUP_MATCHES.SCORE_ONLY=3
      ELSIF v_prog THEN
        v_points := 2; -- SCORING:MATCHUP_MATCHES.PROGRESSOR_ONLY=2
      ELSE
        v_points := 0; -- SCORING:MATCHUP_MATCHES.NONE=0
      END IF;
    ELSE
      IF v_score AND v_prog THEN
        v_points := 4; -- SCORING:NO_MATCHUP.SCORE_AND_PROGRESSOR=4
      ELSIF v_score OR v_prog THEN
        v_points := 2; -- SCORING:NO_MATCHUP.SCORE_OR_PROGRESSOR=2
      ELSE
        v_points := 0; -- SCORING:NO_MATCHUP.NONE=0
      END IF;
    END IF;

    UPDATE playoff_predictions SET points_awarded = v_points WHERE id = v_pred.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
