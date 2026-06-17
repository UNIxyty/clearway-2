-- Stage 5 lock enforcement: reject playoff prediction writes for matches that are
-- already locked. Previously the lock was frontend-only (FullBracket disabled the
-- card), but the browser-client upsert hit playoff_predictions directly with no
-- server-side check, so a locked match could still be written via a crafted request.
--
-- These policies add DB-level enforcement: an INSERT or UPDATE of a prediction is
-- only allowed when its match is NOT locked. Admin scoring writes go through the
-- service-role client, which bypasses RLS and is unaffected.

-- INSERT: only for own predictions AND only when the match is open.
DROP POLICY IF EXISTS "playoff_predictions_own_write" ON playoff_predictions;
CREATE POLICY "playoff_predictions_own_write"
  ON playoff_predictions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM playoff_matches m
      WHERE m.id = playoff_predictions.match_id AND m.is_locked = true
    )
  );

-- UPDATE: only own predictions AND only when the match is open (both the existing
-- row's match and the new row's match must be unlocked).
DROP POLICY IF EXISTS "playoff_predictions_own_update" ON playoff_predictions;
CREATE POLICY "playoff_predictions_own_update"
  ON playoff_predictions FOR UPDATE
  USING (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM playoff_matches m
      WHERE m.id = playoff_predictions.match_id AND m.is_locked = true
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM playoff_matches m
      WHERE m.id = playoff_predictions.match_id AND m.is_locked = true
    )
  );
