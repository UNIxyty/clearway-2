# Production check accounts

Approved on 2026-11-02, with conditions that are not negotiable. A check that needs to write on production is a
separate ask.

- **Read-only.** A check account signs in and reads. Its `app_metadata.check_account` (set only with the service key)
  makes the portal's middleware, the wall and the agent refuse every write from it, before any permission is looked
  at. Without the marker the same write from the same kind of user succeeds; with it, 403.
- **Synthetic, and cannot receive mail.** `check-<role>-<random>@check.invalid`; the display name is "Check account".
  `.invalid` never resolves.
- **Never above the role under test.** The tool accepts `user` only. It refuses admin and developer outright.
- **Deleted at the end of every run.** The run fails if any check account is left on production.
- **A standing list.** `scripts/check-accounts.sh list` on the server shows every check account that exists.
- **In the audit trail.** Every account writes `check_account.created` and `check_account.deleted` rows to
  `agent_audit_log`, with the check's name.
- **Reports carry counts and status codes.** Never passenger or flight data.

Run a check from the server: `scripts/check-accounts.sh run <name>`, with the check in `scripts/prod-checks/<name>.mjs`.
The tool runs inside the portal container with that container's own settings; nothing is read from `.env` on the host.

Checks:
- `read-only-walk`: the `/files` allow-list (a listed AIP copy serves; a `.json`, another folder and help drafts are
  404); the status probe names the role; Admin › Users refuses a user; a write is refused in each of the three services.
