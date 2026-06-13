-- RLS policies for playoff and pickem tables.
-- Run once in Supabase SQL editor.

-- ── pickem_competitions ───────────────────────────────────────────────────────
-- Public data — anyone can read competition metadata.
CREATE POLICY "competitions_public_read"
  ON pickem_competitions FOR SELECT
  USING (true);

-- ── pickem_teams ─────────────────────────────────────────────────────────────
-- Public data — anyone can read team info.
CREATE POLICY "teams_public_read"
  ON pickem_teams FOR SELECT
  USING (true);

-- ── playoff_matches ───────────────────────────────────────────────────────────
-- Anyone can read match data (venues, scores, teams).
CREATE POLICY "playoff_matches_public_read"
  ON playoff_matches FOR SELECT
  USING (true);

-- Admins can insert / update / delete matches.
CREATE POLICY "playoff_matches_admin_write"
  ON playoff_matches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_preferences
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );

-- ── playoff_predictions ───────────────────────────────────────────────────────
-- Users can only see and manage their own predictions.
CREATE POLICY "playoff_predictions_own_read"
  ON playoff_predictions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "playoff_predictions_own_write"
  ON playoff_predictions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "playoff_predictions_own_update"
  ON playoff_predictions FOR UPDATE
  USING (user_id = auth.uid());
