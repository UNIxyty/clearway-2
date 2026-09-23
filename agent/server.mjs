// Clearway dispatcher agent — service entry point.
//
// Shape follows digital-wall/server.mjs: a plain node http server with explicit
// path dispatch, JSON in and out, so the two backend services read the same way.
//
// Request order is the contract of this whole part, and it is the same for
// every route that is not /api/health:
//     authenticate (fails closed)  ->  gate (kill switch + allowlist)  ->  work
//                                                                  \-> audit
// The agent carries the CALLER's session. There is no service account.

import http from "node:http";
import { randomUUID } from "node:crypto";
import { authenticateRequest, describeAuthPosture, authConfigured } from "./lib/auth.mjs";
import { assertMayUseAgent, availabilityFor } from "./lib/access.mjs";
import { audit, storeConfigured } from "./lib/store.mjs";
import { streamConversation } from "./lib/bedrock.mjs";
import { loadModelConfig, resolveTier } from "./lib/models.mjs";
import { AgentError, BadRequest } from "./lib/errors.mjs";

const PORT = Number(process.env.PORT || 5175);
const SERVICE = "agent";
const MAX_BODY_BYTES = 256 * 1024;

function sendJson(res, payload, status = 200, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function sendError(res, error) {
  if (error instanceof AgentError) return sendJson(res, error.toJSON(), error.status);
  process.stderr.write(`[agent] unhandled: ${error?.stack || error}\n`);
  return sendJson(res, { ok: false, error: "internal_error", message: "Unexpected server error." }, 500);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw BadRequest("Request body is too large.");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw BadRequest("Request body must be valid JSON.");
  }
}

// The gateway may or may not strip a /agent prefix depending on how it is
// wired, so accept both forms rather than depending on proxy configuration.
function normalizePath(pathname) {
  if (pathname === "/agent") return "/";
  if (pathname.startsWith("/agent/")) return pathname.slice("/agent".length);
  return pathname;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = normalizePath(url.pathname);

  try {
    // ── Health: the only unauthenticated route. Shaped like the wall's and the
    // workers' so lib/service-checker.ts can prove the deployed version. ──
    if (pathname === "/api/health" && (req.method === "GET" || req.method === "HEAD")) {
      const models = loadModelConfig();
      return sendJson(res, {
        ok: true,
        service: SERVICE,
        time: new Date().toISOString(),
        auth: authConfigured() || String(process.env.DISABLE_AUTH_FOR_TESTING || "") === "true" ? "configured" : "misconfigured",
        store: storeConfigured() ? "configured" : "misconfigured",
        region: models.region,
        activeTier: models.activeTier,
      });
    }

    // Everything below requires a signed-in caller.
    const user = await authenticateRequest(req);
    if (!user) {
      return sendJson(res, { ok: false, error: "unauthorized", message: "Sign in through the Clearway portal first." }, 401);
    }

    // ── Availability: what the portal asks to decide whether the agent exists
    // for this user at all. Deliberately does NOT 403 — it answers truthfully
    // so the UI can render nothing rather than a disabled control. ──
    if (pathname === "/api/availability" && req.method === "GET") {
      const availability = await availabilityFor(user);
      return sendJson(res, { ok: true, ...availability });
    }

    if (pathname === "/api/chat" && req.method === "POST") {
      return await handleChat(req, res, user);
    }

    return sendJson(res, { ok: false, error: "not_found", message: `No route for ${req.method} ${pathname}` }, 404);
  } catch (error) {
    return sendError(res, error);
  }
});

async function handleChat(req, res, user) {
  const body = await readJsonBody(req);
  const conversationId = String(body.conversationId || randomUUID());
  const requestedTier = String(body.tier || "standard");
  const startedAt = Date.now();

  // The gate runs on every turn — that is what makes a revocation bite mid-session.
  try {
    await assertMayUseAgent(user);
  } catch (error) {
    await audit({
      kind: "chat.denied",
      userId: user.userId,
      userEmail: user.email,
      conversationId,
      modelTier: requestedTier,
      success: false,
      error: error instanceof AgentError ? error.code : String(error?.message || error),
    });
    throw error;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0 || !messages.some((m) => String(m?.content || "").trim())) {
    throw BadRequest("At least one message with content is required.");
  }

  const { requested, effective } = resolveTier(requestedTier);
  await audit({
    kind: "chat.request",
    userId: user.userId,
    userEmail: user.email,
    conversationId,
    modelTier: requested,
    success: null,
    detail: { effectiveTier: effective, messageCount: messages.length },
  });

  // Server-sent events: the wall's stream endpoint uses the same headers, and
  // the gateway config for this path must not buffer.
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send("start", { conversationId, requestedTier: requested, effectiveTier: effective });

  let done = null;
  try {
    for await (const chunk of streamConversation({
      tier: requestedTier,
      system: body.system ? String(body.system) : undefined,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })) {
      if (chunk.type === "delta") send("delta", { text: chunk.text });
      else if (chunk.type === "done") done = chunk;
    }
    send("done", {
      conversationId,
      modelId: done?.modelId ?? null,
      stopReason: done?.stopReason ?? null,
      inputTokens: done?.inputTokens ?? null,
      outputTokens: done?.outputTokens ?? null,
    });
    await audit({
      kind: "chat.response",
      userId: user.userId,
      userEmail: user.email,
      conversationId,
      modelTier: requested,
      modelId: done?.modelId ?? null,
      success: true,
      latencyMs: Date.now() - startedAt,
      inputTokens: done?.inputTokens ?? null,
      outputTokens: done?.outputTokens ?? null,
      confirmationStatus: "not_required",
      detail: { effectiveTier: effective, stopReason: done?.stopReason ?? null },
    });
  } catch (error) {
    // The stream is already open, so the failure is delivered as an event with
    // its distinct code rather than an HTTP status the client will never see.
    const code = error instanceof AgentError ? error.code : "model_error";
    send("error", { error: code, message: String(error?.message || error), retryable: Boolean(error?.retryable) });
    await audit({
      kind: "chat.error",
      userId: user.userId,
      userEmail: user.email,
      conversationId,
      modelTier: requested,
      success: false,
      error: `${code}: ${String(error?.message || error).slice(0, 500)}`,
      latencyMs: Date.now() - startedAt,
      detail: { effectiveTier: effective },
    });
  } finally {
    res.end();
  }
}

server.listen(PORT, () => {
  const models = loadModelConfig();
  process.stdout.write(`Clearway agent service on :${PORT}\n`);
  process.stdout.write(`  auth:   ${describeAuthPosture()}\n`);
  process.stdout.write(`  store:  ${storeConfigured() ? "Supabase service role configured" : "MISCONFIGURED — access checks fail closed"}\n`);
  process.stdout.write(`  models: region ${models.region}, all tiers pinned to "${models.activeTier ?? "(per-request)"}"\n`);
});
