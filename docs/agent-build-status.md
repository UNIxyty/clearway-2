# Agent build — status

Single source of truth for what is **built, on `main`, and deployed** for the dispatcher-agent
series (Prompts 0–10). Nothing here is "done" because it was written: a part is only `Deployed`
when its commits are on `main` **and** the containers have been rebuilt on the server. Every entry
carries commit hashes and a deployed yes/no so this is checkable, not remembered.

**Standing rules (apply to every part)**
- The agent acts as the signed-in user, never a service account. If a dispatcher can't do it in the
  console, the agent can't do it for them.
- The backend enforces permissions and validation — never the model, never the prompt.
- Audit everything from the first commit.
- Provider is Amazon Bedrock (Anthropic + Amazon; OpenAI optional). Gemini is not available.
- This file records what is on `main` and deployed, not what was written.

**Status values:** `Not started` · `In progress` · `Built, not deployed` · `Deployed` · `Deferred`

**Deploy command (server `root@clearway-2`, repo checkout):**
`git pull origin main && docker compose up -d --build` — then confirm `git rev-parse --short HEAD`
on the server matches the hash recorded here, and `docker ps` shows the rebuilt containers.

## Overview

| Part | Status | Commits | Deployed | Notes |
|---|---|---|---|---|
| 0 — Prerequisites and the status file | In progress | (see §Part 0) | No | Status file, airport coverage, bug-reports scope, `/files/*` auth, wall CRUD, AWS/Bedrock |
| 1 | Not started | — | No | Title filled in when its prompt arrives |
| 2 | Not started | — | No | |
| 3 | Not started | — | No | |
| 4 | Not started | — | No | |
| 5 | Not started | — | No | |
| 6 | Not started | — | No | |
| 7 | Not started | — | No | |
| 8 | Not started | — | No | |
| 9 | Not started | — | No | |
| 10 | Not started | — | No | |

## Part 0 — Prerequisites and the status file

### What was built
_(filled in per item as each lands on `main`)_

| Item | Commit | On `main` | Deployed |
|---|---|---|---|
| Status file created | _pending_ | — | — |
| P1 — Airport and country coverage | _pending_ | — | — |
| P2 — `GET /api/bug-reports` scoped to caller | _pending_ | — | — |
| P3 — `/files/*` behind session check (wall header path preserved) | _pending_ | — | — |
| P4 — Wall store CRUD completeness | _pending_ | — | — |
| P5 — AWS + Bedrock access | _pending_ | — | — |

### Deliberately deferred and why
_(none yet)_

### What the next part needs to know
_(filled in as items land)_

### Decisions needed from you
_(filled in as items land)_

## Parts 1–10
Not started. Each gets the same four sections as Part 0 when its prompt arrives.

## Deferred items (all parts)

| Part | Item | Why deferred | Where it should land |
|---|---|---|---|
| — | — | — | — |
