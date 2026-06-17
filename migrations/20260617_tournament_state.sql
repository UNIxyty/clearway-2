-- Stage 4 / Stage 7 one-time-event guards.
-- Single row per competition tracking irreversible batch milestones, so the
-- "Confirm R32 Bracket" batch (score every user's R32 projection + send the
-- Group Stage Complete email) and the future final-standings email each run once.

CREATE TABLE IF NOT EXISTS tournament_state (
  competition_id      uuid PRIMARY KEY REFERENCES pickem_competitions(id) ON DELETE CASCADE,
  r32_confirmed_at    timestamptz,
  final_email_sent_at timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Service-role only (admin batch actions). RLS on with no policies = no client access.
ALTER TABLE tournament_state ENABLE ROW LEVEL SECURITY;
