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
import { NotamCheckService } from "./lib/notam-check.mjs";
import { AipSendService } from "./lib/aip-send.mjs";
import { LeonWebhookService, WEBHOOK_EVENTS } from "./lib/leon-webhooks.mjs";
import { CHECK_TYPES, FlightChecksStore } from "./lib/flight-checks.mjs";
import { ReportsStore, REPORT_STATUS_LABELS } from "./lib/reports-store.mjs";
import { escapeHtml, mailerConfigured, renderTemplateFile, sendEmail } from "./lib/mailer.mjs";
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
// Any sync cycle that changed flights pushes the wall to re-read the cache
// immediately — updated timings/movement land in ~1-2s, not at the next poll.
timelineService.onFlightsChanged = ({ updated, deleted }) => {
  sseHub.broadcast({ type: "flight.changed", via: "sync", updated, deleted });
};

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
// WX markers attach to flights of TODAY and TOMORROW (UTC) — the same
// two-day span the daily 00:01 UTC weather pull covers (flights sync two
// days ahead; each day's run overwrites what yesterday fetched).
timelineService.weatherEligible = (flight) => {
  const start = Date.parse(flight?.startTimeUTC ?? "");
  if (!Number.isFinite(start)) return false;
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  return start >= dayStart.getTime() && start < dayStart.getTime() + 2 * 86_400_000;
};
process.stdout.write(`CheckWX weather: ${checkwxConfigured() ? "configured" : "idle (set CHECKWX_API_KEY)"}\n`);

// Daily flight-weather pull (00:01 UTC): collect every dep/arr airport of
// flights from today 00:01 UTC through the END of tomorrow and refresh
// their decoded METARs once per UTC day, overwriting yesterday's entries.
const listUpcomingWeatherIcaos = async () => {
  const from = new Date();
  from.setUTCHours(0, 1, 0, 0);
  const to = new Date(from.getTime());
  to.setUTCDate(to.getUTCDate() + 2);
  to.setUTCHours(0, 0, 0, 0);
  const payload = await timelineService.getFlights({
    from: from.toISOString(),
    to: to.toISOString(),
    allOperators: true,
    applyTimeWindow: false,
  });
  const icaos = [];
  for (const group of payload.aircraft ?? []) {
    for (const flight of group.flights ?? []) {
      if (flight?.adep?.icao) icaos.push(flight.adep.icao);
      if (flight?.ades?.icao) icaos.push(flight.ades.icao);
    }
  }
  return icaos;
};
weatherService.startDailyFlightScheduler(listUpcomingWeatherIcaos);

// Item 9: getFlights filters by the adjustable upcoming-horizon /
// post-landing window; thresholds live with the display settings.
timelineService.getVisibilitySettings = async () => {
  // Bug report 3 items 5+8: the visible window is GLOBAL — one wall
  // reality. It reads ONLY the shared default (the Visibility card writes
  // there); per-account profiles carry stale copies of the window keys
  // from full-object saves (the main wall's seeded 17h/2h silently
  // overrode every later edit — flights >13h out never appeared and
  // landed flights vanished after ~2h no matter what ops configured).
  const shape = await readDisplayProfiles();
  return { ...DEFAULT_DISPLAY_SETTINGS, ...shape.default };
};

// Console Reports (bug report item 13) — internal issue tracker + routing.
const reportsStore = new ReportsStore();
await reportsStore.load();

// Per-flight "Checked" acks (timeline info tab) — reset each check cycle.
const flightChecksStore = new FlightChecksStore();
await flightChecksStore.load();
timelineService.flightChecksStore = flightChecksStore;

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
const DEFAULT_DISPLAY_SETTINGS = { scale: 1.3, timeZoom: 1, rowZoom: 1, pillHeight: 1, markerScale: 1, labelScale: 1, autoFitRows: false, overlayScale: 1.3, sidebarScale: 1.3, headerScale: 1.3, acColScale: 1, upcomingHorizonHours: 17, postLandingHours: 2, mvtThresholdMin: 15, mvtFlashSeconds: 1, upcomingTableEnabled: false, upcomingTableSide: "right", upcomingTableScale: 1, upcomingTableWidthPct: 30 };
const displaySettingsStore = new JsonFileStore("display-settings.json", DEFAULT_DISPLAY_SETTINGS);

