import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { LeonTimelineService } from "./leon-sync.mjs";
import { OperatorsStore } from "./operators-store.mjs";

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
const timelineService = new LeonTimelineService({ staticRoot, operatorsStore });
await timelineService.bootstrap();

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

    if (pathname.startsWith("/api/auth/")) {
      sendJson(res, mockAuthPayload);
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

    if (pathname === "/api/timeline/limitations") {
      sendJson(res, timelineService.getLimitations());
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
      sendJson(res, mockAuthPayload.user);
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
        "<script>(function(){localStorage.setItem('accessToken','local-dev-access-token');localStorage.setItem('refreshToken','local-dev-refresh-token');localStorage.setItem('accessTokenExpirationTime','2099-12-31T23:59:59.000Z');localStorage.setItem('refreshTokenExpirationTime','2099-12-31T23:59:59.000Z');localStorage.setItem('role','ADMIN');localStorage.setItem('firstname','Local');localStorage.setItem('lastname','Operator');localStorage.setItem('userId','local-user-id');const forceTimeline=function(){if(location.pathname==='/'||location.pathname==='/login'){history.replaceState({},'', '/timeline');}};forceTimeline();setInterval(forceTimeline,300);})();</script>";
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
