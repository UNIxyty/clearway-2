import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { LeonTimelineService } from "./leon-sync.mjs";
import { OperatorsStore } from "./operators-store.mjs";
import { SseHub } from "./lib/sse.mjs";
import { authenticateRequest, authEnabled, describeAuthPosture, MOCK_USER } from "./lib/auth.mjs";
import { JsonFileStore } from "./lib/json-store.mjs";
import { ImportantStore } from "./lib/important-store.mjs";
import { getNotams, getWeather, portalConfigured, resolveAipPdf, streamAipPdf } from "./lib/portal-client.mjs";
import { AlertsService } from "./lib/alerts.mjs";
import { NotamCheckService } from "./lib/notam-check.mjs";
import { AipSendService } from "./lib/aip-send.mjs";

const port = Number(process.env.PORT || 5173);
const cwd = process.cwd();
const candidateRoots = [
  path.resolve(cwd, "upstream"),
  path.resolve(cwd, "../164.92.164.35"),
];

const staticRoot = candidateRoots.find((dir) => {
  return (
    fsSync.existsSync(path.join(dir, "timeline.html")) &&
    fsSync.existsSync(path.join(dir, "api", "flights", "data.html"))
  );
});

if (!staticRoot) {
  throw new Error("Could not resolve upstream static directory.");
}

const operatorsStore = new OperatorsStore();
const importantStore = new ImportantStore();
await importantStore.load();
const timelineService = new LeonTimelineService({ staticRoot, operatorsStore, importantStore });
await timelineService.bootstrap();

const sseHub = new SseHub();
process.stdout.write(`Digital Wall auth: ${describeAuthPosture()}\n`);

const alertsService = new AlertsService({ timelineService, sseHub });
await alertsService.load();
timelineService.alertsStore = alertsService;
alertsService.startPolling();

const notamCheck = new NotamCheckService({ timelineService, alertsService, sseHub });
await notamCheck.load();
notamCheck.startScheduler();

const aipSend = new AipSendService({ sseHub });
process.stdout.write(
  `Alert scanner: ${portalConfigured() ? "active (portal proxy configured)" : "idle (set PORTAL_BASE_URL to enable)"}\n`
);

// ── Display configuration: city clocks shown above the timeline ─────────────
const DEFAULT_CLOCKS = [
  { label: "Riga", timeZone: "Europe/Riga", home: true },
  { label: "Paris", timeZone: "Europe/Paris" },
  { label: "New York", timeZone: "America/New_York" },
  { label: "Istanbul", timeZone: "Europe/Istanbul" },
  { label: "UTC", timeZone: "UTC" },
];
const clocksStore = new JsonFileStore("display-clocks.json", { clocks: DEFAULT_CLOCKS });

// Current wall overlay — appliance-style shared state (one overlay for all
// connected displays; deliberately in-memory, resets on restart).
let overlayState = { open: false };

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: String(timeZone) });
    return true;
  } catch {
    return false;
  }
}

