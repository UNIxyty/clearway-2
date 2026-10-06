# Agent service image. Mirrors the wall's container shape (node + app dir), but
# installs production deps only and runs the real entry point rather than a dev
# server — this one is on the request path for signed-in users.
# Playwright's chromium is needed for PDF generation (the platform's
# established HTML->PDF route). The Playwright base image ships the browser and
# its system libraries; alpine + a manual chromium install drifts from what
# scripts/generate-airport-sheets.mjs is tested against.
#
# THIS TAG AND THE playwright VERSION IN agent/package.json MUST MATCH EXACTLY.
# The package is pinned without a caret for that reason: "^1.59.1" resolved to
# 1.63.0 at build time, which then looked for browsers this image does not have
# ("Executable doesn't exist at /ms-playwright/chromium_headless_shell-1243").
# Bumping one without the other breaks PDF generation and nothing else.
FROM mcr.microsoft.com/playwright:v1.59.1-noble

# BRANCH GUARD: refuses to build unless the checkout is on main (scripts/branch-guard.sh says why).
ARG ALLOW_NON_MAIN_BUILD=0
COPY scripts/branch-guard.sh .git/HEAD /tmp/branch-guard/
RUN sh /tmp/branch-guard/branch-guard.sh /tmp/branch-guard/HEAD "$ALLOW_NON_MAIN_BUILD" && rm -rf /tmp/branch-guard

# CURRENT TIME-ZONE DATA. Node converts local times with the tz data bundled in its ICU, which is frozen at the
# Node release (this base image: 2025c) while countries change their rules with weeks of notice. Intake turns
# local times into UTC for Leon, so stale data means a flight loaded an hour wrong with nothing looking wrong.
# ICU_TIMEZONE_FILES_DIR makes Node's ICU read the files in /opt/tzdata-icu instead of its own copy. They come
# from two places: Ubuntu's tzdata-icu package as the baseline (here), then the newest IANA release from the ICU
# project (scripts/fetch-tzdata.mjs, below), because the package can trail IANA by weeks. Every build refreshes
# both, and then PROVES it: the test fails the build if the runtime is older than agent/lib/tzdata.mjs requires.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata tzdata-icu \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /opt/tzdata-icu && cp /usr/share/zoneinfo-icu/44/le/*.res /opt/tzdata-icu/
ENV ICU_TIMEZONE_FILES_DIR=/opt/tzdata-icu

WORKDIR /app

COPY agent/package*.json ./
RUN npm install --omit=dev

COPY agent/ ./

# The newest published tz data over the baseline (keeps the baseline if the fetch fails; the test below decides).
RUN node scripts/fetch-tzdata.mjs /opt/tzdata-icu

# Fail the build, not a flight: stale or broken tz data stops here.
COPY rig/intake/test-timezones.mjs /tmp/tzcheck/rig/intake/test-timezones.mjs
RUN mkdir -p /tmp/tzcheck/agent/lib && cp /app/lib/tzdata.mjs /tmp/tzcheck/agent/lib/tzdata.mjs \
 && node /tmp/tzcheck/rig/intake/test-timezones.mjs && rm -rf /tmp/tzcheck

# Fail the build, not a border document: the passenger manifest's pinned font (Liberation Sans 2.1.5, shipped in
# lib/manifest/assets) must be present and exact, and must come out EMBEDDED in a rendered manifest — read back from
# the PDF itself. No host font is ever used, so this image needs no Helvetica/Arial/Liberation installed.
RUN node scripts/check-manifest-font.mjs

# The platform's single Resend client, not a copy of one. Kept at the path the
# agent imports it from (../../digital-wall/lib/mailer.mjs) so the module reads
# the same in the image as in the repo.
COPY digital-wall/lib/mailer.mjs /digital-wall/lib/mailer.mjs
# Likewise the wall's flight-record module (the board flight + its aircraft
# group, keyed "<oprId>:<flightNid>"): the flight tools read the wall's own
# record shape rather than a second one. Pure, no imports.
COPY digital-wall/lib/flight-record.mjs /digital-wall/lib/flight-record.mjs
# The rig guard (refuses a test-rig run that points at production) lives at the repo root; server.mjs imports ../lib/rig-guard.mjs.
COPY lib/rig-guard.mjs /lib/rig-guard.mjs

EXPOSE 5175

# Prove the deployed image answers before the gateway sends traffic to it.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5175)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
