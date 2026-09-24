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
import { streamConversationWithTools } from "./lib/bedrock.mjs";
import { executeTool, toolNamesFor, toolSpecsFor } from "./lib/tools/index.mjs";
import { actionsFromToolCalls, flightCardsFromToolCalls, sourcesFromToolCalls, verbatimFromToolCalls } from "./lib/tools/framework.mjs";
import {
  appendMessage, archiveConversation, createConversation, getConversation,
  listConversations, listMessages, titleFrom,
} from "./lib/conversations.mjs";
import {
  approveTier1Record, classifyDocument, extractText, indexDocument,
  readDocumentFile, storeDocument,
} from "./lib/knowledge/ingest.mjs";
import { rest as knowledgeRest } from "./lib/knowledge/retrieval.mjs";
import { readGeneratedFile } from "./lib/files/store.mjs";
import { listSends, prepareEmail } from "./lib/email/send.mjs";
import { memoryContext } from "./lib/memory-context.mjs";
import { loadModelConfig, resolveTier, systemPrompt } from "./lib/models.mjs";
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
      const result = await executeTool({
        name,
        input: body.input ?? {},
        user,
        conversationId: String(body.conversationId || "direct-invoke"),
      });
      return sendJson(res, result, result.ok === false ? 200 : 200);
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
      conversationId: body.conversationId ?? null,
      modelTier: requestedTier,
      success: false,
      error: error instanceof AgentError ? error.code : String(error?.message || error),
    });
    throw error;
  }

  const question = String(body.message ?? "").trim();
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

  await appendMessage({ conversationId, role: "user", content: question });

  const { requested, effective } = resolveTier(requestedTier);

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
  const system = [systemPrompt(), body.system ? String(body.system) : null, contextLine, memory.text]
    .filter(Boolean)
    .join("\n\n") || undefined;

  let done = null;
  let answer = "";
  const toolCalls = [];
  try {
    for await (const chunk of streamConversationWithTools({
      tier: requestedTier,
      system,
      messages: [...history, { role: "user", content: question }],
      user,
      conversationId,
    })) {
      if (chunk.type === "delta") {
        answer += chunk.text;
        send("delta", { text: chunk.text });
      } else if (chunk.type === "tool") {
        toolCalls.push(chunk);
        send("tool", { name: chunk.name, input: chunk.input, ok: chunk.ok, error: chunk.error });
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
    const toolActivity = toolCalls.map((c) => ({ name: c.name, ok: c.ok, error: c.error ?? null }));

    await appendMessage({
      conversationId,
      role: "assistant",
      content: answer,
      blocks: verbatim.length || flights.length || actions.length
        ? { ...(verbatim.length ? { verbatim } : {}), ...(flights.length ? { flights } : {}), ...(actions.length ? { actions } : {}) }
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
      stopReason: done?.stopReason ?? null,
      inputTokens: done?.inputTokens ?? null,
      outputTokens: done?.outputTokens ?? null,
      sources,
      verbatim,
      flights,
      actions,
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
      detail: { effectiveTier: effective, stopReason: done?.stopReason ?? null, toolActivity, sourceCount: sources.length },
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

server.listen(PORT, () => {
  const models = loadModelConfig();
  process.stdout.write(`Clearway agent service on :${PORT}\n`);
  process.stdout.write(`  auth:   ${describeAuthPosture()}\n`);
  process.stdout.write(`  store:  ${storeConfigured() ? "Supabase service role configured" : "MISCONFIGURED — access checks fail closed"}\n`);
  process.stdout.write(`  models: region ${models.region}, all tiers pinned to "${models.activeTier ?? "(per-request)"}"\n`);
});
