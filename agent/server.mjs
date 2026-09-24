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
import { audit, storeConfigured, agentEnabled } from "./lib/store.mjs";
import { streamConversationWithTools } from "./lib/bedrock.mjs";
import { executeTool, toolNamesFor, toolSpecsFor } from "./lib/tools/index.mjs";
import { setCapabilityGate, actionsFromToolCalls, airportsFromToolCalls, documentsFromToolCalls, filesFromToolCalls, flightCardsFromToolCalls, monoFromToolCalls, sourcesFromToolCalls, verbatimFromToolCalls } from "./lib/tools/framework.mjs";
import {
  appendMessage, archiveConversation, createConversation, getConversation,
  listConversations, listMessages, titleFrom,
} from "./lib/conversations.mjs";
import {
  approveTier1Record, classifyDocument, extractText, indexDocument,
  readDocumentFile, storeDocument,
} from "./lib/knowledge/ingest.mjs";
import { rest as knowledgeRest } from "./lib/knowledge/retrieval.mjs";
import { readGeneratedFile, sweepGeneratedFiles } from "./lib/files/store.mjs";
import { listSends, prepareEmail } from "./lib/email/send.mjs";
import { memoryContext } from "./lib/memory-context.mjs";
import { currentTimeLine, loadModelConfig, resolveTier, systemPrompt } from "./lib/models.mjs";
import { languageDirective, normaliseLanguage } from "./lib/voice/language.mjs";
import { routeTurn } from "./lib/router.mjs";
import { getConfirmation, publicView, cancelConfirmation } from "./lib/confirm.mjs";
import { listActivity, requestBehind, activityCsv, CAPABILITIES, capabilities, setCapability, permissionsMatrix, usageThisMonth, knowledgeStats, proposedClauses, searchConversations, suggestions, storeAttachment, loadAttachment, keybinds, setKeybinds, KEYBIND_ACTIONS, KEYBIND_DEFAULTS } from "./lib/views.mjs";
import { rest as knowledgeRest2 } from "./lib/knowledge/retrieval.mjs";
import { AgentError, BadRequest } from "./lib/errors.mjs";

const PORT = Number(process.env.PORT || 5175);

