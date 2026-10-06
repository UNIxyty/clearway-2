# The test rig

Everything the agent, the console and the wall are exercised against locally. **The rig has its own
database** — a local Supabase stack (Postgres + PostgREST + GoTrue) under `rig/supabase/` — and a rig run can
never reach production: `lib/rig-guard.mjs` makes the agent, the wall and the portal refuse to start (or serve)
when the auth bypass is on and `NEXT_PUBLIC_SUPABASE_URL` is not local. Reaching production on purpose needs a
phrase a person types (`RIG_ALLOW_PRODUCTION="I understand this rig run reaches the production database"`).
Nothing defaults to it and nothing inherits it from `.env`.

## Once per machine

```
colima start            # or Docker Desktop — the stack runs in Docker
rig/db.sh start         # pulls images, applies docs/supabase-*.sql as migrations, writes .env.rig, creates the rig user
```

`.env.rig` holds the local stack's URL and keys, the auth bypass, and the rig account. It has no production
database credentials. Model keys (Bedrock, ElevenLabs) are copied from `.env` only when you say so:
`RIG_COPY_MODEL_KEYS="yes, copy model keys into the rig" node rig/make-env.mjs`.

Reference data (airports, AIP documents, …) so the portal's lookups work: a read-only copy from production,
again only when typed: `RIG_ALLOW_PRODUCTION_READ="yes, read production to seed the rig" node rig/seed-from-production.mjs`.
It clones the schema of the non-agent tables from production's OpenAPI description and copies up to 5,000 rows
each. Agent tables are never copied — the rig starts with none.

## Console build

`rig/build-portal.sh`, never a plain `npm run build`. Next.js compiles `NEXT_PUBLIC_*` values into the build and
copies `.env*` into `.next/standalone`, where the server loads them at runtime; a plain build therefore carries
the production Supabase URL and anon key, and every production secret in `.env`. The rig build exports
`.env.rig` first, deletes every `.env*` from the standalone output, and `rig/check-portal-build.sh` (also run by
`rig/start.sh`) refuses a build that has either.

## Every session

```
rig/start.sh            # portal :3998, agent :5175, wall sandbox :5199, proxy :3999, fixture sites :3997
rig/start.sh stop
rig/db.sh reset         # fresh database (migrations + rig user), when a test needs a clean slate
```

The proxy on :3999 is the single origin the browser and the extension use (`/agent/api` → agent,
`/digital-wall/api` → wall, else portal). A file `rig/.scratch/rig-401` makes it answer 401 to every agent
request (simulates a signed-out console); it logs cookie *names* and the `x-clearway-*` headers per request to
`rig/.scratch/rig-proxy.log`.

## The rig account

`rig-test@rig.invalid`, id `00000000-7e57-4000-8000-000000000000` ("7e57" = TEST), name
`RIG TEST ACCOUNT (not a person)`, password `rig-test-password` (local auth only). It is what every log,
audit row and conversation from a rig run is attributed to, so it can never be mistaken for a colleague.

## Migrations

`rig/supabase/migrations/` are copies of `docs/supabase-*.sql` in order. When a new `docs/supabase-*.sql` is
added, copy it in with the next number and run `rig/db.sh reset`. The local stack is the only place those
files are executed automatically; production still runs them by hand.

## Extension tests

`rig/ext/harness.mjs` launches Playwright's Chromium with the unpacked extension (build it with
`cd extension && CW_CONSOLE_ORIGIN=http://127.0.0.1:3999 CW_TEST_HOSTS="http://127.0.0.1/*" node build.mjs`).
Fixture pages are in `rig/fixtures/`.

## Verification rule

After any change to the extension or the agent UI, `rig/ext/t-console.mjs` (side panel and content-script
consoles; exits 1 on any error, warning, CSP violation or failed request) and `rig/ext/t-issues.mjs` (DevTools
Issues) must both be clean. Any message is a finding.

## Passenger manifest

`rig/manifest/start.sh` (after `rig/start.sh`) restarts the agent against a per-operator mock Leon (:3993, fake
passengers); `node --env-file=.env.rig rig/manifest/operators.mjs seed` puts rig operators in the rig database's
`leon_operators` (add / break / fix / remove one to test configuration changes live). `node rig/manifest/browser.mjs` drives `/manifest` in the console;
`node rig/manifest/test-generator.mjs` checks the generator's rules; `python3 rig/manifest/overlay.py
rig/manifest/CWY_PAX_Manifest.pdf <ours.pdf>` overlays a render on the reference. Samples:
`cd agent && node scripts/pax-manifest.mjs --rig <state> --out f.pdf`.
