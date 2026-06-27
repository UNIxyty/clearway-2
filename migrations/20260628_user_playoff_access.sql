-- ============================================================================
-- Per-user playoff access — the playoffs analogue of pickem_user_lock_overrides.
-- An admin can grant ONE user interactive access to the playoffs (until
-- access_until) before playoffs are opened to everyone, mirroring Pick Locks.
--
-- The app reads/writes this table ONLY via the service-role key (the store
-- functions in lib/pickem-store.ts), which bypasses RLS. So we enable RLS with
-- NO permissive policies — that denies all anon/authenticated client access while
-- the service role keeps full access. Same lock-down pattern as tournament_state.
-- (Note: pickem_user_lock_overrides was created WITHOUT RLS, which leaves it open
--  to the anon key — don't copy that here.)
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

-- Lock the table to the service role only (app access path). No policies = every
-- anon/authenticated request is denied; the service-role key bypasses RLS.
ALTER TABLE pickem_user_playoff_access ENABLE ROW LEVEL SECURITY;