// Per-ACCOUNT settings profiles (bug report item 3). File shape v3:
//   { default: {settings}, accounts: { <email>: {settings} } }
// The main ops-room wall signs in as MAIN_WALL_ACCOUNT — its profile IS the
// big screen. Personal accounts get their own profile on first save; until
// then they follow `default`. Migration: a legacy flat file becomes
// `default`; the short-lived per-DEVICE shape (v2) migrates its default
// into the main-wall account (device profiles are dropped — they existed
// for days and the requirement is account-keyed). Any signed-in console
// user may edit the main wall (console access is the privilege gate);
// personal profiles are writable only by their own account.
const MAIN_WALL_ACCOUNT = "ops@clearway.aero";

function migrateSettingsShape(stored) {
  if (stored && typeof stored === "object" && stored.accounts && typeof stored.accounts === "object") {
    return { default: stored.default ?? {}, accounts: stored.accounts };
  }
  if (stored && typeof stored === "object" && stored.default && typeof stored.default === "object") {
    // v2 (device-keyed): seed the main wall from the shared default so the
    // big screen looks unchanged after deploy.
    return {
      default: stored.default,
      accounts: { [MAIN_WALL_ACCOUNT]: { ...DEFAULT_DISPLAY_SETTINGS, ...stored.default } },
    };
  }
  const { updatedAt, ...legacy } = stored || {};
  const base = { ...DEFAULT_DISPLAY_SETTINGS, ...legacy };
  return { default: base, accounts: { [MAIN_WALL_ACCOUNT]: base } };
}

async function readDisplayProfiles() {
  const stored = await displaySettingsStore.read().catch(() => null);
  return migrateSettingsShape(stored);
}

function resolveDisplaySettings(shape, account) {
  const key = String(account || "").trim().toLowerCase();
  if (key && shape.accounts[key]) {
    return { settings: { ...DEFAULT_DISPLAY_SETTINGS, ...shape.default, ...shape.accounts[key] }, source: "account" };
  }
  return { settings: { ...DEFAULT_DISPLAY_SETTINGS, ...shape.default }, source: "default" };
}

// Registered display devices (viewport diagnostics + profile labels).
const displayDevicesStore = new JsonFileStore("display-devices.json", { devices: {} });