// One tool's stray rejection must not take the whole service down (found on
// the verification rig: an unwritable STORAGE_ROOT killed the process). Log it;
// the request that owned it has already been answered or will time out.
process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[agent] unhandled rejection: ${reason?.stack || reason}\n`);
});
const SERVICE = "agent";
const MAX_BODY_BYTES = 256 * 1024;
// Org capability switches, refreshed every 30 s and updated in place on a PATCH.
let capsNow = {};

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

/**
 * Bound what an attachment may be: a few small TEXT files. The chat body is
 * capped at 256 KB anyway; this keeps one attachment from being the whole
 * context window and refuses anything that is not plain text.
 */
function sanitiseAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 3)) {
    const name = String(item?.name ?? "").replace(/[^\w.\- ()]/g, "_").slice(0, 120).trim();
    const text = String(item?.text ?? "");
    if (!name || !text.trim()) continue;
    if (/[\u0000-\u0008\u000E-\u001F]/.test(text.slice(0, 4000))) continue; // binary pasted as text
    const clipped = text.slice(0, 60_000);
    out.push({ name, text: clipped, chars: text.length, truncated: text.length > clipped.length });
  }
  return out;
}

import { wallGet as wallGetForServer } from "./lib/tools/http.mjs";

/** Raw bytes for an upload, bounded. Anything past the cap ends the request. */
async function readRawBody(req, maxBytes) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > maxBytes) throw BadRequest("The file is over the 25 MB limit."); chunks.push(chunk); }
  return Buffer.concat(chunks);
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

// The tunnel routes `^/agent/.*` here, which also captures the portal's own
// pages under /agent/* (History, Activity log, …). Until the ingress is
// narrowed to `^/agent/api/.*` (deploy/digital-wall/cloudflared-config.example.yml),
// anything that is not an API call is passed through to the portal unchanged —
// same cookies, same path — so those pages render instead of a 404 from here.
const PORTAL_ORIGIN = String(process.env.PORTAL_BASE_URL || "http://portal:3000").replace(/\/+$/, "");
function passToPortal(req, res) {
  const target = new URL(req.url, PORTAL_ORIGIN);
  const upstream = http.request(
    { protocol: target.protocol, hostname: target.hostname, port: target.port || 80, path: target.pathname + target.search, method: req.method, headers: { ...req.headers, host: target.host } },
    (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); }
  );
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "portal_unreachable" })); });
  req.pipe(upstream);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = normalizePath(url.pathname);
  if (!pathname.startsWith("/api/") && pathname !== "/api") return passToPortal(req, res);

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

    // The tool catalogue THIS caller can use. The same scoped list the model is
    // given, so what a user sees here is exactly what the agent can do for them.
    if (pathname === "/api/tools" && req.method === "GET") {
      await assertMayUseAgent(user);
      const specs = toolSpecsFor(user);
      return sendJson(res, {
        ok: true,
        role: user.agentRole,
        count: specs.length,
        tools: specs.map(({ toolSpec }) => ({ name: toolSpec.name, description: toolSpec.description })),
      });
    }

    // Direct tool invocation — the same path the model takes, for verification
    // and debugging. It is NOT a bypass: it runs through executeTool, so the
    // permission check, schema validation and audit all apply identically.
    if (pathname === "/api/tools/invoke" && req.method === "POST") {
      await assertMayUseAgent(user);
      const body = await readJsonBody(req);
      const name = String(body.name || "").trim();
      if (!name) throw BadRequest("A tool name is required.");
      // A confirmation is spent ONLY through /api/confirmations/:token/confirm,
      // which runs the arguments that were shown. A token inside a tool call
      // -- from the model, from a script, from anywhere -- is refused here.
      if (body.input && typeof body.input === "object" && "confirmationToken" in body.input) {
        return sendJson(res, { ok: false, error: "NO_PERMISSION", message: "Confirm through /api/confirmations/{token}/confirm. A tool call cannot carry a confirmation." }, 403);
      }
      const result = await executeTool({
        name,
        input: body.input ?? {},
        user,
        conversationId: String(body.conversationId || "direct-invoke"),
        inputMode: body.inputMode === "voice" ? "voice" : "text",
        // The console is the only caller that may spend a confirmation token.
        // A voice-originated call is never "ui" in that sense (§3 rule 9).
        origin: body.inputMode === "voice" ? "voice" : "ui",
      });
      return sendJson(res, result, result.ok === false ? 200 : 200);
    }

    // ── Supporting views (design spec §9–§12) ─────────────────────────────────
    if (pathname === "/api/activity" && req.method === "GET") {
      await assertMayUseAgent(user);
      const filter = url.searchParams.get("filter") ?? "all";
      const data = await listActivity(user, { filter, person: url.searchParams.get("person"), tool: url.searchParams.get("tool"), date: url.searchParams.get("date"), limit: url.searchParams.get("limit"), before: url.searchParams.get("before") });
      if (url.searchParams.get("format") === "csv") {
        res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="agent-activity-${new Date().toISOString().slice(0, 10)}.csv"` });
        return res.end(activityCsv(data.rows));
      }
      return sendJson(res, { ok: true, ...data, scope: user.agentRole === "user" ? "mine" : "all" });
    }
    if (/^\/api\/activity\/[0-9]+\/request$/.test(pathname) && req.method === "GET") {
      await assertMayUseAgent(user);
      const conversationId = url.searchParams.get("conversation"); const at = url.searchParams.get("at");
      return sendJson(res, { ok: true, request: await requestBehind(conversationId, at ?? new Date().toISOString(), user) });
    }
    if (pathname === "/api/settings" && req.method === "GET") {
      await assertMayUseAgent(user);
      const [caps, enabled, binds] = await Promise.all([capabilities(), agentEnabled(), keybinds()]);
      return sendJson(res, { ok: true, capabilities: CAPABILITIES.map((c) => ({ ...c, enabled: caps[c.key] })), keybinds: binds, keybindActions: KEYBIND_ACTIONS, keybindDefaults: KEYBIND_DEFAULTS, killSwitch: enabled, canEdit: user.agentRole === "admin" || user.agentRole === "developer" });
    }
    if (pathname === "/api/settings" && req.method === "PATCH") {
      await assertMayUseAgent(user);
      if (!(user.agentRole === "admin" || user.agentRole === "developer")) return sendJson(res, { ok: false, error: "forbidden", message: "Admins only." }, 403);
      const body = await readJsonBody(req);
      if (body.keybinds && typeof body.keybinds === "object") {
        let binds;
        try { binds = await setKeybinds(body.keybinds, user); } catch (e) { throw BadRequest(e.message); }
        await audit({ kind: "settings.changed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { keybinds: binds } });
        return sendJson(res, { ok: true, keybinds: binds });
      }
      const values = await setCapability(String(body.key), body.enabled === true, user);
      capsNow = values; // in place: the switch must bite on the next call, not in 30 s
      await audit({ kind: "settings.changed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { capability: body.key, enabled: body.enabled === true } });
      return sendJson(res, { ok: true, capabilities: CAPABILITIES.map((c) => ({ ...c, enabled: values[c.key] })) });
    }
    if (pathname === "/api/settings/permissions" && req.method === "GET") {
      await assertMayUseAgent(user);
      if (!(user.agentRole === "admin" || user.agentRole === "developer")) return sendJson(res, { ok: false, error: "forbidden" }, 403);
      return sendJson(res, { ok: true, people: await permissionsMatrix() });
    }
    if (pathname === "/api/usage" && req.method === "GET") {
      await assertMayUseAgent(user);
      if (!(user.agentRole === "admin" || user.agentRole === "developer")) return sendJson(res, { ok: false, error: "forbidden" }, 403);
      return sendJson(res, { ok: true, usage: await usageThisMonth() });
    }
    if (pathname === "/api/knowledge/stats" && req.method === "GET") {
      await assertMayUseAgent(user);
      return sendJson(res, { ok: true, stats: await knowledgeStats() });
    }
    if (/^\/api\/knowledge\/documents\/[^/]+\/clauses$/.test(pathname) && req.method === "GET") {
      await assertMayUseAgent(user);
      if (user.agentRole !== "developer") return sendJson(res, { ok: false, error: "forbidden", message: "Developer role required." }, 403);
      const proposal = await proposedClauses(pathname.split("/")[4]);
      if (!proposal) return sendJson(res, { ok: false, error: "not_found" }, 404);
      return sendJson(res, { ok: true, ...proposal });
    }
    if (pathname === "/api/suggestions" && req.method === "GET") {
      await assertMayUseAgent(user);
      let context = null; try { context = url.searchParams.get("context") ? JSON.parse(url.searchParams.get("context")) : null; } catch { context = null; }
      return sendJson(res, { ok: true, ...(await suggestions(user, context)) });
    }
    if (pathname === "/api/history" && req.method === "GET") {
      await assertMayUseAgent(user);
      const filter = String(url.searchParams.get("filter") ?? "").split(",").filter(Boolean);
      return sendJson(res, { ok: true, ...(await searchConversations(user, { q: url.searchParams.get("q") ?? "", filter })) });
    }
    if (pathname === "/api/attachments" && req.method === "POST") {
      await assertMayUseAgent(user);
      const name = decodeURIComponent(url.searchParams.get("name") ?? "");
      if (!name) throw BadRequest("A file name is required (?name=).");
      const buffer = await readRawBody(req, 25 * 1024 * 1024 + 1024);
      try {
        const meta = await storeAttachment({ name, buffer, mime: req.headers["content-type"] ?? null, user });
        await audit({ kind: "attachment.uploaded", userId: user.userId, userEmail: user.email, success: true, confirmationStatus: "not_required", detail: { id: meta.id, name: meta.name, bytes: meta.bytes, hasText: meta.hasText } });
        return sendJson(res, { ok: true, attachment: meta });
      } catch (error) {
        return sendJson(res, { ok: false, error: "rejected", message: String(error?.message ?? error) }, 400);
      }
    }

    // ── Confirmations (§3 rules 6–9) ─────────────────────────────────────────
    // The console shows the prompt; these three calls are the only way a
    // pending write proceeds, is declined, or is read back after a reload.
    const confirmMatch = /^\/api\/confirmations\/([0-9a-f-]{36})(?:\/(confirm|cancel))?$/.exec(pathname);
    if (confirmMatch) {
      await assertMayUseAgent(user);
      const [, token, verb] = confirmMatch;
      const entry = getConfirmation(token, user);
      if (!entry) return sendJson(res, { ok: false, error: "not_found", message: "No such confirmation for you. It may have expired, or the service restarted since it was issued." }, 404);
      if (req.method === "GET" && !verb) return sendJson(res, { ok: true, confirmation: publicView(entry) });
      if (req.method === "POST" && verb === "cancel") {
        const cancelled = cancelConfirmation(token, user);
        await audit({ kind: "tool.call", userId: user.userId, userEmail: user.email, conversationId: entry.conversationId, toolName: entry.toolName, toolArgs: entry.input, toolResult: { declined: true }, confirmationStatus: "rejected", success: true, detail: { level: entry.level, token } });
        return sendJson(res, { ok: true, confirmation: publicView(cancelled ?? entry) });
      }
      if (req.method === "POST" && verb === "confirm") {
        // The exact stored arguments are what run -- never anything from this
        // request's body -- so a confirmation cannot be steered after it was shown.
        const result = await executeTool({ name: entry.toolName, input: { ...entry.input, confirmationToken: token }, user, conversationId: entry.conversationId ?? "confirmation", origin: "ui" });
        return sendJson(res, { ok: result.ok !== false, result, confirmation: publicView(getConfirmation(token, user) ?? entry) });
      }
      return sendJson(res, { ok: false, error: "method_not_allowed" }, 405);
    }

    // ── Verbatim by ID (§3 rule 1) ────────────────────────────────────────────
    // The ink frame renders THIS, fetched by id, never the model's text. If it
    // cannot be fetched the frame shows an error.
    const verbatimMatch = /^\/api\/verbatim\/(limitation|important|caa|tier1)\/([^/]+)$/.exec(pathname);
    if (verbatimMatch && req.method === "GET") {
      await assertMayUseAgent(user);
      const [, kind, rawId] = verbatimMatch;
      const id = decodeURIComponent(rawId);
      const notFound = () => sendJson(res, { ok: false, error: "not_found", message: `No ${kind} record ${id} could be fetched.` }, 404);
      if (kind === "tier1") {
        const rows = await knowledgeRest2(`agent_tier1_records?id=eq.${encodeURIComponent(id)}&retired_at=is.null&select=*&limit=1`).catch(() => null);
        const r = rows?.[0];
        if (!r || !r.approved_at) return notFound();
        return sendJson(res, { ok: true, record: { kind, id: r.id, reference: r.reference ?? null, heading: r.title ?? null, text: String(r.text ?? ""), source: r.source_document ?? null, version: r.version ?? null, effectiveFrom: r.effective_date ?? null, effectiveTo: r.expires_date ?? null, approvedBy: r.approved_by_email ?? null, approvedAt: r.approved_at ?? null, updatedAt: r.created_at ?? null, page: null } });
      }
      const path = kind === "limitation" ? `/api/timeline/limitations/${encodeURIComponent(id)}` : kind === "important" ? `/api/important/${encodeURIComponent(id)}` : `/api/caa/${encodeURIComponent(id)}`;
      const payload = await wallGetForServer(path, user).catch(() => null);
      const r = payload?.limitation ?? payload?.entry ?? payload?.record ?? null;
      if (!r) return notFound();
      return sendJson(res, { ok: true, record: { kind, id: String(r.id ?? id), reference: null, heading: String(r.title ?? r.authorityName ?? r.country ?? ""), text: String(r.description ?? r.body ?? r.functionText ?? r.title ?? ""), source: kind === "limitation" ? "digital-wall limitations store" : kind === "important" ? "digital-wall IMPORTANT store" : "digital-wall CAA store", version: null, effectiveFrom: r.startDate ?? r.effectiveFrom ?? null, effectiveTo: r.endDate ?? r.effectiveTo ?? null, approvedBy: r.reviewedBy ?? r.addedBy ?? null, approvedAt: r.reviewedAt ?? r.addedAt ?? null, updatedAt: r.updatedAt ?? null, page: null } });
    }

    // ── Generated files: download what the agent produced ─────────────────
    // Ownership is enforced in readGeneratedFile's query, so an id alone is not
    // enough to fetch another dispatcher's briefing.
    if (/^\/api\/files\/[^/]+$/.test(pathname) && req.method === "GET") {
      await assertMayUseAgent(user);
      const id = decodeURIComponent(pathname.split("/").pop());
      const found = await readGeneratedFile(id, user);
      if (!found) return sendJson(res, { ok: false, error: "not_found", message: "No such file." }, 404);
      res.writeHead(200, {
        "content-type": found.mime || "application/octet-stream",
        "content-disposition": `attachment; filename="${found.filename}"`,
        "cache-control": "private, max-age=300",
      });
      return res.end(found.buffer);
    }

    // ── Email: prepare → preview → send ───────────────────────────────────
    // Preview renders the EXACT html that would be sent, so what a user
    // approves is what leaves the building rather than a second render.
    if (pathname === "/api/email/preview" && req.method === "POST") {
      await assertMayUseAgent(user);
      const body = await readJsonBody(req);
      if (!body.subject || !Array.isArray(body.blocks)) throw BadRequest("subject and blocks are required.");
      const prepared = prepareEmail({
        subject: String(body.subject), tag: body.tag, blocks: body.blocks,
        attachments: body.attachments ?? [], user, conversationId: body.conversationId,
      });
      const { classifyRecipients } = await import("./lib/email/send.mjs");
      const recipients = Array.isArray(body.to) && body.to.length ? body.to : [user.email];
      const { internal, external } = classifyRecipients(recipients, user);
      return sendJson(res, {
        ok: true,
        subject: prepared.subject,
        html: prepared.html,
        text: prepared.text,
        reference: prepared.reference,
        recipients, internal, external,
        // The panel uses this to demand a confirmation before offering Send.
        needsConfirmation: external.length > 0,
      });
    }

    if (pathname === "/api/email/log" && req.method === "GET") {
      await assertMayUseAgent(user);
      // A user sees their own sends; developers see everything, for triage.
      const sends = await listSends(user.agentRole === "developer" ? {} : { userId: user.userId });
      return sendJson(res, { ok: true, sends });
    }

    // ── Knowledge base (Part 4) ───────────────────────────────────────────
    // Upload, classify, approve, index. Ingest PROPOSES a tier; a person
    // confirms. Tier 1 has exactly one entry point and it demands an approver.
    if (pathname === "/api/knowledge/documents" && req.method === "GET") {
      await assertMayUseAgent(user);
      const status = url.searchParams.get("status");
      const filter = status ? `&status=eq.${encodeURIComponent(status)}` : "";
      const rows = await knowledgeRest(`agent_documents?select=*${filter}&order=created_at.desc&limit=200`);
      return sendJson(res, { ok: true, documents: rows ?? [] });
    }

    if (pathname === "/api/knowledge/documents" && req.method === "POST") {
      // Uploading to the knowledge base is a DEVELOPER action while the agent
      // is a build in progress — same reasoning as the allowlist.
      await assertMayUseAgent(user);
      if (user.agentRole !== "developer") {
        return sendJson(res, { ok: false, error: "forbidden", message: "Developer role required to upload documents." }, 403);
      }
      const body = await readJsonBody(req);
      const filename = String(body.filename || "").trim();
      const contentBase64 = String(body.contentBase64 || "");
      if (!filename || !contentBase64) throw BadRequest("filename and contentBase64 are required.");
      const buffer = Buffer.from(contentBase64, "base64");
      if (buffer.length === 0) throw BadRequest("The file is empty.");

      const document = await storeDocument({
        filename, mime: body.mime ?? null, buffer,
        metadata: {
          title: body.title, source: body.source, version: body.version,
          effectiveDate: body.effectiveDate, country: body.country, icao: body.icao, tags: body.tags,
        },
        user,
      });

      const text = extractText(buffer, body.mime ?? null, filename);
      let proposal = null;
      if (text) {
        proposal = await classifyDocument({ title: document.title, source: document.source, sample: text });
        await knowledgeRest(`agent_documents?id=eq.${document.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            proposed_tier: proposal.tier,
            proposed_reason: proposal.reason,
            // Never 'approved' here. A person decides.
            status: "awaiting_approval",
            updated_at: new Date().toISOString(),
          }),
        });
      } else {
        await knowledgeRest(`agent_documents?id=eq.${document.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "awaiting_approval", proposed_tier: "tier2", proposed_reason: "Text could not be extracted automatically; review before indexing.", updated_at: new Date().toISOString() }),
        });
      }

      await audit({
        kind: "knowledge.uploaded", userId: user.userId, userEmail: user.email,
        toolName: "knowledge.upload", toolArgs: { filename, title: document.title },
        confirmationStatus: "pending", success: true,
        detail: { documentId: document.id, proposedTier: proposal?.tier ?? "tier2", confidence: proposal?.confidence ?? null },
      });
      return sendJson(res, { ok: true, document, proposal });
    }

    // Approve: the single path into Tier 1, and the point where a human is on
    // the record. Tier 2 approval simply indexes.
    if (/^\/api\/knowledge\/documents\/[^/]+\/approve$/.test(pathname) && req.method === "POST") {
      await assertMayUseAgent(user);
      if (user.agentRole !== "developer") {
        return sendJson(res, { ok: false, error: "forbidden", message: "Developer role required to approve documents." }, 403);
      }
      const id = pathname.split("/")[4];
      const body = await readJsonBody(req);
      const tier = body.tier === "tier1" ? "tier1" : "tier2";
      const rows = await knowledgeRest(`agent_documents?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      const document = rows?.[0];
      if (!document) return sendJson(res, { ok: false, error: "not_found", message: "No such document." }, 404);

      let indexed = { chunks: 0 };
      let records = [];
      if (tier === "tier1") {
        // Tier 1 is a set of RECORDS the approver has read, not a whole file.
        const supplied = Array.isArray(body.records) ? body.records : [];
        if (supplied.length === 0) throw BadRequest("Tier 1 approval requires the records to approve, each with reference, title and exact text.");
        for (const record of supplied) {
          if (!record.text || !record.title || !record.reference) throw BadRequest("Each Tier 1 record needs reference, title and text.");
          records.push(await approveTier1Record({
            document, record,
            approver: { userId: user.userId, email: user.email },
          }));
        }
      } else {
        const buffer = await readDocumentFile(document.storage_key);
        const text = extractText(buffer, document.mime, document.filename);
        if (!text) throw BadRequest("No text could be extracted, so this document cannot be indexed as reference material.");
        indexed = await indexDocument(document, text);
      }

      await knowledgeRest(`agent_documents?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          tier, status: "indexed",
          approved_by: user.userId, approved_by_email: user.email,
          approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }),
      });
      await audit({
        kind: "knowledge.approved", userId: user.userId, userEmail: user.email,
        actorId: user.userId, actorEmail: user.email,
        toolName: "knowledge.approve", toolArgs: { documentId: id, tier },
        confirmationStatus: "confirmed", success: true,
        detail: { chunks: indexed.chunks, tier1Records: records.length },
      });
      return sendJson(res, { ok: true, tier, chunks: indexed.chunks, records });
    }

    if (/^\/api\/knowledge\/documents\/[^/]+\/reject$/.test(pathname) && req.method === "POST") {
      await assertMayUseAgent(user);
      if (user.agentRole !== "developer") {
        return sendJson(res, { ok: false, error: "forbidden", message: "Developer role required." }, 403);
      }
      const id = pathname.split("/")[4];
      const body = await readJsonBody(req);
      await knowledgeRest(`agent_documents?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rejected", rejected_reason: String(body.reason || "").slice(0, 400), updated_at: new Date().toISOString() }),
      });
      await audit({
        kind: "knowledge.rejected", userId: user.userId, userEmail: user.email,
        actorId: user.userId, actorEmail: user.email,
        toolName: "knowledge.reject", toolArgs: { documentId: id },
        confirmationStatus: "rejected", success: true, detail: { reason: body.reason ?? null },
      });
      return sendJson(res, { ok: true, id });
    }

    // The original file, always retrievable. Behind the same gate as everything.
    if (/^\/api\/knowledge\/documents\/[^/]+\/file$/.test(pathname) && req.method === "GET") {
      await assertMayUseAgent(user);
      const id = pathname.split("/")[4];
      const rows = await knowledgeRest(`agent_documents?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      const document = rows?.[0];
      if (!document) return sendJson(res, { ok: false, error: "not_found", message: "No such document." }, 404);
      const buffer = await readDocumentFile(document.storage_key);
      res.writeHead(200, {
        "content-type": document.mime || "application/octet-stream",
        "content-disposition": `attachment; filename="${document.filename}"`,
        "cache-control": "private, max-age=300",
      });
      return res.end(buffer);
    }

    // ── Conversations: server-side history (the panel, the full page and a
    // reload on another machine all read the same thread). Every query is
    // scoped to this user's id, so one dispatcher cannot load another's. ──
    if (pathname === "/api/conversations" && req.method === "GET") {
      await assertMayUseAgent(user);
      return sendJson(res, { ok: true, conversations: await listConversations(user.userId) });
    }

    if (/^\/api\/conversations\/[^/]+$/.test(pathname) && req.method === "GET") {
      await assertMayUseAgent(user);
      const id = decodeURIComponent(pathname.split("/").pop());
      const thread = await listMessages(id, user.userId);
      if (!thread) return sendJson(res, { ok: false, error: "not_found", message: "No such conversation." }, 404);
      return sendJson(res, { ok: true, ...thread });
    }

    if (/^\/api\/conversations\/[^/]+$/.test(pathname) && req.method === "DELETE") {
      await assertMayUseAgent(user);
      const id = decodeURIComponent(pathname.split("/").pop());
      if (!(await getConversation(id, user.userId))) {
        return sendJson(res, { ok: false, error: "not_found", message: "No such conversation." }, 404);
      }
      await archiveConversation(id, user.userId);
      return sendJson(res, { ok: true, id });
    }

    return sendJson(res, { ok: false, error: "not_found", message: `No route for ${req.method} ${pathname}` }, 404);
  } catch (error) {
    return sendError(res, error);
  }
});

