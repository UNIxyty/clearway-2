-- Make Stage 5 lock enforcement actually effective.
--
-- 20260617_playoff_predictions_lock_enforcement.sql added INSERT/UPDATE policies
-- that reject writes to a locked match. But an older broad policy from
-- 20260613_add_playoffs.sql, "Users manage own playoff predictions" (FOR ALL,
-- USING auth.uid() = user_id, with NO lock check), still existed. Postgres
-- combines permissive policies with OR, so that broad policy kept allowing
-- writes to locked matches — defeating the enforcement.
--
-- Drop the broad policy so insert/update are governed solely by the lock-aware
-- policies. SELECT is still covered by "playoff_predictions_own_read" and
-- "Admins read all playoff predictions". The app never deletes predictions from
-- the client (clearing a pick is an upsert/update), and admin scoring uses the
-- service-role client which bypasses RLS — so no capability is lost.

DROP POLICY IF EXISTS "Users manage own playoff predictions" ON playoff_predictions;
