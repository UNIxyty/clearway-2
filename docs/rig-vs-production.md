# How the rig differs from production

The rig (`rig/`, `docs/rig-suites.md`) is one Mac running the portal, the wall, the agent and a local Supabase. It
cannot show anything below. A suite that passes says nothing about these; a docs page marks them `Unverified:`; a
screenshot taken on the rig cannot show them either. Written 2026-10-15; add a line when a new one is found.

- **The bypass stack has no session.** On the plain rig (:3999 → portal :3998, `DISABLE_AUTH_FOR_TESTING`) the
  portal's admin helpers (`requireAdmin`, `requireDeveloper`, `requirePermission`) see no session cookie, so admin
  endpoints answer **401** there — the server genuinely does not know who is asking. In production, and on the
  sign-in-on rig (:3989), a signed-in non-admin gets **403** with a sentence (probed on every admin endpoint,
  2026-10-20: 0 answer 401 to a signed-in person). A 401 read off the bypass rig is a rig artefact, not a bug.
- **No Cloudflare.** Cloudflare replaces the body of an origin 502 or 504 with its own page (found 2026-10-14, after
  the error-text work had passed every rig check); caching, headers and anything else it rewrites are untested.
- **No mail server.** Supabase Auth's emails (password reset, email change, sign-up confirmation) fail on the rig;
  whether they arrive, and what the links open, is untested. The wall's and the agent's Resend sends go to a stand-in
  (`rig/intake/mock-resend.mjs`) that accepts everything and delivers nothing.
- **No real Leon.** The wall reads invented flights from `rig/wall/mock-leon.mjs`; the agent and Flight intake write to
  a stand-in (`rig/manifest/`). Real Leon's data, timing, rate limits, refusals and webhook pushes are untested
  (a real-Leon run needs a phrase only a person types).
- **No AIP, GEN, NOTAM or weather sync service.** `AIP_SYNC_URL`, `NOTAM_SYNC_URL` and `WEATHER_SYNC_URL` are unset, so
  every fetch from a source takes its failure path. A handful of invented NOTAMs and stand-in AD 2 PDFs are seeded
  (`rig/wall/seed-portal.mjs`); EAD, ASECNA, the national AIP sites and the AI extraction are untested.
- **No Telegram.** Help & support's alerts and nudges, the bug bot and the developer's Telegram inbox are untested.
- **No file storage in the rig's Supabase** (`[storage] enabled = false`): Important attachments cannot be tried.
- **Not production's tables or data.** The rig has no `airports` table (search uses its built-in list), invented rows
  in the few tables it lacked (`rig/supabase/migrations/0025_…`), no real users, operators or passengers. What a page
  looks like with production's volume — 2,400 flights, 159 cached EAD documents — is untested.
- **No server-to-server secret.** `x-debug-runner-secret` is unset, so the exception that lets the wall and the debug
  runner call the portal without a session is never exercised.
- **No ops-room screen.** No registered TV runs the wall display; how it reloads after a deploy, and screen pairing
  and approval with a real device, are untested.
- **No Docker, nginx gateway or deploy script.** The rig runs a standalone Next build behind `rig/proxy.mjs`; image
  builds, the branch guard, the image secret check, `scripts/deploy.sh` and the wall's nginx paths are untested.
- **Voice is a stand-in.** ElevenLabs is replaced by `rig/voice/mock-elevenlabs.mjs` and a fake microphone.
- **Some things are real.** The agent's model (Bedrock) and the CheckWX weather key are the real services, so a
  network outage on the Mac fails rig suites that have nothing wrong with them.
- **One quiet machine.** No load, no other people, the Mac's own clock and time zone; suites stall if the Mac sleeps
  (`caffeinate` in `rig/run-all-suites.sh`).

## Client access (Stage 5, 2026-10-25)
The rig has no real Leon and no real clients. `rig/client-scope-check.mjs` proves the scope rules against the mock Leon’s
invented operators (artlw, cwy-cwy): the two-client refusal by id at the wall and the agent, the board, the stream and the
NOTAM round never carrying the other client, the forgery case, the passenger levels and the removed state. What it
cannot prove: how production’s Leon tenants map to operator ids (ops type that into the scope), the email that tells a
client their decision (no mail on the rig), and TRIP scope at the AGENT — the mock Leon’s flight has no trip number, so
the agent’s one small scope read (tripNo, registration) answers “not theirs” on the rig, which is the closed default;
the wall side of trip scope reads its own cache and is proven. Operator and registration scope are proven at both.

## AIP refresh (2026-10-25)
The rig has no EAD. `rig/aip-refresh-check.mjs` starts its own sync worker against a scratch storage with invented copies
and a stub that answers EAD's table (`AIP_REFRESH_STUB`): it proves the schedule (due on the effective date, a recheck
24 h later, a missed date runs at the next start), the order, the check-or-download decision, the sidecar records and
the state file. It cannot prove the EAD session itself (`--check` mode of the download script runs a real browser) nor
how long a run takes on production — the first real run must be watched, check-only first.
