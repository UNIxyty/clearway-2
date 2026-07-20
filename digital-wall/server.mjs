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
import { CaaStore } from "./lib/caa-store.mjs";
import { getNotams, portalConfigured, resolveAipPdf, streamAipPdf } from "./lib/portal-client.mjs";
import { CheckwxWeatherService, checkwxConfigured } from "./lib/checkwx.mjs";
import { AlertsService } from "./lib/alerts.mjs";
import { NotamCheckService, flightZonedDay, zonedNow } from "./lib/notam-check.mjs";
import { AipSendService } from "./lib/aip-send.mjs";
import { LeonWebhookService, WEBHOOK_EVENTS } from "./lib/leon-webhooks.mjs";
import {
  deleteAttachmentBytes,
  MAX_ATTACHMENT_BYTES,
  newAttachmentId,
  readAttachmentBytes,
  sanitizeFilename,
  saveAttachmentBytes,
  validateAttachment,
} from "./lib/attachment-store.mjs";

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
// CAA Details (Item 4): authority contact records + match flags.
const caaStore = new CaaStore();
await caaStore.load();
process.stdout.write(`CAA store: ${caaStore.entries.length} authorities loaded\n`);
const timelineService = new LeonTimelineService({ staticRoot, operatorsStore, importantStore });
timelineService.caaStore = caaStore;
await timelineService.bootstrap();

const sseHub = new SseHub();
process.stdout.write(`Digital Wall auth: ${describeAuthPosture()}\n`);

const alertsService = new AlertsService({ timelineService, sseHub });
await alertsService.load();
timelineService.alertsStore = alertsService;
// No continuous scanning: the NTM/WX scan runs once per day, driven by the
// daily NOTAM check (and on demand via POST /api/alerts/scan).

// CheckWX weather (acknowledgment-only): per-airport flight_category for the
// pill markers + decoded summaries for the overlay. Refreshed alongside the
// daily NOTAM check; no page, no emails, no acking.
const weatherService = new CheckwxWeatherService({ sseHub });
await weatherService.load();
timelineService.weatherLookup = (icao) => weatherService.categoryOf(icao);
// Item 4: WX behaves like the NOTAM check — fetched once per day at 10:00
// Riga for TODAY's airports; markers attach only to today's flights.
timelineService.weatherEligible = (flight) => flightZonedDay(flight) === zonedNow().day;
process.stdout.write(`CheckWX weather: ${checkwxConfigured() ? "configured" : "idle (set CHECKWX_API_KEY)"}\n`);

// Item 9: getFlights filters by the adjustable upcoming-horizon /
// post-landing window; thresholds live with the display settings.
timelineService.getVisibilitySettings = async () => {
  const stored = await displaySettingsStore.read().catch(() => null);
  return { ...DEFAULT_DISPLAY_SETTINGS, ...(stored || {}) };
};

const notamCheck = new NotamCheckService({ timelineService, alertsService, sseHub, weatherService });
await notamCheck.load();
notamCheck.startScheduler();
// NTM/WX pill/overlay markers mean "unreviewed": flight decoration drops a
// finding once its airport carries today's CHECKED ack (Part 3).
timelineService.notamCheckedLookup = (icao) => notamCheck.isAirportCheckedToday(icao);

const aipSend = new AipSendService({ sseHub });

// Leon webhooks (Phase 2): JWT-verified push events -> re-pull triggers.
const leonWebhooks = new LeonWebhookService({ timelineService, sseHub });
await leonWebhooks.load();
if (process.env.LEON_WEBHOOK_AUTOREGISTER === "true") {
  // Optional boot reconciliation (idempotent by label; safe re: the 10-cap
  // because our labels are deterministic and re-register deletes first).
  (async () => {
    try {
      const operators = await timelineService.listConfiguredOperators();
      for (const operator of operators) {
        await leonWebhooks.reRegisterAll(operator.oprId);
      }
      console.log(`[leon-webhooks] boot re-registration done for ${operators.length} operator(s)`);
    } catch (error) {
      console.error("[leon-webhooks] boot re-registration failed:", error?.message || error);
    }
  })();
}
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