async function handleChat(req, res, user) {
  const body = await readJsonBody(req);
  // Only for the denial audit below, which happens before routing: a request
  // refused at the gate never reaches a model, so it has no routed tier.
  const requestedTier = String(body.tier || "unrouted");
  const startedAt = Date.now();

  // The gate runs on every turn — that is what makes a revocation bite mid-session.
  try {
    await assertMayUseAgent(user);
  } catch (error) {
    await audit({
      kind: "chat.denied",
      userId: user.userId,
      userEmail: user.email,
      conversationId: body.conversationId ?? null,
      modelTier: requestedTier,
      success: false,
      error: error instanceof AgentError ? error.code : String(error?.message || error),
    });
    throw error;
  }

  const question = String(body.message ?? "").trim();

  // Attachments are TEXT the user pasted in from a file, given to the model as

  // context for this turn only. They are not indexed, not a knowledge source,

  // and labelled as unverified -- a dispatcher attaching a colleague's email

  // must not have it come back as authoritative.

  const uploaded = [];
  for (const id of Array.isArray(body.attachmentIds) ? body.attachmentIds.slice(0, 3) : []) {
    const a = await loadAttachment(id, user);
    if (a) uploaded.push({ name: a.name, text: a.text ?? `(${a.mime ?? "file"}, ${Math.round(a.bytes / 1024)} KB — no text could be extracted from this format)`, chars: a.chars ?? 0, id: a.id });
  }
  const attachments = [...sanitiseAttachments(body.attachments), ...uploaded].slice(0, 3);
  if (!question) throw BadRequest("A message is required.");

  // Resolve or open the thread. History comes from the SERVER, so a reload or a
  // move to the full page continues the same conversation rather than starting
  // a parallel one that only this browser knows about.
  let conversation = null;
  if (body.conversationId) {
    conversation = await getConversation(String(body.conversationId), user.userId);
    if (!conversation) throw BadRequest("No such conversation.");
  } else {
    conversation = await createConversation({
      userId: user.userId,
      userEmail: user.email,
      title: titleFrom(question),
      context: body.context ?? null,
    });
  }
  if (!conversation) throw BadRequest("Could not open a conversation.");
  const conversationId = conversation.id;

  const priorThread = await listMessages(conversationId, user.userId);
  const history = (priorThread?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));

  await appendMessage({
    conversationId, role: "user",
    content: attachments.length ? `${question}\n\n${attachments.map((a) => `[Attached: ${a.name} · ${a.chars.toLocaleString("en-GB")} chars]`).join("\n")}` : question,
  });

  // ── Routing ─────────────────────────────────────────────────────────────
  // The caller may pin a tier; otherwise the router classifies. The router
  // NEVER answers — it returns a tier and a reason, both of which are audited,
  // because "which model answered" is not reviewable without "and why".
  const pinnedTier = body.tier ? String(body.tier) : null;
  const route = pinnedTier
    ? { tier: pinnedTier, reason: "pinned by caller", source: "pinned", routerLatencyMs: 0, routerModelId: null }
    : await routeTurn({ question, hasHistory: history.length > 0 });

  const { requested, effective } = resolveTier(route.tier);

  // The user's notes are fetched HERE, every turn, rather than relying on the
  // model to call recall — which it will not do in a fresh conversation, and
  // which made "remember this" appear to work only in the chat where it was
  // said. Resolved before the audit row so that row can name what was in front
  // of the model.
  const memory = await memoryContext({ user, context: body.context });

  await audit({
    kind: "chat.request",
    userId: user.userId,
    userEmail: user.email,
    conversationId,
    modelTier: requested,
    success: null,
    detail: {
      effectiveTier: effective, historyTurns: history.length, context: body.context ?? null,
      // Which notes were in front of the model, so a surprising answer can be
      // traced back to a remembered note rather than guessed at.
      memoriesInContext: memory.memories.map((m) => m.id),
    },
  });

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send("start", {
    conversationId,
    title: conversation.title,
    requestedTier: requested,
    effectiveTier: effective,
    tools: toolNamesFor(user),
  });

  // Context the user was looking at, given to the model as operator framing
  // rather than mixed into their message — it is not something they typed.
  const contextLine = body.context?.label
    ? `The user is currently looking at: ${body.context.label}${body.context.icao ? ` (${body.context.icao})` : ""}.`
    : null;
  // Voice is a different risk profile, not a different agent. It is carried as
  // an explicit field rather than sniffed, because every rule that keys on it
  // must key on the same fact the caller asserted.
  const inputMode = body.inputMode === "voice" ? "voice" : "text";
  const voiceLanguage = inputMode === "voice" ? normaliseLanguage(body.voice?.language) : null;

  const attachmentBlock = attachments.length
    ? attachments.map((a) => `ATTACHED BY THE USER — "${a.name}" (${a.chars} characters). Unverified: use it as context for this question only, never as an operational source, and say it came from the attachment when you rely on it.\n---\n${a.text}\n---`).join("\n\n")
    : null;
  const system = [systemPrompt(), currentTimeLine(), languageDirective(voiceLanguage), body.system ? String(body.system) : null, contextLine, memory.text, attachmentBlock]
    .filter(Boolean)
    .join("\n\n") || undefined;

  let done = null;
  let answer = "";
  const toolCalls = [];
  try {
    for await (const chunk of streamConversationWithTools({
      tier: route.tier,
      system,
      messages: [...history, { role: "user", content: question }],
      user,
      conversationId,
      inputMode,
    })) {
      if (chunk.type === "delta") {
        answer += chunk.text;
        send("delta", { text: chunk.text });
      } else if (chunk.type === "tool") {
        toolCalls.push(chunk);
        send("tool", { name: chunk.name, input: chunk.input, ok: chunk.ok, error: chunk.error, startedAt: chunk.startedAt ? new Date(chunk.startedAt).toISOString() : null, durationMs: chunk.durationMs ?? null, confirmationRequired: chunk.result?.confirmationRequired === true });
      } else if (chunk.type === "done") {
        done = chunk;
      }
    }

    // Attribution and verbatim records are derived from the tools that ACTUALLY
    // ran, not from anything the model claims. A model cannot cite a source it
    // was never given, or promote its own paraphrase into the verbatim frame.
    const sources = sourcesFromToolCalls(toolCalls);
    const verbatim = verbatimFromToolCalls(toolCalls);
    const flights = flightCardsFromToolCalls(toolCalls);
    const actions = actionsFromToolCalls(toolCalls);
    const mono = monoFromToolCalls(toolCalls);
    const documents = documentsFromToolCalls(toolCalls);
    const files = filesFromToolCalls(toolCalls);
    const airports = airportsFromToolCalls(toolCalls);
    // Pending confirmations the model's calls raised: the console renders the
    // prompt from THIS, and it is persisted so a reload shows it again (with
    // its live status looked up by token).
    const confirmations = toolCalls
      .filter((c) => c.result?.confirmationRequired === true && c.result?.confirmationToken)
      .map((c) => ({ token: c.result.confirmationToken, level: c.result.level, toolName: c.name, input: c.input, what: c.result.what ?? null, target: c.result.target ?? null, expiresAt: c.result.expiresAt ?? null }));
    const toolActivity = toolCalls.map((c) => ({
      name: c.name, ok: c.ok, error: c.error ?? null,
      startedAt: c.startedAt ? new Date(c.startedAt).toISOString() : null, durationMs: c.durationMs ?? null,
      args: c.input ?? null,
      // A one-line result the step list can show; never the whole payload.
      summary: c.result?.message ?? (typeof c.result?.count === "number" ? `${c.result.count} result${c.result.count === 1 ? "" : "s"}` : c.result?.file?.filename ?? (c.result?.confirmationRequired ? "awaiting confirmation" : (c.ok ? "ok" : String(c.error ?? "failed")))),
      write: Boolean(c.result?.actionId || c.result?.confirmationRequired),
    }));

    await appendMessage({
      conversationId,
      role: "assistant",
      content: answer,
      blocks: verbatim.length || flights.length || actions.length || mono.length || documents.length || files.length || airports.length || confirmations.length
        ? {
            ...(verbatim.length ? { verbatim } : {}), ...(flights.length ? { flights } : {}), ...(actions.length ? { actions } : {}),
            ...(mono.length ? { mono } : {}), ...(documents.length ? { documents } : {}), ...(files.length ? { files } : {}), ...(airports.length ? { airports } : {}),
            ...(confirmations.length ? { confirmations } : {}),
          }
        : null,
      sources,
      toolActivity,
      modelId: done?.modelId ?? null,
      modelTier: requested,
      inputTokens: done?.inputTokens ?? null,
      outputTokens: done?.outputTokens ?? null,
    });

    send("done", {
      conversationId,
      modelId: done?.modelId ?? null,
      modelTier: effective ?? requested ?? null,
      stopReason: done?.stopReason ?? null,
      inputTokens: done?.inputTokens ?? null,
      outputTokens: done?.outputTokens ?? null,
      // Surfaced to the client as well as the audit log: without these the
      // caching saving is invisible to anything measuring from outside.
      cacheReadTokens: done?.cacheReadTokens ?? 0,
      cacheWriteTokens: done?.cacheWriteTokens ?? 0,
      sources,
      verbatim,
      flights,
      actions,
      mono,
      documents,
      files,
      airports,
      confirmations,
      toolActivity,
      latencyMs: Date.now() - startedAt,
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
      detail: {
        effectiveTier: effective,
        stopReason: done?.stopReason ?? null,
        toolActivity,
        sourceCount: sources.length,
        // The routing decision, stored so a cost or quality regression can be
        // traced to the choice that caused it rather than guessed at.
        route: {
          tier: route.tier,
          source: route.source,
          reason: route.reason,
          routerModelId: route.routerModelId,
          routerLatencyMs: route.routerLatencyMs,
        },
        // Cache hits are billed differently from fresh input; counted apart so
        // the saving is visible in the log used to prove it.
        cacheReadTokens: done?.cacheReadTokens ?? 0,
        cacheWriteTokens: done?.cacheWriteTokens ?? 0,
        attachments: attachments.map((a) => ({ name: a.name, chars: a.chars })),
      },
    });
  } catch (error) {
    const code = error instanceof AgentError ? error.code : "model_error";
    const message = String(error?.message || error);
    send("error", { error: code, message, retryable: Boolean(error?.retryable) });
    // The partial answer is kept: a dispatcher who read half a reply before it
    // failed should find that half still there after a reload, with the error.
    await appendMessage({
      conversationId,
      role: "assistant",
      content: answer,
      toolActivity: toolCalls.map((c) => ({ name: c.name, ok: c.ok, error: c.error ?? null })),
      modelTier: requested,
      error: `${code}: ${message.slice(0, 400)}`,
    }).catch(() => {});
    await audit({
      kind: "chat.error",
      userId: user.userId,
      userEmail: user.email,
      conversationId,
      modelTier: requested,
      success: false,
      error: `${code}: ${message.slice(0, 500)}`,
      latencyMs: Date.now() - startedAt,
      detail: { effectiveTier: effective },
    });
  } finally {
    res.end();
  }
}

// Retention runs at startup and then daily. Deliberately not on a request
// path: a sweep that could slow a dispatcher's question is a sweep that gets
// disabled.
// Org capability switches: read every 30 s (cached in views.mjs); the gate
// reads the cache synchronously so tool listing stays cheap.
const refreshCaps = () => capabilities().then((v) => { capsNow = v; }).catch(() => {});
refreshCaps(); setInterval(refreshCaps, 30_000).unref();
setCapabilityGate(() => capsNow);

sweepGeneratedFiles().catch(() => {});
setInterval(() => sweepGeneratedFiles().catch(() => {}), 24 * 60 * 60 * 1000).unref();

server.listen(PORT, () => {
  const models = loadModelConfig();
  process.stdout.write(`Clearway agent service on :${PORT}\n`);
  process.stdout.write(`  auth:   ${describeAuthPosture()}\n`);
  process.stdout.write(`  store:  ${storeConfigured() ? "Supabase service role configured" : "MISCONFIGURED — access checks fail closed"}\n`);
  process.stdout.write(`  models: region ${models.region}, all tiers pinned to "${models.activeTier ?? "(per-request)"}"\n`);
});