function sanitizeClocks(input) {
  if (!Array.isArray(input)) {
    throw new Error("Body must be { clocks: [{ label, timeZone }] }.");
  }
  if (input.length === 0 || input.length > 12) {
    throw new Error("Configure between 1 and 12 clocks.");
  }
  return input.map((row) => {
    const label = String(row?.label || "").trim().slice(0, 40);
    const timeZone = String(row?.timeZone || "").trim();
    if (!label) throw new Error("Every clock needs a label.");
    if (!isValidTimeZone(timeZone)) {
      throw new Error(`Unknown IANA time zone: ${timeZone || "(empty)"}.`);
    }
    return { label, timeZone, home: row?.home === true };
  });
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

const mockAuthPayload = {
  accessToken: "local-dev-access-token",
  accessTokenExpirationTime: "2099-12-31T23:59:59.000Z",
  refreshToken: "local-dev-refresh-token",
  refreshTokenExpirationTime: "2099-12-31T23:59:59.000Z",
  user: {
    userId: "local-user-id",
    email: "local@clearway.aero",
    firstname: "Local",
    lastname: "Operator",
    role: "ADMIN",
  },
};

function safeJoin(root, requestPath) {
  const sanitized = requestPath.replace(/^\/+/, "");
  const resolved = path.resolve(root, sanitized);
  if (!resolved.startsWith(root)) {
    return null;
  }
  return resolved;
}

async function readMaybe(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function serveLocalFile(res, fileName) {
  const filePath = path.resolve(cwd, fileName);
  const fileBuffer = await readMaybe(filePath);
  if (!fileBuffer) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`${fileName} not found.`);
    return true;
  }
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": contentType });
  res.end(fileBuffer);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/") {
      res.writeHead(302, { location: "/timeline" });
      res.end();
      return;
    }

    if (pathname === "/backend-test" || pathname === "/backend-test.html") {
      await serveLocalFile(res, "backend-test.html");
      return;
    }

    if (pathname === "/operators" || pathname === "/operators.html") {
      await serveLocalFile(res, "operators.html");
      return;
    }

    if (pathname === "/aircrafts" || pathname === "/aircrafts.html") {
      await serveLocalFile(res, "aircrafts.html");
      return;
    }

    if (pathname === "/admin-common.css" || pathname === "/wall-menu.js") {
      const fileName = pathname.slice(1);
      await serveLocalFile(res, fileName);
      return;
    }

    // ── Authentication gate ─────────────────────────────────────────────
    // Every /api/* endpoint requires a Supabase session (verified from the
    // portal's cookies through the shared gateway). When auth is disabled
    // for local dev, authenticateRequest() returns the mock ADMIN user.
    let requestUser = null;
    if (pathname.startsWith("/api/")) {
      requestUser = await authenticateRequest(req);
      if (!requestUser) {
        sendJson(
          res,
          { ok: false, error: "Unauthorized. Sign in through the Clearway portal first." },
          401
        );
        return;
      }
    }

    if (pathname.startsWith("/api/auth/")) {
      if (authEnabled()) {
        sendJson(res, {
          ...mockAuthPayload,
          user: {
            userId: requestUser.userId,
            email: requestUser.email,
            firstname: requestUser.name.split(" ")[0] ?? "",
            lastname: requestUser.name.split(" ").slice(1).join(" "),
            role: requestUser.role,
          },
        });
        return;
      }
      sendJson(res, mockAuthPayload);
      return;
    }

    if (pathname === "/api/stream" && req.method === "GET") {
      const surface = url.searchParams.get("surface") === "console" ? "console" : "display";
      sseHub.addClient({ req, res, user: requestUser, surface });
      return;
    }

    if (pathname === "/api/presence" && req.method === "GET") {
      sendJson(res, { ok: true, users: sseHub.presenceUsers() });
      return;
    }

    // ── Shared-appliance overlay: one authoritative state, pushed to walls ──
    if (pathname === "/api/display/overlay" && req.method === "GET") {
      sendJson(res, { ok: true, overlay: overlayState });
      return;
    }

    if (pathname === "/api/display/overlay" && req.method === "POST") {
      const body = await readJsonBody(req);
      const action = String(body.action || "").toLowerCase();
      if (action === "open") {
        const found = timelineService.getFlightByNid(body.flightNid, body.oprId);
        if (!found) {
          sendJson(res, { ok: false, error: `Flight ${body.flightNid} not found in the cache.` }, 404);
          return;
        }
        overlayState = {
          open: true,
          flightNid: String(found.flight.flightNid),
          oprId: found.aircraft?.oprId ?? String(body.oprId || "") ?? null,
          by: requestUser ? { userId: requestUser.userId, name: requestUser.name } : null,
          openedAt: new Date().toISOString(),
        };
        sseHub.broadcast({ type: "display.command", command: "overlay.open", overlay: overlayState });
        sendJson(res, { ok: true, overlay: overlayState });
        return;
      }
      if (action === "close") {
        overlayState = { open: false };
        sseHub.broadcast({ type: "display.command", command: "overlay.close", overlay: overlayState });
        sendJson(res, { ok: true, overlay: overlayState });
        return;
      }
      sendJson(res, { ok: false, error: 'action must be "open" or "close".' }, 400);
      return;
    }

    // ── Flight info fan-out: timings + NOTAMs + weather + AIP availability ──
    if (pathname === "/api/flight-info" && req.method === "GET") {
      const flightNid = url.searchParams.get("flightNid");
      const oprId = url.searchParams.get("oprId") || "";
      const found = timelineService.getFlightByNid(flightNid, oprId);
      if (!found) {
        sendJson(res, { ok: false, error: `Flight ${flightNid} not found.` }, 404);
        return;
      }
      const flight = timelineService.decorateFlightWithLimitations(found.flight, {
        oprId: found.aircraft?.oprId,
        registration: found.aircraft?.registration,
      });
      const depIcao = flight.adep?.icao ?? null;
      const arrIcao = flight.ades?.icao ?? null;
      const [depNotams, arrNotams, depWeather, arrWeather, depAip, arrAip] = await Promise.all([
        depIcao ? getNotams(depIcao) : { ok: false, error: "No departure ICAO." },
        arrIcao ? getNotams(arrIcao) : { ok: false, error: "No arrival ICAO." },
        depIcao ? getWeather(depIcao) : { ok: false, error: "No departure ICAO." },
        arrIcao ? getWeather(arrIcao) : { ok: false, error: "No arrival ICAO." },
        depIcao ? resolveAipPdf(depIcao) : { available: false },
        arrIcao ? resolveAipPdf(arrIcao) : { available: false },
      ]);
      sendJson(res, {
        ok: true,
        portalConfigured: portalConfigured(),
        flight,
        aircraft: found.aircraft,
        notams: { dep: depNotams, arr: arrNotams },
        weather: { dep: depWeather, arr: arrWeather },
        aip: { dep: depAip, arr: arrAip },
      });
      return;
    }

    // ── AIP PDF proxy (resolves USA/EAD/scraper/ASECNA per ICAO) ──
    if (pathname === "/api/aip-pdf" && (req.method === "GET" || req.method === "HEAD")) {
      const icao = url.searchParams.get("icao") || "";
      const inline = url.searchParams.get("inline") !== "0";
      await streamAipPdf(icao, res, { inline });
      return;
    }

    // ── Console-initiated AIP/GEN send: emailed to the signed-in user ──
    if (pathname === "/api/aip/send" && req.method === "POST") {
      const body = await readJsonBody(req);
      const found = timelineService.getFlightByNid(body.flightNid, body.oprId);
      if (!found) {
        sendJson(res, { ok: false, error: `Flight ${body.flightNid} not found.` }, 404);
        return;
      }
      const airports = (Array.isArray(body.airports) ? body.airports : []).filter((a) => a === "dep" || a === "arr");
      const docs = (Array.isArray(body.docs) ? body.docs : []).filter((d) => d === "aip" || d === "gen");
      const requests = [];
      for (const role of airports) {
        const icao = String((role === "dep" ? found.flight.adep?.icao : found.flight.ades?.icao) || "").toUpperCase();
        if (!/^[A-Z0-9]{4}$/.test(icao)) continue;
        for (const doc of docs) requests.push({ icao, role, doc });
      }
      try {
        const jobId = aipSend.start({ flight: found.flight, requests, user: requestUser });
        sendJson(res, { ok: true, jobId, job: aipSend.publicJob(aipSend.getJob(jobId)) });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 400);
      }
      return;
    }

    if (pathname.startsWith("/api/aip/send/") && req.method === "GET") {
      const jobId = pathname.split("/").pop();
      const job = aipSend.getJob(jobId);
      if (!job) {
        sendJson(res, { ok: false, error: "Job not found." }, 404);
        return;
      }
      sendJson(res, { ok: true, job: aipSend.publicJob(job) });
      return;
    }

    // ── Alert scanner (NTM / WX findings + rules) ──
    if (pathname === "/api/alerts/rules" && req.method === "GET") {
      sendJson(res, { ok: true, rules: await alertsService.getRules() });
      return;
    }

    if (pathname === "/api/alerts/rules" && req.method === "PUT") {
      const body = await readJsonBody(req);
      try {
        const rules = await alertsService.setRules(body.rules ?? body);
        sendJson(res, { ok: true, rules });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 400);
      }
      return;
    }

    if (pathname === "/api/alerts/findings" && req.method === "GET") {
      const includeInactive = url.searchParams.get("includeInactive") === "true";
      sendJson(res, {
        ok: true,
        lastScan: alertsService.lastScan,
        findings: alertsService.listFindings({ includeInactive }),
      });
      return;
    }

    // ── Daily NOTAM check (wall sign + per-airport acknowledgments) ──
    if (pathname === "/api/notam-check/today" && req.method === "GET") {
      sendJson(res, { ok: true, ...notamCheck.publicState() });
      return;
    }

    if (pathname === "/api/notam-check/ack" && req.method === "POST") {
      const body = await readJsonBody(req);
      try {
        const state = await notamCheck.ack(body.icao, requestUser);
        sendJson(res, { ok: true, ...state });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 400);
      }
      return;
    }

    if (pathname === "/api/notam-check/run" && req.method === "POST") {
      try {
        const state = await notamCheck.runDailyCheck({ reason: "manual" });
        sendJson(res, { ok: true, ...state });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
      }
      return;
    }

    if (pathname === "/api/alerts/scan" && req.method === "POST") {
      try {
        const result = await alertsService.runScan();
        sendJson(res, { ok: result?.ok !== false, lastScan: result });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
      }
      return;
    }

    if (pathname === "/api/display/clocks" && req.method === "GET") {
      const stored = await clocksStore.read();
      sendJson(res, { ok: true, clocks: stored.clocks ?? DEFAULT_CLOCKS });
      return;
    }

    if (pathname === "/api/display/clocks" && req.method === "PUT") {
      const body = await readJsonBody(req);
      let clocks;
      try {
        clocks = sanitizeClocks(body.clocks);
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 400);
        return;
      }
      await clocksStore.write({ clocks, updatedAt: new Date().toISOString() });
      sseHub.broadcast({ type: "config.changed", section: "clocks" });
      sendJson(res, { ok: true, clocks });
      return;
    }

    if (pathname === "/api/operators" && req.method === "GET") {
      const includeInactive = url.searchParams.get("includeInactive") === "true";
      const operators = await operatorsStore.listOperators({ includeInactive });
      sendJson(res, { ok: true, storage: operatorsStore.storageMode(), operators });
      return;
    }

    if (pathname === "/api/operators" && req.method === "POST") {
      const body = await readJsonBody(req);
      const operator = await operatorsStore.upsertOperator(body);
      await timelineService.refreshNow().catch(() => {});
      sendJson(res, { ok: true, operator });
      return;
    }

    if (pathname.startsWith("/api/operators/") && req.method === "PATCH") {
      const id = pathname.split("/").pop();
      const body = await readJsonBody(req);
      const operator = await operatorsStore.setOperatorActive(id, Boolean(body.isActive));
      await timelineService.refreshNow().catch(() => {});
      sendJson(res, { ok: true, operator });
      return;
    }

    if (pathname === "/api/aircraft/schedule" && req.method === "GET") {
      const days = Number(url.searchParams.get("days") || 7);
      const refresh = url.searchParams.get("refresh") === "true";
      sendJson(res, {
        ok: true,
        ...(await timelineService.getAircraftSchedule({ days, refresh })),
      });
      return;
    }

    if (pathname === "/api/aircraft/visibility" && req.method === "GET") {
      const hidden = await operatorsStore.listHiddenAircraftKeys();
      sendJson(res, { ok: true, hidden });
      return;
    }

    if (pathname === "/api/aircraft/visibility" && req.method === "PUT") {
      const body = await readJsonBody(req);
      const result = await operatorsStore.setAircraftHidden(body);
      sendJson(res, { ok: true, ...result });
      return;
    }

    if (pathname === "/api/airports/search" && req.method === "GET") {
      const q = url.searchParams.get("q") || "";
      const limit = Number(url.searchParams.get("limit") || 50);
      const airports = timelineService.listAirportMatches(q, limit);
      sendJson(res, { ok: true, q, count: airports.length, airports });
      return;
    }

    if (pathname === "/api/countries" && req.method === "GET") {
      const q = url.searchParams.get("q") || "";
      const limit = Number(url.searchParams.get("limit") || 200);
      const countries = timelineService.listCountries(q, limit);
      sendJson(res, { ok: true, q, count: countries.length, countries });
      return;
    }

    if (pathname === "/api/timeline/limitations" && req.method === "GET") {
      const includeInactive = url.searchParams.get("includeInactive") === "true";
      const withMatches = url.searchParams.get("withMatches") === "true";
      const limitations = timelineService.listCustomLimitations({ includeInactive });
      let matchCounts = null;
      if (withMatches) {
        const now = new Date();
        matchCounts = timelineService.computeMatchCounts({
          from: new Date(now.getTime() - 24 * 3600_000).toISOString(),
          to: new Date(now.getTime() + 4 * 24 * 3600_000).toISOString(),
        }).limitations;
      }
      sendJson(res, {
        ok: true,
        source: timelineService.getStatus().source,
        limitations: matchCounts
          ? limitations.map((item) => ({ ...item, matchedFlightCount: matchCounts[item.id] || 0 }))
          : limitations,
      });
      return;
    }

    // ── Important entries (standing operational limitations, class IMP) ──
    if (pathname === "/api/important" && req.method === "GET") {
      const includeInactive = url.searchParams.get("includeInactive") !== "false";
      const withMatches = url.searchParams.get("withMatches") === "true";
      let entries = importantStore.list({ includeInactive });
      if (withMatches) {
        const now = new Date();
        const counts = timelineService.computeMatchCounts({
          from: new Date(now.getTime() - 24 * 3600_000).toISOString(),
          to: new Date(now.getTime() + 4 * 24 * 3600_000).toISOString(),
        }).important;
        entries = entries.map((entry) => ({ ...entry, matchedFlightCount: counts[entry.id] || 0 }));
      }
      sendJson(res, { ok: true, entries });
      return;
    }

    if (pathname === "/api/important" && req.method === "POST") {
      const body = await readJsonBody(req);
      try {
        const entry = await importantStore.upsert(body);
        sseHub.broadcast({ type: "important.changed", action: "upsert", id: entry.id });
        sendJson(res, { ok: true, entry });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 400);
      }
      return;
    }

    if (pathname.startsWith("/api/important/") && req.method === "PATCH") {
      const id = pathname.split("/").pop();
      const body = await readJsonBody(req);
      try {
        const entry = await importantStore.setActive(id, Boolean(body.isActive));
        sseHub.broadcast({ type: "important.changed", action: "toggle", id });
        sendJson(res, { ok: true, entry });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 404);
      }
      return;
    }

    if (pathname.startsWith("/api/important/") && req.method === "DELETE") {
      const id = pathname.split("/").pop();
      try {
        await importantStore.remove(id);
        sseHub.broadcast({ type: "important.changed", action: "delete", id });
        sendJson(res, { ok: true, id });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 404);
      }
      return;
    }

    if (pathname === "/api/timeline/limitations" && req.method === "POST") {
      const body = await readJsonBody(req);
      const limitation = await timelineService.upsertCustomLimitation(body);
      sseHub.broadcast({ type: "limitations.changed", action: "upsert", id: limitation.id });
      sendJson(res, { ok: true, limitation });
      return;
    }

    if (pathname.startsWith("/api/timeline/limitations/") && req.method === "PATCH") {
      const id = pathname.split("/").pop();
      const body = await readJsonBody(req);
      const limitation = await timelineService.setCustomLimitationActive(id, Boolean(body.isActive));
      sseHub.broadcast({ type: "limitations.changed", action: "toggle", id });
      sendJson(res, { ok: true, limitation });
      return;
    }

    if (pathname.startsWith("/api/timeline/limitations/") && req.method === "DELETE") {
      const id = pathname.split("/").pop();
      await timelineService.deleteCustomLimitation(id);
      sseHub.broadcast({ type: "limitations.changed", action: "delete", id });
      sendJson(res, { ok: true, id });
      return;
    }

    if (pathname === "/api/flights/data") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const filtered = await timelineService.getLegacyFlightsData({ from, to });
      const filteredFlights = filtered.reduce((acc, row) => acc + (row.flights?.length || 0), 0);
      if (filteredFlights === 0 && (from || to)) {
        sendJson(res, await timelineService.getLegacyFlightsData({}));
      } else {
        sendJson(res, filtered);
      }
      return;
    }

    if (pathname === "/api/limitations") {
      sendJson(res, timelineService.getLegacyLimitationsPayload());
      return;
    }

    if (pathname === "/api/timeline/flights") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const oprId = url.searchParams.get("oprId");
      const refresh = url.searchParams.get("refresh") === "true";
      const allOperators = url.searchParams.get("allOperators") === "true";
      try {
        sendJson(
          res,
          await timelineService.getFlights({ from, to, oprId, refresh, allOperators })
        );
      } catch (error) {
        sendJson(
          res,
          { ok: false, error: error instanceof Error ? error.message : String(error) },
          500
        );
      }
      return;
    }

    if (pathname === "/api/timeline/aircraft") {
      const oprId = url.searchParams.get("oprId");
      const refresh = url.searchParams.get("refresh") === "true";
      const allOperators = url.searchParams.get("allOperators") === "true";
      try {
        sendJson(res, await timelineService.getAircraft({ oprId, refresh, allOperators }));
      } catch (error) {
        sendJson(
          res,
          { ok: false, error: error instanceof Error ? error.message : String(error) },
          500
        );
      }
      return;
    }

    if (pathname === "/api/timeline/sync-status") {
      sendJson(res, timelineService.getStatus());
      return;
    }

    if (pathname === "/api/timeline/refresh" && req.method === "POST") {
      try {
        await timelineService.refreshNow();
        sendJson(res, { ok: true, status: timelineService.getStatus() });
      } catch (error) {
        sendJson(
          res,
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
      return;
    }

    if (pathname === "/api/user" || pathname === "/api/users/me" || pathname === "/api/profile") {
      sendJson(res, { ok: true, authEnabled: authEnabled(), user: requestUser ?? MOCK_USER });
      return;
    }

    const normalizedPath = pathname === "/" ? "/timeline.html" : pathname;
    const primary = safeJoin(staticRoot, normalizedPath);

    if (!primary) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("Bad request.");
      return;
    }

    let filePath = primary;
    let fileBuffer = await readMaybe(filePath);

    if (!fileBuffer && !path.extname(filePath)) {
      filePath = `${filePath}.html`;
      fileBuffer = await readMaybe(filePath);
    }

    if (!fileBuffer) {
      if (pathname.startsWith("/api/")) {
        sendJson(res, {});
        return;
      }
      const spaEntry = safeJoin(staticRoot, "/timeline.html");
      if (spaEntry) {
        filePath = spaEntry;
        fileBuffer = await readMaybe(filePath);
      }
      if (!fileBuffer) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found.");
        return;
      }
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[extension] ?? "application/octet-stream";

    let responseBody = fileBuffer;

    if (path.basename(filePath) === "timeline.html") {
      const authBypassScript =
        "<script>(function(){try{localStorage.clear();}catch(e){}localStorage.setItem('accessToken','local-dev-access-token');localStorage.setItem('refreshToken','local-dev-refresh-token');localStorage.setItem('accessTokenExpirationTime','2099-12-31T23:59:59.000Z');localStorage.setItem('refreshTokenExpirationTime','2099-12-31T23:59:59.000Z');localStorage.setItem('role','ADMIN');localStorage.setItem('firstname','Local');localStorage.setItem('lastname','Operator');localStorage.setItem('userId','local-user-id');const forceTimeline=function(){if(location.pathname==='/'||location.pathname==='/login'){history.replaceState({},'', '/timeline');}};forceTimeline();setInterval(forceTimeline,300);})();</script>";
      const wallAssets =
        '<link rel="stylesheet" href="/admin-common.css" /><script defer src="/wall-menu.js"></script>';
      responseBody = Buffer.from(
        fileBuffer
          .toString("utf-8")
          .replace("</head>", `${authBypassScript}${wallAssets}</head>`),
        "utf-8"
      );
    }

    if (path.basename(filePath) === "app.ea7fb7f2.js") {
      responseBody = Buffer.from(
        fileBuffer
          .toString("utf-8")
          .replaceAll("http://164.92.164.35:80/api", "/api"),
        "utf-8"
      );
    }

    res.writeHead(200, { "content-type": contentType });
    res.end(responseBody);
  } catch (error) {
    sendJson(
      res,
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500
    );
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Serving copied timeline at http://localhost:${port}\n`);
  process.stdout.write(`Admin pages: /operators, /aircrafts, /backend-test\n`);
  process.stdout.write(
    `Timeline API ready at /api/timeline/flights, /api/timeline/aircraft, /api/timeline/limitations, /api/timeline/sync-status\n`
  );
});