// Display settings — global scale/density for ops-room legibility. The wall
// multiplies its typography and pill metrics by `scale`, so the room can
// dial text size up without a rebuild.
const DEFAULT_DISPLAY_SETTINGS = { scale: 1.3, timeZoom: 1, rowZoom: 1, overlayScale: 1.3, sidebarScale: 1.3, upcomingHorizonHours: 17, postLandingHours: 2 };
const displaySettingsStore = new JsonFileStore("display-settings.json", DEFAULT_DISPLAY_SETTINGS);

function sanitizeDisplaySettings(input = {}) {
  const scale = Number(input.scale);
  if (!Number.isFinite(scale) || scale < 1 || scale > 2) {
    throw new Error("scale must be a number between 1.0 and 2.0.");
  }
  // Time-axis zoom: horizontal distance between hour gridlines. 1 = default;
  // 0.5 fits twice the hours on screen, 2.5 spreads them 2.5x wider.
  const timeZoom = input.timeZoom === undefined ? DEFAULT_DISPLAY_SETTINGS.timeZoom : Number(input.timeZoom);
  if (!Number.isFinite(timeZoom) || timeZoom < 0.5 || timeZoom > 2.5) {
    throw new Error("timeZoom must be a number between 0.5 and 2.5.");
  }
  // Vertical size: lane/pill height multiplier. <1 thins the timeline so
  // more registrations fit on screen; text keeps the display scale.
  const rowZoom = input.rowZoom === undefined ? DEFAULT_DISPLAY_SETTINGS.rowZoom : Number(input.rowZoom);
  if (!Number.isFinite(rowZoom) || rowZoom < 0.6 || rowZoom > 1.4) {
    throw new Error("rowZoom must be a number between 0.6 and 1.4.");
  }
  // Independent scales (Item 2): the side overlay and the sidebars (clocks
  // bar + legend/limitations panel) size on their own — the main display
  // scale no longer moves them.
  const overlayScale = input.overlayScale === undefined ? DEFAULT_DISPLAY_SETTINGS.overlayScale : Number(input.overlayScale);
  if (!Number.isFinite(overlayScale) || overlayScale < 1 || overlayScale > 2) {
    throw new Error("overlayScale must be a number between 1.0 and 2.0.");
  }
  const sidebarScale = input.sidebarScale === undefined ? DEFAULT_DISPLAY_SETTINGS.sidebarScale : Number(input.sidebarScale);
  if (!Number.isFinite(sidebarScale) || sidebarScale < 1 || sidebarScale > 2) {
    throw new Error("sidebarScale must be a number between 1.0 and 2.0.");
  }
  // Item 9: time-window visibility thresholds (hours).
  const upcomingHorizonHours = input.upcomingHorizonHours === undefined
    ? DEFAULT_DISPLAY_SETTINGS.upcomingHorizonHours
    : Number(input.upcomingHorizonHours);
  if (!Number.isFinite(upcomingHorizonHours) || upcomingHorizonHours < 1 || upcomingHorizonHours > 72) {
    throw new Error("upcomingHorizonHours must be a number between 1 and 72.");
  }
  const postLandingHours = input.postLandingHours === undefined
    ? DEFAULT_DISPLAY_SETTINGS.postLandingHours
    : Number(input.postLandingHours);
  if (!Number.isFinite(postLandingHours) || postLandingHours < 0 || postLandingHours > 24) {
    throw new Error("postLandingHours must be a number between 0 and 24.");
  }
  return {
    scale: Math.round(scale * 100) / 100,
    timeZoom: Math.round(timeZoom * 100) / 100,
    rowZoom: Math.round(rowZoom * 100) / 100,
    overlayScale: Math.round(overlayScale * 100) / 100,
    sidebarScale: Math.round(sidebarScale * 100) / 100,
    upcomingHorizonHours: Math.round(upcomingHorizonHours * 10) / 10,
    postLandingHours: Math.round(postLandingHours * 10) / 10,
  };
}

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

    // ── Leon webhook receiver (Phase 2) ─────────────────────────────────
    // Public (Leon calls it), NOT Supabase-gated — authenticated by the
    // RS512 JWT Leon signs, verified against the tenant's published key.
    // Fail-closed; events are triggers only (re-pull through the normal
    // pipeline), the payload never writes state directly.
    {
      const webhookMatch = pathname.match(/^\/leon\/webhook\/([a-z0-9-]+)$/i);
      if (webhookMatch && req.method === "POST") {
        const oprId = webhookMatch[1];
        const verification = await leonWebhooks.verifyRequest(oprId, req.headers.authorization);
        if (!verification.ok) {
          console.warn(`[leon-webhooks] rejected call for ${oprId}: ${verification.error}`);
          sendJson(res, { ok: false, error: "verification failed" }, 401);
          return;
        }
        let payload = {};
        try {
          payload = await readJsonBody(req);
        } catch {
          payload = {};
        }
        // ACK fast, process async — Leon shouldn't wait on our re-pull.
        sendJson(res, { ok: true });
        leonWebhooks.handleEvent(oprId, payload).catch((error) => {
          console.error(`[leon-webhooks] async handling failed for ${oprId}:`, error?.message || error);
        });
        return;
      }
    }

    // ── Instruction guide (Item: guide page) ────────────────────────────
    // The finished Claude-Design guide served VERBATIM as static files from
    // digital-wall/guide/ (html + support.js runtime + assets + screenshots).
    // Auth-gated like the console: no session -> portal sign-in and back.
    if (pathname === "/guide") {
      res.writeHead(302, { location: "/digital-wall/guide/" });
      res.end();
      return;
    }
    if (pathname === "/guide/" || pathname.startsWith("/guide/")) {
      const guideUser = await authenticateRequest(req);
      if (!guideUser) {
        res.writeHead(302, {
          location: `/login?next=${encodeURIComponent("/digital-wall/guide/")}`,
        });
        res.end();
        return;
      }
      const rel = pathname === "/guide/" ? "index.html" : pathname.slice("/guide/".length);
      const guideRoot = path.resolve(cwd, "guide");
      const filePath = safeJoin(guideRoot, rel);
      const fileBuffer = filePath ? await readMaybe(filePath) : null;
      if (!fileBuffer) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Guide file not found.");
        return;
      }
      const guideTypes = { ...contentTypes, ".svg": "image/svg+xml", ".png": "image/png", ".md": "text/markdown; charset=utf-8" };
      res.writeHead(200, {
        "content-type": guideTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "public, max-age=300",
      });
      res.end(fileBuffer);
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
      const [depNotams, arrNotams, depAip, arrAip] = await Promise.all([
        depIcao ? getNotams(depIcao) : { ok: false, error: "No departure ICAO." },
        arrIcao ? getNotams(arrIcao) : { ok: false, error: "No arrival ICAO." },
        depIcao ? resolveAipPdf(depIcao) : { available: false },
        arrIcao ? resolveAipPdf(arrIcao) : { available: false },
      ]);
      // Decoded CheckWX summaries from the wall's weather state (refreshed by
      // the daily check; fetch on demand if an airport was never seen).
      // Item 4: NO on-demand CheckWX fetches — weather is fetched once per
      // day (10:00 Riga, today's airports) plus manual resync. The overlay
      // serves whatever the daily run cached, and only for today's flights.
      const wxToday = flightZonedDay(found.flight) === zonedNow().day;
      sendJson(res, {
        ok: true,
        portalConfigured: portalConfigured(),
        flight,
        aircraft: found.aircraft,
        notams: { dep: depNotams, arr: arrNotams },
        weather: {
          dep: wxToday && depIcao ? weatherService.summaryOf(depIcao) : null,
          arr: wxToday && arrIcao ? weatherService.summaryOf(arrIcao) : null,
        },
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
    // One-shot admin purge of the cached flights (auth-gated like all
    // /api/* routes). Flights only — config stores are untouched.
    if (pathname === "/api/admin/clear-flight-cache" && req.method === "POST") {
      try {
        const cleared = await timelineService.clearFlightCache();
        sseHub.broadcast({ type: "roster.changed", reason: "flight-cache-cleared" });
        sendJson(res, { ok: true, cleared });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
      }
      return;
    }

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

    if (pathname === "/api/notam-check/resync" && req.method === "POST") {
      const body = await readJsonBody(req);
      try {
        const state = await notamCheck.resyncAirport(body.icao);
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

    if (pathname === "/api/display/settings" && req.method === "GET") {
      const stored = await displaySettingsStore.read();
      sendJson(res, { ok: true, settings: { ...DEFAULT_DISPLAY_SETTINGS, ...stored } });
      return;
    }

    if (pathname === "/api/display/settings" && req.method === "PUT") {
      const body = await readJsonBody(req);
      let settings;
      try {
        // Merge over the stored settings so a partial PUT (e.g. only scale)
        // never silently resets the other knobs.
        const stored = await displaySettingsStore.read();
        settings = sanitizeDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, ...stored, ...(body.settings ?? body) });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 400);
        return;
      }
      await displaySettingsStore.write({ ...settings, updatedAt: new Date().toISOString() });
      sseHub.broadcast({ type: "config.changed", section: "settings" });
      sendJson(res, { ok: true, settings });
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
      sseHub.broadcast({ type: "roster.changed", action: "operator-upsert", oprId: operator.oprId });
      sendJson(res, { ok: true, operator });
      return;
    }

    if (pathname.startsWith("/api/operators/") && req.method === "PATCH") {
      const id = pathname.split("/").pop();
      const body = await readJsonBody(req);
      // Field edit (name / oprId / write-only token) vs. the active toggle —
      // the toggle keeps its original shape ({isActive} only).
      const isFieldEdit =
        body.name !== undefined || body.oprId !== undefined || body.refreshToken !== undefined;
      if (isFieldEdit) {
        try {
          const result = await operatorsStore.updateOperator(id, body);
          // A changed oprId points at a different Leon tenant — cached
          // flights under the old prefix are no longer this operator's.
          if (result.oprIdChanged) {
            await timelineService.purgeOperator(result.previousOprId).catch(() => {});
          }
          if (result.tokenChanged || result.oprIdChanged) {
            timelineService.invalidateOperatorCredentials(result.operator.oprId);
          }
          await timelineService.refreshNow().catch(() => {});
          sseHub.broadcast({ type: "roster.changed", action: "operator-update", oprId: result.operator.oprId });
          sendJson(res, {
            ok: true,
            operator: result.operator,
            oprIdChanged: result.oprIdChanged,
            tokenChanged: result.tokenChanged,
            // Leon webhook registrations are bound to the refresh token (and
            // the tenant) — after a rotation or prefix change they must be
            // re-registered from the Webhooks page.
            webhooksNeedReregister: result.oprIdChanged || result.tokenChanged,
          });
        } catch (error) {
          sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
        }
        return;
      }
      const operator = await operatorsStore.setOperatorActive(id, Boolean(body.isActive));
      await timelineService.refreshNow().catch(() => {});
      sseHub.broadcast({ type: "roster.changed", action: "operator-toggle", oprId: operator.oprId });
      sendJson(res, { ok: true, operator });
      return;
    }

    if (pathname.startsWith("/api/operators/") && req.method === "DELETE") {
      const id = decodeURIComponent(pathname.split("/").pop());
      try {
        const deleted = await operatorsStore.deleteOperator(id);
        await timelineService.purgeOperator(deleted.oprId).catch(() => {});
        sseHub.broadcast({ type: "roster.changed", action: "operator-delete", oprId: deleted.oprId });
        sendJson(res, { ok: true, ...deleted });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
      }
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
      sseHub.broadcast({ type: "roster.changed", action: "aircraft-visibility", key: result.key, isHidden: result.isHidden });
      sendJson(res, { ok: true, ...result });
      return;
    }

    if (pathname === "/api/aircraft" && req.method === "DELETE") {
      const body = await readJsonBody(req);
      try {
        const purged = await timelineService.purgeAircraft(body.oprId, body.registration);
        sseHub.broadcast({ type: "roster.changed", action: "aircraft-delete", oprId: body.oprId, registration: body.registration });
        sendJson(res, { ok: true, purged });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
      }
      return;
    }

    // Item 6: /api/geo/* are the canonical names for the shared source (the
    // Supabase `airports` table); /api/airports/search and /api/countries
    // remain as aliases — all serve the SAME directory, so every picker and
    // the flight-country matching agree by construction.
    if ((pathname === "/api/airports/search" || pathname === "/api/geo/airports") && req.method === "GET") {
      const q = url.searchParams.get("q") || "";
      const limit = Number(url.searchParams.get("limit") || 50);
      const airports = timelineService.listAirportMatches(q, limit);
      sendJson(res, { ok: true, q, count: airports.length, airports });
      return;
    }

    if ((pathname === "/api/countries" || pathname === "/api/geo/countries") && req.method === "GET") {
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
    // One-shot force re-review of every IMP entry (Item 8; auth-gated).
    if (pathname === "/api/admin/reset-important-reviews" && req.method === "POST") {
      try {
        const reset = await importantStore.resetAllReviews();
        sseHub.broadcast({ type: "important.changed", action: "reset-reviews", reset });
        sendJson(res, { ok: true, reset });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
      }
      return;
    }

    // ── CAA Details (Item 4) ────────────────────────────────────────────
    if (pathname === "/api/caa" && req.method === "GET") {
      const includeInactive = url.searchParams.get("includeInactive") !== "false";
      const withMatches = url.searchParams.get("withMatches") === "true";
      let entries = caaStore.list({ includeInactive });
      if (withMatches) {
        const counts = new Map();
        for (const [, flight] of timelineService.flightsByNid.entries()) {
          const ctx = timelineService.buildFlightMatchContext(flight);
          for (const entry of caaStore.matchFlight(ctx)) {
            counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
          }
        }
        entries = entries.map((entry) => ({ ...entry, matchedFlightCount: counts.get(entry.id) ?? 0 }));
      }
      sendJson(res, { ok: true, count: entries.length, entries });
      return;
    }

    if (pathname === "/api/caa" && req.method === "POST") {
      const body = await readJsonBody(req);
      try {
        const entry = await caaStore.upsert(body);
        sseHub.broadcast({ type: "caa.changed", action: "upsert", id: entry.id });
        sendJson(res, { ok: true, entry });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 400);
      }
      return;
    }

    if (pathname.startsWith("/api/caa/") && req.method === "PATCH") {
      const id = decodeURIComponent(pathname.split("/").pop());
      const body = await readJsonBody(req);
      try {
        const keys = Object.keys(body ?? {});
        const entry =
          keys.length === 1 && keys[0] === "isActive"
            ? await caaStore.setActive(id, Boolean(body.isActive))
            : await caaStore.patch(id, body);
        sseHub.broadcast({ type: "caa.changed", action: "update", id });
        sendJson(res, { ok: true, entry });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 404);
      }
      return;
    }

    if (pathname.startsWith("/api/caa/") && req.method === "DELETE") {
      const id = decodeURIComponent(pathname.split("/").pop());
      try {
        await caaStore.remove(id);
        sseHub.broadcast({ type: "caa.changed", action: "delete", id });
        sendJson(res, { ok: true, id });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 404);
      }
      return;
    }

    // ── Webhook management (Phase 2b) — console page backend ────────────
    if (pathname === "/api/webhooks" && req.method === "GET") {
      try {
        const operators = await timelineService.listConfiguredOperators();
        // ?refresh=true (the page's Refresh-health button / post-mutation
        // reloads) is the only path that queries Leon; default is cached.
        const refreshRemote = url.searchParams.get("refresh") === "true";
        const status = await leonWebhooks.status(
          operators.map((o) => ({ oprId: o.oprId, name: o.name ?? null })),
          { refreshRemote }
        );
        sendJson(res, { ok: true, ...status });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
      }
      return;
    }

    if (pathname === "/api/webhooks/log" && req.method === "GET") {
      const opr = String(url.searchParams.get("opr") || "");
      const event = String(url.searchParams.get("event") || "");
      sendJson(res, { ok: true, entries: leonWebhooks.logFor(opr, event) });
      return;
    }

    if (pathname === "/api/webhooks/toggle" && req.method === "POST") {
      const body = await readJsonBody(req);
      try {
        await leonWebhooks.setEventEnabled(String(body.oprId || ""), String(body.event || ""), Boolean(body.enabled));
        sendJson(res, { ok: true });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
      }
      return;
    }

    if (pathname === "/api/webhooks/reregister" && req.method === "POST") {
      const body = await readJsonBody(req);
      try {
        const results = await leonWebhooks.reRegisterAll(String(body.oprId || ""));
        sendJson(res, { ok: true, results });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
      }
      return;
    }

    if (pathname.startsWith("/api/webhooks/") && req.method === "DELETE") {
      const label = decodeURIComponent(pathname.split("/").pop());
      const oprId = String(url.searchParams.get("oprId") || "");
      try {
        await leonWebhooks.deleteLabel(oprId, label);
        sendJson(res, { ok: true, label });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
      }
      return;
    }

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

    // Who is acting — used for the added-by / confirmed-by audit trail
    // (Item 8). Falls back to the mock user when auth is disabled locally.
    const actorName = requestUser ? (requestUser.name || requestUser.email || null) : (MOCK_USER.name ?? null);

    if (pathname === "/api/important" && req.method === "POST") {
      const body = await readJsonBody(req);
      try {
        const entry = await importantStore.upsert(body, { actor: actorName });
        sseHub.broadcast({ type: "important.changed", action: "upsert", id: entry.id });
        sendJson(res, { ok: true, entry });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 400);
      }
      return;
    }

    // ── IMP attachments (Item 8) ────────────────────────────────────────
    // Upload: JSON { filename, contentType, dataBase64 } (10 MB cap) —
    // bytes go to Supabase Storage (or data/attachments locally), the entry
    // keeps a reference, downloads stream back through this auth gate.
    {
      const attachmentMatch = pathname.match(/^\/api\/important\/([^/]+)\/attachments(?:\/([^/]+))?$/);
      if (attachmentMatch) {
        const entryId = decodeURIComponent(attachmentMatch[1]);
        const attachmentId = attachmentMatch[2] ? decodeURIComponent(attachmentMatch[2]) : null;

        if (req.method === "POST" && !attachmentId) {
          try {
            const body = await readJsonBody(req);
            const filename = sanitizeFilename(body.filename);
            const buffer = Buffer.from(String(body.dataBase64 || ""), "base64");
            validateAttachment({ filename, size: buffer.length });
            const id = newAttachmentId();
            const { storagePath, backend } = await saveAttachmentBytes({
              entryId,
              attachmentId: id,
              filename,
              contentType: body.contentType,
              buffer,
            });
            const attachment = {
              id,
              filename,
              contentType: String(body.contentType || "application/octet-stream"),
              size: buffer.length,
              storagePath,
              backend,
              uploadedAt: new Date().toISOString(),
              uploadedBy: actorName,
            };
            const entry = await importantStore.addAttachment(entryId, attachment);
            sseHub.broadcast({ type: "important.changed", action: "attachment-add", id: entryId });
            sendJson(res, { ok: true, entry, attachment });
          } catch (error) {
            sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
          }
          return;
        }

        if (req.method === "GET" && attachmentId) {
          const found = importantStore.getAttachment(entryId, attachmentId);
          const bytes = found ? await readAttachmentBytes(found.attachment.storagePath) : null;
          if (!found || !bytes) {
            sendJson(res, { ok: false, error: "Attachment not found." }, 404);
            return;
          }
          res.writeHead(200, {
            "content-type": found.attachment.contentType || "application/octet-stream",
            "content-length": bytes.length,
            "content-disposition": `attachment; filename="${found.attachment.filename.replace(/"/g, "")}"`,
          });
          res.end(bytes);
          return;
        }

        if (req.method === "DELETE" && attachmentId) {
          try {
            const { attachment } = await importantStore.removeAttachment(entryId, attachmentId);
            await deleteAttachmentBytes(attachment.storagePath);
            sseHub.broadcast({ type: "important.changed", action: "attachment-delete", id: entryId });
            sendJson(res, { ok: true, id: attachmentId });
          } catch (error) {
            sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 404);
          }
          return;
        }
      }
    }

    if (pathname.startsWith("/api/important/") && req.method === "PATCH") {
      const id = decodeURIComponent(pathname.split("/").pop());
      const body = await readJsonBody(req);
      try {
        // Bare {isActive} keeps the cheap toggle path; anything else is a
        // full-field partial update (Item 5 — every IMP field is editable).
        const keys = Object.keys(body ?? {});
        const entry =
          keys.length === 1 && keys[0] === "isActive"
            ? await importantStore.setActive(id, Boolean(body.isActive))
            : await importantStore.patch(id, body, { actor: actorName });
        sseHub.broadcast({ type: "important.changed", action: keys.length === 1 && keys[0] === "isActive" ? "toggle" : "update", id });
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
      const id = decodeURIComponent(pathname.split("/").pop());
      try {
        await timelineService.deleteCustomLimitation(id);
      } catch (error) {
        // Permanent-guard refusals and unknown ids are client errors with a
        // readable message, not 500s.
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, { ok: false, error: message }, /permanent/i.test(message) ? 400 : 404);
        return;
      }
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
