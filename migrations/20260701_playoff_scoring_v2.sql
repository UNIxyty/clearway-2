-- ============================================================================
-- Playoff scoring v2 — matchup/score/progressor model. Supersedes the function
-- in 20260630_remove_r32_projection.sql.
--
-- Per prediction, compute three booleans then award the HIGHEST applicable tier
-- (points NEVER stack within a match):
--
--   matchup    — SET{user's two predicted teams for this match} == SET{home,away}.
--                R32: the slot teams ARE the actual teams → always true for a
--                made prediction. R16+: the user's two teams = their predicted
--                winners of the two feeder matches (linkage below).
--   score      — full-time scoreline matches. If matchup: aligned per team
--                (flipped when the user's home team is the actual AWAY team). If
--                NOT matchup: order-independent raw pair (sorted pairs equal).
--   progressor — predicted_winner_id == winner_team_id.
--
--   matchup:     score+prog → 5, score → 3, prog → 2, else 0
--   not matchup: prog OR score → 2, else 0
--
-- Feeder linkage: there is NO feeder_match_id column on playoff_matches. The
-- bracket structure is implicit in match_code (R32_PAIRINGS / bracketData), so
-- the two feeders for each R16+ slot are encoded in the CASE below.
--
-- Markers `SCORING:<path>=<n>` are parsed by scripts/check-playoff-points-sync.ts
-- and MUST equal lib/playoffs/scoring-constants.ts.
--
-- Run THIS first, then 20260701_recalculate_points.sql. Supabase SQL editor only.
-- ============================================================================

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
    IF v_feeder1 IS NULL THEN
      v_uhome := v_match.home_team_id;  -- R32: slot teams are the actual teams
      v_uaway := v_match.away_team_id;
    ELSE
      SELECT p1.predicted_winner_id INTO v_uhome
        FROM playoff_predictions p1 JOIN playoff_matches m1 ON m1.id = p1.match_id
        WHERE p1.user_id = v_pred.user_id AND m1.match_code = v_feeder1;
      SELECT p2.predicted_winner_id INTO v_uaway
        FROM playoff_predictions p2 JOIN playoff_matches m2 ON m2.id = p2.match_id
        WHERE p2.user_id = v_pred.user_id AND m2.match_code = v_feeder2;
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
        -- Align per team: flip when the user's home team is the actual away team.
        v_flipped := (v_uhome = v_match.away_team_id);
        IF v_flipped THEN
          v_score := (v_pred.predicted_home_score = v_match.away_score
                  AND v_pred.predicted_away_score = v_match.home_score);
        ELSE
          v_score := (v_pred.predicted_home_score = v_match.home_score
                  AND v_pred.predicted_away_score = v_match.away_score);
        END IF;
      ELSE
        -- Order-independent raw score pair.
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
      IF v_prog OR v_score THEN
        v_points := 2; -- SCORING:NO_MATCHUP.PROGRESSOR_OR_SCORE=2
      ELSE
        v_points := 0; -- SCORING:NO_MATCHUP.NONE=0
      END IF;
    END IF;

    UPDATE playoff_predictions SET points_awarded = v_points WHERE id = v_pred.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
