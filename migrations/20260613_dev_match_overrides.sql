-- ============================================================
-- Dev match overrides — per-developer simulated match results
-- ============================================================
-- Developers can activate "Dev Mode" to simulate group stage
-- completion without touching pickem_matches (which is shared).
-- Each developer gets their own isolated sandbox.
-- ============================================================

CREATE TABLE IF NOT EXISTS pickem_dev_match_overrides (
  user_id    UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  match_id   UUID NOT NULL REFERENCES pickem_matches(id) ON DELETE CASCADE,
  home_score INT  NOT NULL,
  away_score INT  NOT NULL,
  status     TEXT NOT NULL DEFAULT 'finished',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, match_id)
);

ALTER TABLE pickem_dev_match_overrides ENABLE ROW LEVEL SECURITY;

-- Each developer can only see and manage their own overrides
CREATE POLICY "dev_overrides_own" ON pickem_dev_match_overrides
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_dev_match_overrides_user
  ON pickem_dev_match_overrides (user_id);
