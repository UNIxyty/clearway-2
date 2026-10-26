# Gates: every check that decides whether something may proceed, and what it does when its input is missing

Written 2026-10-21, after the flight-gap check of a deploy chain parsed "no movements" out of an error message (its
helper file had been pruned) and deployed eleven minutes before a departure. The rule is the permissions grid's: an
action with no row is refused, not allowed. A gate whose input is missing, unreadable or stale says "cannot tell" and
stops; it never says "clear" by default. A gate that fails open only works when nothing is wrong.

| Gate | Where | Decides | When the input is missing or stale | Found |
| --- | --- | --- | --- | --- |
| Branch guard | `scripts/branch-guard.sh`, every Dockerfile | build only from `main` | unreadable `.git/HEAD` → refuses | closed |
| Pull to origin/main | `scripts/deploy.sh` | the checkout is exactly `origin/main` | fetch or fast-forward fails → refuses, nothing built | closed |
| Deploy record (`--no-pull`) | `scripts/deploy.sh` | rebuild only what was deployed last time | no record, or checkout moved → refuses | closed |
| Build | `scripts/deploy.sh` | compose build succeeded | build fails → nothing restarted | closed |
| Health after restart | `scripts/deploy.sh` | container healthy or running | no container → "missing" → NOT HEALTHY, exit 1 | closed |
| Permissions catalogue, routes, seed | `lib/permissions/check.mjs` (portal build, agent and wall start) | every endpoint has an action, the seed matches | a seed file missing → error; an unreadable route file → throws | closed |
| user_metadata reads | `lib/permissions/check.mjs` › `checkMetadataReads` | no authorization decision reads user_metadata | **was open:** an empty scan passed. Now: no sources → error; `middleware.ts` or `lib/role-resolve.ts` absent → throws | **fixed** |
| Image secrets | `scripts/check-image-secrets.mjs` (every image) | no secret inside an image | **was open:** a missing root scanned 0 files and printed "clean". Now: 0 files read → exit 2 | **fixed** |
| Time-zone data | `agent/Dockerfile` › `rig/intake/test-timezones.mjs` | the image converts a fixed list of local times correctly | the list is in the file; a failure → exit 1 | closed |
| Manifest font | `agent/scripts/check-manifest-font.mjs` | the font the manifest needs is present | missing → REFUSING | closed |
| Rig-guard copy | `scripts/check-rig-guard-copy.sh` | the wall's copy of `lib/rig-guard.mjs` matches | a file missing → diff fails → "differs", exit 1 | closed |
| Error text | `rig/check-error-text.mjs` | no raw error reaches a person | a directory missing → readdir throws | closed |
| Suite runner (stall) | `rig/run-all-suites.sh` | the machine did not sleep mid-run | `ERR_NETWORK_IO_SUSPENDED` anywhere → exit 2 | closed |
| Suite runner (sleep by duration) | `rig/run-all-suites.sh` | no suite ran across a sleep the browser did not report | **was open:** a 42-hour "suite" (the Mac hibernated on low battery, 2026-10-21) was summed as one red and sixty greens. Now: any suite over two hours → INCOMPLETE, exit 2 | **fixed** |
| Suite verdict | `rig/run-all-suites.sh` | every suite ran and passed | **was open:** exit 0 with red suites; a chain counting `rc=0` lines in an empty log pushed. Now: a VERDICT line; fewer suites than the script names → INCOMPLETE, exit 2; any red → exit 1 | **fixed** |
| Secrets in a diff | `scripts/check-diff-secrets.sh` (before every push) | the diff carries no secret-shaped string or production name | **was open:** an inline grep treated a failed `git diff` as clean. Now: git fails or the diff is empty → exit 2 | **fixed** |
| Flight gap | `scripts/flight-gap.sh` (before a wall deploy) | no movement within 30 minutes, from a fresh picture | **was open:** an ad-hoc loop parsed no movements out of an error and said GAP. Now: cache missing, unparseable or empty → CANNOT TELL, exit 2; stale → CANNOT TELL, where fresh means the cache file OR the wall's last healthy Leon sync run (its public `/api/health`) is within 20 min — the wall writes the file only when a flight changes (2026-10-25: a quiet evening made a live sync look stale). Health unreadable or in error → the file's age alone | **fixed** |
| Image runs | `scripts/check-image-runs.sh` (in `scripts/deploy.sh` after the build, before any restart; in the deploy chain before the gap) | every image to be deployed builds AND starts: a throwaway container from it, the server's .env, no network, is still running after 25 s and its health route answers 200 from inside | **was open:** the rig runs the agent and the wall from source, so a Dockerfile that forgot `lib/clients/` passed 67 suites and crash-looped production for four minutes (2026-10-25). Now: not built, not running, or no 200 → FAIL, nothing restarted; an unknown service → CANNOT TELL | **fixed 2026-10-26** |
| Migration before deploy | `scripts/metadata-to-app.mjs` and the chain that runs it | the one-off script ran clean before the code that needs it | the script exits 2 without its env and 3 on a disagreement; **the 2026-10-20 Stage 4 chain was open:** its migration step's failure would not have stopped the deploy steps after it. Rule for chains: every step `|| exit`, and the deploy step is the last | **rule** |
| Rig database | `rig/start.sh`, `rig/db.sh` | the rig points at the local stack only | `.env.rig` missing → exit 2; a hosted URL in it → REFUSING | closed |
| **Approval** | `middleware.ts`, `digital-wall/lib/auth.mjs`, `agent/lib/auth.mjs` › `accountBlocked` | a signed-in person may use the product | **was open — the biggest one:** a MISSING `is_approved` was read as "an old account, let it through"; seven accounts at other companies were inside on that default. Now only an explicit `is_approved: true` in app_metadata (service-key writes) lets a person in; missing is pending. Zero real accounts relied on the default on 2026-10-25 (the 36 carry true since the migration; the 7 are now explicitly false and disabled) | **fixed** |

Eighteen gates. Seven were failing open and are fixed in code; one (the chain pattern) is a rule for every chain written
from now on. A new gate goes in this table with its "missing input" column filled in before it is trusted.

Chains that run for hours keep their helpers in `rig/.scratch/` (gitignored, not pruned), never in a session
scratchpad, and read the gates above instead of re-implementing them.
