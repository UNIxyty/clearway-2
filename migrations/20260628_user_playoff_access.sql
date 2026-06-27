-- ============================================================================
-- Per-user playoff access — the playoffs analogue of pickem_user_lock_overrides.
-- An admin can grant ONE user interactive access to the playoffs (until
-- access_until) before playoffs are opened to everyone, mirroring Pick Locks.
--
-- The app reads/writes this table via the service-role key only (same as
-- pickem_user_lock_overrides), so no RLS policies are required.
-- Run this in the Supabase SQL editor (do NOT run from app code).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pickem_user_playoff_access (
  user_id        uuid        NOT NULL,
  competition_id uuid        NOT NULL REFERENCES pickem_competitions(id) ON DELETE CASCADE,
  access_until   timestamptz NOT NULL,
  reason         text,
  granted_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, competition_id)
);

CREATE INDEX IF NOT EXISTS pickem_user_playoff_access_comp_idx
  ON pickem_user_playoff_access (competition_id);
