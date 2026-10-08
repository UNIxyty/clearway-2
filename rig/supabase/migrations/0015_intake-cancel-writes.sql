-- ── Cancellations in the send log (2026-10-08). Idempotent. ───────────────────────────────────────────────────
-- A provider's cancellation, approved by ops, cancels the legs in Leon (flightDelete: Leon keeps the flight as
-- cancelled). Each cancel is a row in the same send log, written BEFORE the call: action 'cancel', states
-- sending → cancelled | not_cancelled (Leon refused) | unknown. A leg's Leon state is read from its 'create' rows.
alter table public.intake_leon_writes add column if not exists action text not null default 'create';
alter table public.intake_leon_writes drop constraint if exists intake_leon_writes_action_check;
alter table public.intake_leon_writes add constraint intake_leon_writes_action_check check (action in ('create', 'cancel'));
alter table public.intake_leon_writes drop constraint if exists intake_leon_writes_state_check;
alter table public.intake_leon_writes add constraint intake_leon_writes_state_check check (state in ('not_sent', 'sending', 'in_leon', 'not_in_leon', 'unknown', 'cancelled', 'not_cancelled'));
