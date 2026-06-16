-- Email infrastructure: log table + opt-out flag

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_logs_user_id_idx ON email_logs (user_id);
CREATE INDEX IF NOT EXISTS email_logs_created_at_idx ON email_logs (created_at DESC);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read email logs"
  ON email_logs FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM user_preferences WHERE is_admin = true));

-- Add opt-out flag to user_preferences (created in 20260606_create_pickem_core.sql or earlier)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false;
