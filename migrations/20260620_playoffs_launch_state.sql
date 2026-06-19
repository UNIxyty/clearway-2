-- Playoffs launch gate. Reuses the single-row tournament_state table (same
-- pattern as r32_confirmed_at / final_email_sent_at).
--
-- Playoffs is "open to regular users" only when BOTH playoffs_opened_at and
-- playoffs_prediction_deadline are non-null. Admins always have access.

ALTER TABLE tournament_state
  ADD COLUMN IF NOT EXISTS playoffs_opened_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS playoffs_prediction_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS playoffs_opened_by           UUID REFERENCES auth.users(id);
