-- Agent hardening (audit 2026-09, findings S2 and S3).
-- Run once in the Supabase SQL editor. Safe to re-run.

-- ── 1. The audit log is append-only IN THE DATABASE ──────────────────────────
--
-- RLS with no policies already blocks the anon and authenticated keys, but the
-- service-role key bypasses RLS, and the agent, portal and wall all hold it.
-- Until now "append-only" was true only because no code path edited the table.
-- A trigger makes it a property of the table: nothing, with any key, can
-- rewrite history. The only way to change what the log says is to write a new
-- row that says so.

create or replace function public.agent_audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'agent_audit_log is append-only: % is not permitted (row id %)', tg_op, coalesce(old.id, -1)
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists agent_audit_log_no_update on public.agent_audit_log;
create trigger agent_audit_log_no_update
  before update on public.agent_audit_log
  for each row execute function public.agent_audit_log_immutable();

drop trigger if exists agent_audit_log_no_delete on public.agent_audit_log;
create trigger agent_audit_log_no_delete
  before delete on public.agent_audit_log
  for each row execute function public.agent_audit_log_immutable();

-- ── 2. Action history: the only permitted edit is "this was undone by …" ─────
--
-- agent_actions holds the before/after snapshots an undo restores from. The
-- undo path sets exactly two columns on the ORIGINAL row (undone_at,
-- undone_by_action_id) and never touches the snapshots. This trigger lets that
-- through and refuses everything else, including deletes.

create or replace function public.agent_actions_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'agent_actions rows are never deleted (row %)', old.id using errcode = 'insufficient_privilege';
  end if;
  if new.user_id          is distinct from old.user_id
  or new.user_email       is distinct from old.user_email
  or new.conversation_id  is distinct from old.conversation_id
  or new.tool_name        is distinct from old.tool_name
  or new.arguments        is distinct from old.arguments
  or new.target_kind      is distinct from old.target_kind
  or new.target_id        is distinct from old.target_id
  or new.target_label     is distinct from old.target_label
  or new.before_state     is distinct from old.before_state
  or new.after_state      is distinct from old.after_state
  or new.kind             is distinct from old.kind
  or new.undoes_action_id is distinct from old.undoes_action_id
  or new.reversible       is distinct from old.reversible
  or new.irreversible_reason is distinct from old.irreversible_reason
  or new.success          is distinct from old.success
  or new.error            is distinct from old.error
  or new.created_at       is distinct from old.created_at
  then
    raise exception 'agent_actions: only undone_at / undone_by_action_id may change (row %)', old.id using errcode = 'insufficient_privilege';
  end if;
  if old.undone_at is not null and (new.undone_at is distinct from old.undone_at or new.undone_by_action_id is distinct from old.undone_by_action_id) then
    raise exception 'agent_actions: an undo cannot be re-pointed once set (row %)', old.id using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists agent_actions_guard_update on public.agent_actions;
create trigger agent_actions_guard_update
  before update on public.agent_actions
  for each row execute function public.agent_actions_guard();

drop trigger if exists agent_actions_guard_delete on public.agent_actions;
create trigger agent_actions_guard_delete
  before delete on public.agent_actions
  for each row execute function public.agent_actions_guard();

-- NOTE for the verifiers: scripts/agent-verify-part7.mjs and part8 clean up by
-- DELETING the mock user's agent_actions rows. After this file runs they must
-- stop doing that (the rig's rows are harmless and identifiable by user id).

-- ── 3. Generated-file retention needs somewhere to record expiry ─────────────
--
-- The bytes go after AGENT_FILE_RETENTION_DAYS; the row stays and says when,
-- so "where is my briefing" gets "expired on <date>" rather than "never existed".

alter table public.agent_generated_files
  add column if not exists expired_at timestamptz null;

create index if not exists idx_agent_files_retention
  on public.agent_generated_files (created_at)
  where expired_at is null;
