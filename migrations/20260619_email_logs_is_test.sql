-- Mark test sends from the admin Email Tools page so they can be distinguished
-- from real batch sends in email_logs.
ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