function sanitizeDisplaySettings(input = {}) {
  const scale = Number(input.scale);
  // Density push (wall declutter): floors low enough for a physically huge
  // screen to pack many rows; absolute legibility floors live in
  // pillVerticalMetrics (fonts never below 7px).
  if (!Number.isFinite(scale) || scale < 0.1 || scale > 2) {
    throw new Error("scale must be a number between 0.1 and 2.0.");
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
  if (!Number.isFinite(rowZoom) || rowZoom < 0.02 || rowZoom > 1.4) {
    throw new Error("rowZoom must be a number between 0.02 and 1.4.");
  }
  // Item 3: finer vertical sizing — pill body thickness, marker-row size and
  // label (ID / route / times) size adjust independently of row spacing.
  // Hard floors live in pillVerticalMetrics (fonts never drop below 7px,
  // marker chips below 10px) so nothing clips even at slider minimums.
  const pillHeight = input.pillHeight === undefined ? DEFAULT_DISPLAY_SETTINGS.pillHeight : Number(input.pillHeight);
  if (!Number.isFinite(pillHeight) || pillHeight < 0.4 || pillHeight > 1.4) {
    throw new Error("pillHeight must be a number between 0.4 and 1.4.");
  }
  const markerScale = input.markerScale === undefined ? DEFAULT_DISPLAY_SETTINGS.markerScale : Number(input.markerScale);
  if (!Number.isFinite(markerScale) || markerScale < 0.5 || markerScale > 1.3) {
    throw new Error("markerScale must be a number between 0.5 and 1.3.");
  }
  const labelScale = input.labelScale === undefined ? DEFAULT_DISPLAY_SETTINGS.labelScale : Number(input.labelScale);
  if (!Number.isFinite(labelScale) || labelScale < 0.5 || labelScale > 1.3) {
    throw new Error("labelScale must be a number between 0.5 and 1.3.");
  }
  // Independent scales (Item 2): the side overlay and the sidebars (clocks
  // bar + legend/limitations panel) size on their own — the main display
  // scale no longer moves them.
  const overlayScale = input.overlayScale === undefined ? DEFAULT_DISPLAY_SETTINGS.overlayScale : Number(input.overlayScale);
  if (!Number.isFinite(overlayScale) || overlayScale < 1 || overlayScale > 2) {
    throw new Error("overlayScale must be a number between 1.0 and 2.0.");
  }
  const sidebarScale = input.sidebarScale === undefined ? DEFAULT_DISPLAY_SETTINGS.sidebarScale : Number(input.sidebarScale);
  if (!Number.isFinite(sidebarScale) || sidebarScale < 0.3 || sidebarScale > 2) {
    throw new Error("sidebarScale must be a number between 0.3 and 2.0.");
  }
  // Shrinkable chrome (wall declutter): the top clock bar and the left
  // aircraft column size independently so they don't eat row space.
  const headerScale = input.headerScale === undefined ? DEFAULT_DISPLAY_SETTINGS.headerScale : Number(input.headerScale);
  if (!Number.isFinite(headerScale) || headerScale < 0.3 || headerScale > 2) {
    throw new Error("headerScale must be a number between 0.3 and 2.0.");
  }
  const acColScale = input.acColScale === undefined ? DEFAULT_DISPLAY_SETTINGS.acColScale : Number(input.acColScale);
  if (!Number.isFinite(acColScale) || acColScale < 0.3 || acColScale > 1.5) {
    throw new Error("acColScale must be a number between 0.3 and 1.5.");
  }
  // MVT flash (bug report 3 item 7): missing T/O past threshold blinks the
  // pill outline. Reference = CTOT/ETD when present, else STD.
  const mvtThresholdMin = input.mvtThresholdMin === undefined ? DEFAULT_DISPLAY_SETTINGS.mvtThresholdMin : Number(input.mvtThresholdMin);
  if (!Number.isFinite(mvtThresholdMin) || mvtThresholdMin < 5 || mvtThresholdMin > 60) {
    throw new Error("mvtThresholdMin must be a number between 5 and 60.");
  }
  const mvtFlashSeconds = input.mvtFlashSeconds === undefined ? DEFAULT_DISPLAY_SETTINGS.mvtFlashSeconds : Number(input.mvtFlashSeconds);
  if (!Number.isFinite(mvtFlashSeconds) || mvtFlashSeconds < 0.4 || mvtFlashSeconds > 4) {
    throw new Error("mvtFlashSeconds must be a number between 0.4 and 4.");
  }
  // Upcoming Flight Table (bug report 3 item 10).
  const upcomingTableEnabled = input.upcomingTableEnabled === undefined
    ? DEFAULT_DISPLAY_SETTINGS.upcomingTableEnabled
    : input.upcomingTableEnabled === true;
  const upcomingTableSide = input.upcomingTableSide === undefined
    ? DEFAULT_DISPLAY_SETTINGS.upcomingTableSide
    : String(input.upcomingTableSide);
  if (!["left", "right"].includes(upcomingTableSide)) {
    throw new Error("upcomingTableSide must be 'left' or 'right'.");
  }
  const upcomingTableScale = input.upcomingTableScale === undefined ? DEFAULT_DISPLAY_SETTINGS.upcomingTableScale : Number(input.upcomingTableScale);
  if (!Number.isFinite(upcomingTableScale) || upcomingTableScale < 0.5 || upcomingTableScale > 2) {
    throw new Error("upcomingTableScale must be a number between 0.5 and 2.");
  }
  const upcomingTableWidthPct = input.upcomingTableWidthPct === undefined ? DEFAULT_DISPLAY_SETTINGS.upcomingTableWidthPct : Number(input.upcomingTableWidthPct);
  if (!Number.isFinite(upcomingTableWidthPct) || upcomingTableWidthPct < 15 || upcomingTableWidthPct > 60) {
    throw new Error("upcomingTableWidthPct must be a number between 15 and 60.");
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
    // Item 2 (wall sizing): wall computes vertical knobs itself to fit all
    // aircraft rows; the sliders become the ceiling values.
    autoFitRows: input.autoFitRows === true,
    scale: Math.round(scale * 100) / 100,
    timeZoom: Math.round(timeZoom * 100) / 100,
    rowZoom: Math.round(rowZoom * 100) / 100,
    pillHeight: Math.round(pillHeight * 100) / 100,
    markerScale: Math.round(markerScale * 100) / 100,
    labelScale: Math.round(labelScale * 100) / 100,
    overlayScale: Math.round(overlayScale * 100) / 100,
    sidebarScale: Math.round(sidebarScale * 100) / 100,
    headerScale: Math.round(headerScale * 100) / 100,
    acColScale: Math.round(acColScale * 100) / 100,
    mvtThresholdMin: Math.round(mvtThresholdMin),
    mvtFlashSeconds: Math.round(mvtFlashSeconds * 10) / 10,
    upcomingTableEnabled,
    upcomingTableSide,
    upcomingTableScale: Math.round(upcomingTableScale * 100) / 100,
    upcomingTableWidthPct: Math.round(upcomingTableWidthPct),
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

    // ── Console Reports (bug report item 13) ──
    if (pathname === "/api/reports" && req.method === "GET") {
      const reports = reportsStore.list({
        status: url.searchParams.get("status") || "",
        category: url.searchParams.get("category") || "",
        q: url.searchParams.get("q") || "",
      });
      sendJson(res, {
        ok: true,
        reports,
        categories: reportsStore.categories,
        presets: reportsStore.presets,
        mailerConfigured: mailerConfigured(),
      });
      return;
    }

    if (pathname === "/api/reports" && req.method === "POST") {
      const body = await readJsonBody(req);
      try {
        const report = await reportsStore.upsert(body, requestUser?.email ?? null);
        sseHub.broadcast({ type: "reports.changed", action: "upsert", id: report.id });
        sendJson(res, { ok: true, report });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
      }
      return;
    }

    if (pathname === "/api/reports/config" && req.method === "PUT") {
      const body = await readJsonBody(req);
      try {
        const config = await reportsStore.saveConfig(body);
        sseHub.broadcast({ type: "reports.changed", action: "config" });
        sendJson(res, { ok: true, ...config });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
      }
      return;
    }

    // Send a report to specific recipients through the branded template.
    // Failures are LOUD: a non-ok mailer result becomes a 502 with the
    // provider error surfaced to the page (this system was bitten by
    // silent email failures before).
    if (/^\/api\/reports\/[^/]+\/send$/.test(pathname) && req.method === "POST") {
      const id = decodeURIComponent(pathname.split("/")[3]);
      const body = await readJsonBody(req);
      const to = (Array.isArray(body.to) ? body.to : [body.to])
        .map((v) => String(v || "").trim())
        .filter((v) => /.+@.+\..+/.test(v));
      if (to.length === 0) {
        sendJson(res, { ok: false, error: "At least one valid recipient email is required." }, 400);
        return;
      }
      const report = reportsStore.reports.find((r) => r.id === id);
      if (!report) {
        sendJson(res, { ok: false, error: "Report not found." }, 404);
        return;
      }
      const base = String(process.env.DIGITAL_WALL_PUBLIC_URL || "https://clearway.verxyl.com/digital-wall")
        .trim()
        .replace(/\/+$/, "");
      const subject = `[REPORT · ${report.category}] ${report.title}`;
      const html = await renderTemplateFile(path.resolve(cwd, "templates", "report.html"), {
        subject,
        category: report.category,
        title: report.title,
        statusLabel: REPORT_STATUS_LABELS[report.status] ?? report.status,
        raisedLine: `RAISED BY ${(report.createdBy || "console").toUpperCase()} · ${String(report.createdAt).slice(0, 16).replace("T", " ")}Z`,
        bodyHtml: escapeHtml(report.body || "(no description)").replaceAll("\n", "<br/>"),
        link: `${base}/console/reports?report=${encodeURIComponent(report.id)}`,
      });
      const result = await sendEmail({ to, subject, html });
      if (!result.ok) {
        console.error(`[reports] send FAILED for ${id} -> ${to.join(", ")}: ${result.error}`);
        sendJson(res, { ok: false, error: `Email send failed: ${result.error}` }, 502);
        return;
      }
      const updated = await reportsStore.recordSend(id, { to, by: requestUser?.email ?? null, resendId: result.id });
      sseHub.broadcast({ type: "reports.changed", action: "sent", id });
      sendJson(res, { ok: true, report: updated, resendId: result.id });
      return;
    }

    if (pathname.startsWith("/api/reports/") && req.method === "PATCH") {
      const id = decodeURIComponent(pathname.split("/").pop());
      const body = await readJsonBody(req);
      try {
        const report = await reportsStore.patch(id, body, requestUser?.email ?? null);
        sseHub.broadcast({ type: "reports.changed", action: "upsert", id });
        sendJson(res, { ok: true, report });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
      }
      return;
    }

    if (pathname.startsWith("/api/reports/") && req.method === "DELETE") {
      const id = decodeURIComponent(pathname.split("/").pop());
      try {
        await reportsStore.remove(id);
        sseHub.broadcast({ type: "reports.changed", action: "delete", id });
        sendJson(res, { ok: true });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
      }
      return;
    }

    // ── Per-flight Checked acks (timeline info tab) ──
    if (pathname === "/api/flight-checks" && req.method === "POST") {
      const body = await readJsonBody(req);
      const oprId = String(body.oprId || "").trim();
      const flightNid = String(body.flightNid || "").trim();
      if (!oprId || !flightNid) {
        sendJson(res, { ok: false, error: "oprId and flightNid are required." }, 400);
        return;
      }
      const types = body.types === "all" ? [...CHECK_TYPES] : body.types;
      try {
        const checks = await flightChecksStore.setChecked(`${oprId}:${flightNid}`, types, {
          actor: requestUser?.email ?? null,
          checked: body.checked !== false,
        });
        // Everything reads the decorated payload, so one broadcast updates
        // the wall pill markers, console rows and the tab within ~1-2s.
        sseHub.broadcast({ type: "flight.changed", via: "flight-checks", oprId, flightNids: [flightNid] });
        sendJson(res, { ok: true, checks });
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
      }
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
      // Decoded CheckWX summaries from the wall's weather state. Still NO
      // on-demand CheckWX fetches — the 00:01 UTC daily pull (today through
      // end of tomorrow) plus the 10:00 NOTAM-check refresh and manual
      // resync keep the cache warm; the tab serves whatever is cached, for
      // the same two-day span the pills use.
      const wxToday = timelineService.weatherEligible(found.flight);
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
    if (pathname === "/api/admin/refresh-flight-weather" && req.method === "POST") {
      // Manual trigger of the daily 00:01 UTC flight-weather pull (testing /
      // catch-up). Same code path as the scheduler.
      const result = await weatherService.runDailyFlightRefresh(listUpcomingWeatherIcaos, { reason: "manual" });
      sendJson(res, { ok: result.ok === true, refreshed: result.refreshed ?? 0, lastRun: weatherService.lastDailyRun });
      return;
    }

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
      const shape = await readDisplayProfiles();
      const own = String(requestUser?.email || "").toLowerCase();
      const requested = String(url.searchParams.get("account") || "").toLowerCase();
      // Explicit targets: your own profile or the main wall. Anything else
      // falls back to your own view.
      const account = requested === MAIN_WALL_ACCOUNT || requested === own ? requested : own;
      const resolved = resolveDisplaySettings(shape, account);
      sendJson(res, {
        ok: true,
        settings: resolved.settings,
        source: resolved.source,
        account,
        mainWallAccount: MAIN_WALL_ACCOUNT,
        isMainWall: account === MAIN_WALL_ACCOUNT,
      });
      return;
    }

    if (pathname === "/api/display/settings" && req.method === "PUT") {
      const body = await readJsonBody(req);
      const own = String(requestUser?.email || "").toLowerCase();
      const requested = String(body.account || "").trim().toLowerCase();
      // Writable targets: your OWN profile (default) or the MAIN WALL.
      // Another user's personal profile is never writable.
      const account = requested === MAIN_WALL_ACCOUNT ? MAIN_WALL_ACCOUNT : own;
      let settings;
      const shape = await readDisplayProfiles();
      try {
        // Merge over the target profile so a partial PUT (e.g. only scale)
        // never silently resets the other knobs. First save copies the
        // resolved view into the account's own profile.
        const base = { ...DEFAULT_DISPLAY_SETTINGS, ...shape.default, ...(shape.accounts[account] ?? {}) };
        settings = sanitizeDisplaySettings({ ...base, ...(body.settings ?? body) });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message }, 400);
        return;
      }
      shape.accounts[account] = settings;
      await displaySettingsStore.write({ ...shape, updatedAt: new Date().toISOString() });
      // The account in the event lets each surface ignore edits aimed at a
      // DIFFERENT profile (personal tuning must not resize the big screen).
      sseHub.broadcast({ type: "config.changed", section: "settings", account });
      sendJson(res, { ok: true, settings, account });
      return;
    }

    // Forget an account's own profile (falls back to default). Same access
    // rule as PUT: your own, or the main wall.
    if (pathname.startsWith("/api/display/settings/profile/") && req.method === "DELETE") {
      const own = String(requestUser?.email || "").toLowerCase();
      const requested = decodeURIComponent(pathname.split("/").pop()).toLowerCase();
      const account = requested === MAIN_WALL_ACCOUNT ? MAIN_WALL_ACCOUNT : own;
      const shape = await readDisplayProfiles();
      if (shape.accounts[account]) {
        delete shape.accounts[account];
        await displaySettingsStore.write({ ...shape, updatedAt: new Date().toISOString() });
        sseHub.broadcast({ type: "config.changed", section: "settings", account });
      }
      sendJson(res, { ok: true });
      return;
    }

    // Item 1 diagnostic + device registry: every wall/console surface
    // reports its rendering environment (viewport, DPR, zoom, root font)
    // so sizing decisions rest on real numbers, not guesses. Auto-fit also
    // reports its computed knobs here for the read-only console readout.
    if (pathname === "/api/display/env" && req.method === "POST") {
      const body = await readJsonBody(req);
      const deviceId = String(body.deviceId || "").trim();
      if (!deviceId) {
        sendJson(res, { ok: false, error: "deviceId is required" }, 400);
        return;
      }
      const stored = await displayDevicesStore.read();
      const devices = stored.devices && typeof stored.devices === "object" ? stored.devices : {};
      const existing = devices[deviceId] ?? {};
      devices[deviceId] = {
        ...existing,
        label: typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 60) : existing.label ?? null,
        surface: typeof body.surface === "string" ? body.surface.slice(0, 20) : existing.surface ?? null,
        env: body.env && typeof body.env === "object" ? body.env : existing.env ?? null,
        computedFit: body.computedFit && typeof body.computedFit === "object" ? body.computedFit : existing.computedFit ?? null,
        firstSeenAt: existing.firstSeenAt ?? new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      await displayDevicesStore.write({ devices });
      sendJson(res, { ok: true });
      return;
    }

    if (pathname === "/api/display/devices" && req.method === "GET") {
      const stored = await displayDevicesStore.read();
      const devices = Object.entries(stored.devices ?? {}).map(([id, device]) => ({
        deviceId: id,
        ...device,
      }));
      devices.sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
      sendJson(res, { ok: true, devices });
      return;
    }

    if (pathname.startsWith("/api/display/devices/") && req.method === "PATCH") {
      const deviceId = decodeURIComponent(pathname.split("/").pop());
      const body = await readJsonBody(req);
      const stored = await displayDevicesStore.read();
      if (!stored.devices?.[deviceId]) {
        sendJson(res, { ok: false, error: "Unknown device" }, 404);
        return;
      }
      if (typeof body.label === "string") stored.devices[deviceId].label = body.label.trim().slice(0, 60) || null;
      await displayDevicesStore.write(stored);
      sendJson(res, { ok: true, device: { deviceId, ...stored.devices[deviceId] } });
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
      // Toggle must be INSTANT: getFlights already filters by the active
      // operator set, so the wall drops/readds this operator's flights on
      // the very next fetch — broadcast now, never behind a Leon sync cycle
      // (awaiting refreshNow here once made disable take ~30s).
      if (body.isActive) {
        // Re-enable: the incremental modified-list never re-delivers
        // untouched flights (flight-watch writes don't mark them modified),
        // so resuming from the old checkpoint would leave past-departure
        // flights white. Drop the checkpoint → next cycle runs a FULL
        // initial sync; kick that cycle in the background right away.
        timelineService.syncStateByOperator.delete(operator.oprId);
        timelineService.invalidateOperatorCredentials(operator.oprId);
        timelineService.refreshNow().catch(() => {});
      }
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

    if (pathname === "/api/upcoming/flights" && req.method === "GET") {
      // Upcoming Flight Table (bug report 3 item 10): every flight from
      // today 00:01 UTC onward, ignoring the wall's visibility window —
      // the table IS the look-ahead. Hidden aircraft stay hidden.
      try {
        const dayStart = new Date();
        dayStart.setUTCHours(0, 1, 0, 0);
        const payload = await timelineService.getFlights({
          from: dayStart.toISOString(),
          allOperators: true,
          applyTimeWindow: false,
        });
        sendJson(res, payload);
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
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
        const entry = await caaStore.upsert({ ...body, __actor: requestUser?.email ?? null });
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
            : await caaStore.patch(id, { ...body, __actor: requestUser?.email ?? null });
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
