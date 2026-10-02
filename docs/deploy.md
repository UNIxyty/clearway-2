# Deploying

Production is the checkout at `/root/clearway-2` on the server, **on `main`**, built with Docker Compose.

## The rule

A person deploys. Code is pushed to `main`; then someone runs the deploy on the server. Nothing deploys itself,
with one exception: the monthly rebuild below, which rebuilds what is already deployed and nothing new.

## How

```
cd /root/clearway-2
scripts/deploy.sh agent-service portal        # pull main, build, restart, wait for health
scripts/deploy.sh --status                    # branch, checkout vs origin/main, what each service was deployed from
```

Services: `portal`, `pickem`, `agent-service`, `digital-wall-backend`, `digital-wall-frontend`, `notam-sync`,
`weather-sync`, `aip-sync`. A failed build restarts nothing; the running containers stay as they are.

`scripts/deploy.sh` refuses when the checkout is not on `main`, when `main` cannot fast-forward to `origin/main`,
or when it is not exactly `origin/main` after the pull. It records the commit each service was deployed from in
`.deploy-state/` (server only, not in git).

## Branch guard

Twice the server's checkout was left on another branch (`portal-nav-digital-wall`; `aip-images-downloader` from
1 Oct 2026) and things looked deployed that were not. Two checks now stop that:

- `scripts/deploy.sh` checks the branch before anything else.
- **Every image build checks it too.** Each Dockerfile copies `.git/HEAD` (the only file of `.git` in the build
  context) and runs `scripts/branch-guard.sh`; on any branch but `main`, or a detached HEAD, the build stops with
  "REFUSING TO BUILD" and the reason. So a plain `docker compose up -d --build` on the wrong branch fails as well.
- A deliberate local build of another branch: `ALLOW_NON_MAIN_BUILD=1 docker compose build <service>`.
- `digital-wall-backend` gets the repo root as a named build context for this (`additional_contexts` in
  `docker-compose.yml`), so it must be built through compose with BuildKit, which is how the server builds.

Work that needs another branch on the server (a one-off script, a download job) belongs in a separate clone or
a `git worktree`, not in `/root/clearway-2`.

## Monthly rebuild of the agent (time-zone data)

`deploy/cron/clearway-agent-rebuild` runs `scripts/deploy.sh --no-pull --no-cache agent-service` at 03:30 server
time on the 1st of each month. It exists because the agent image fetches the newest time-zone data when it is
built (see `docs/intake.md`, "Time zones"), and a cached build does not refresh it.

- It does **not** pull. It refuses if the checkout is not on `main`, or is not the commit the agent was last
  deployed from, so it can never deploy new code unattended.
- It restarts the agent (a few seconds). An intake send to Leon that is in flight at that moment becomes
  "unknown" and needs a person's check, as after any restart.
- Install once: `install -m 644 deploy/cron/clearway-agent-rebuild /etc/cron.d/clearway-agent-rebuild`
- Log: `/var/log/clearway-agent-rebuild.log`. A failure is only in that log; the backstop is the agent itself,
  which warns (log line and an amber pill on the intake page) when newer time-zone data has been published and
  refuses to convert local times when its data is older than the code requires.
- It needs one normal deploy of `agent-service` through `scripts/deploy.sh` first (that creates the record it
  compares against).

## Builds of the agent are not reproducible, on purpose

`agent/Dockerfile` downloads the newest time-zone release at build time: Ubuntu's `tzdata-icu` package, then the
ICU project's files for the current IANA release (`agent/scripts/fetch-tzdata.mjs`). Consequences, accepted for
the sake of correct time conversion:

- **Two builds of the same commit can differ.** The time-zone data in the image depends on the day it was
  built. `docker exec agent-service node -p process.versions.tz` says what a running container has; the agent's
  `/api/health` reports it too.
- **A build can fail for reasons outside the repository.** If the download from IANA or the ICU project fails,
  the build keeps Ubuntu's package; if that is older than `TZ_MINIMUM` in `agent/lib/tzdata.mjs`, the build's
  own test fails and the deploy stops (the running container is untouched). The same commit may build today and
  not tomorrow, or the reverse.
- **A cached build does not refresh the data.** Docker reuses the layer unless something under `agent/` changed.
  `--no-cache` forces it; the monthly job does that.
- Rolling back to an older commit rebuilds it with **today's** time-zone data, not the data it had originally.
