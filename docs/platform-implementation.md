# Clearway Platform Redesign — Implementation Record (Aug 2026)

Companion to docs/platform-audit.md. What shipped in the five phases
(commits 9f24a8c..<phase5>), what stayed on the separate track.

## Final routing table
| Route | Serves | Notes |
|---|---|---|
| / | redirect → /dashboard | /?icao=X → /aip?icao=X → /aip/X |
| /dashboard | landing: recents, service status, server health (admin), changelog | Phase 3 |
| /aip | airport search (wizard, suggestions, recents) | old / |
| /aip/<ICAO> | deep-linkable ONE-PAGE airport view (document + GEN + NOTAM/weather rail; main sidebar, no deep context) | /gen /notam /weather redirect here |
| /aip/service-status | country service statuses | /status = redirect |
| /account/{profile,notifications,search-stats,guide} | account pages (guide = in-shell iframe) | old paths redirect |
| /admin/{users,maintenance,email-tools,email/logs,debug,debug/raw,service-status,airports/deleted} | admin; debug trio = deep context | country-service-status + debug/email-logs redirect |
| /digital-wall/* , /pickem/*, /playoffs | UNCHANGED (§3 / deferred) | |
Legacy retired (404): /backend-test, /operators.html, /aircrafts.html.

## Health checks (lib/service-checker.ts; /api/service-checks + POST recheck)
portal-health 1m · aip-resolve 5m · notams-cached 10m · weather 10m ·
notam-sync / weather-sync / aip-sync workers (/health) 2m · wall-health
(/api/health on wall) 1m · leon-feed (wall sync-status) 2m ·
checkwx/crewbriefing/ead freshness (cache age, degraded >24h) 30m.
States operational/degraded/down/unknown + lastError + latency; results
persisted under storage key service-checks/. Self-probes (portal-health,
aip-resolve, notams-cached, weather) resolve their base via candidates
(PORTAL_SELF_URL -> 127.0.0.1 -> $HOSTNAME) with a cached winner and
re-resolution on connection failure — Next standalone binds
HOSTNAME||0.0.0.0 and Docker always sets HOSTNAME, so loopback refuses
inside the container (the post-deploy false-unhealthy bug).

## Server metrics (/api/admin/metrics, requireAdmin)
docker stats, /proc/loadavg, /sys/class/hwmon k10temp, free, df per
volume; warnings at disk>=80% and non-running/unhealthy containers
(surfaces the audit's root-disk-85% + unhealthy-pickem findings).
Graceful available:false sections off-Linux.

## Security state after Phase 5
- Auth FAILS CLOSED both apps: portal middleware missing-env/auth-throw
  → 503 (API) / /maintenance (pages), health + secret-header + testing
  bypasses preserved; wall auth misconfig → deny, with a read-only
  DISPLAY whitelist (timeline/limitations/settings GET + SSE) so the
  ops-room display survives an auth outage (writes/roles all 401).
- /api/asecna/job/[id] session-gated (was reachable via the extension
  bypass); telegram webhook keeps its own secret; /api/health public.
- SEPARATE TRACK (unchanged, still open): the /files/* extension bypass
  (any dotted URL skips login) + the x-debug-runner-secret master key —
  fix together with a wall-side authed fetch (§3 note); /api/unsubscribe
  behind login (email links bounce — needs signed tokens); GET
  /api/bug-reports returns all users' reports to any session; telegram
  bypass is a prefix match.
- Deferred by decision: container unification + /playoffs rename;
  changelog schema additions (airports/user_preferences updated_by etc.).

## Notes
- Shared tokens: shared/design-tokens.json (portal tailwind cw.* +
  lib/tokens.ts; console ui.jsx). Nav topology: components/portal/nav.ts.
- Force re-sync: force=1 propagates to the sync workers for EAD/scraper/
  ASECNA; USA has no live source.
- NEXT_PUBLIC_* env is inlined into the middleware bundle at build time:
  the env-missing branch protects builds without env; runtime env loss
  surfaces as getUser failures (also denied).
