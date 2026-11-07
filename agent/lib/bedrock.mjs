// Bedrock client. Streaming by default; tier in, tokens out. Knows nothing
// about who is asking — authorization happened before this is called.

import { randomUUID } from "node:crypto";
import { BedrockRuntimeClient, ConverseStreamCommand, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { loadModelConfig, modelCandidates, resolveTier } from "./models.mjs";
import { classifyBedrockError, ModelUnavailable } from "./errors.mjs";
import { executeTool, toolSpecsFor } from "./tools/index.mjs";
import { anthropicRuntime } from "./anthropic-runtime.mjs";
import { webSettings, anthropicWebTool, classifyUrl } from "./web-sources.mjs";
import { logDetail, recordedReason } from "./public-errors.mjs";
import { deferredChecks, followUpPrompt, subjectsOf } from "./follow-up.mjs";
import { nextAction } from "./turn-policy.mjs";
import { auditClaims, repairPrompt } from "./claim-audit.mjs";
import { applyResolvedNames } from "./names.mjs";

// A turn that keeps calling tools without producing an answer is a loop. The
// cap is on ROUNDS of tool use, not individual calls, so a model that fans out
// three lookups in one round is not punished for being efficient.
// 10 since 2026-11-04: a turn may now make up to three moves of its own after a reply (search, widen, a deferred check,
// one redraft), each needing a round for the tools and one for the answer.
const MAX_TOOL_ROUNDS = Number(process.env.AGENT_MAX_TOOL_ROUNDS || 10);

const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_MODEL_TIMEOUT_MS || 120_000);

let client = null;
// The API the models are called on (agent/config/models.json › provider): the Anthropic API since 2026-11-02, behind the
// same Converse-shaped send() (agent/lib/anthropic-runtime.mjs), or Bedrock.
function runtime() {
  if (loadModelConfig().provider === "anthropic") return anthropicRuntime;
  if (!client) client = new BedrockRuntimeClient({ region: loadModelConfig().region });
  return client;
}

function toBedrockMessages(messages) {
  return messages.map((m) => {
    // Messages already in Bedrock content-block form (tool use / tool results
    // from an earlier round of THIS turn) pass through untouched.
    if (Array.isArray(m.content)) return { role: m.role === "assistant" ? "assistant" : "user", content: m.content };
    return { role: m.role === "assistant" ? "assistant" : "user", content: [{ text: String(m.content ?? "") }] };
  });
}

function inferenceConfig(tierConfig, overrides = {}) {
  return {
    maxTokens: overrides.maxTokens ?? tierConfig.maxTokens ?? 4096,
    ...(overrides.temperature != null ? { temperature: overrides.temperature } : {}),
  };
}

/** A fallback, said (2026-11-03): which model was meant, which answered, and why the first did not. */
// The reason is the kind of failure; the provider's own text goes to the log (2026-11-07: it reached the browser).
const fellBack = (candidates, modelId, lastUnavailable) => (lastUnavailable && modelId !== candidates[0] ? { kind: "model", from: candidates[0], to: modelId, reason: recordedReason("model", `${candidates[0]} unavailable, answered on ${modelId}`, Object.assign(new Error(String(lastUnavailable.detail || lastUnavailable.message || "unavailable")), { code: lastUnavailable.code })) } : null);

/** The tier's own request fields (thinking, effort: agent/config/models.json), as Converse carries model-specific fields. */
function modelFields(tierConfig) {
  return tierConfig?.request ? { additionalModelRequestFields: tierConfig.request } : {};
}

/**
 * Stream a conversation. Yields { type: "delta", text } chunks, then a final
 * { type: "done", ... } with usage and the model actually used.
 *
 * Model fallback: when the primary id is UNAVAILABLE (not throttled, not timed
 * out) the next candidate is tried. Throttling and timeouts are surfaced to the
 * caller instead — silently retrying them on a different model would hide load
 * problems and change which model answered without anyone knowing.
 */
export async function* streamConversation({ tier = "standard", system, messages, ...overrides }) {
  const { requested, effective, config } = resolveTier(tier);
  const candidates = modelCandidates(tier);
  if (candidates.length === 0) {
    throw ModelUnavailable(`No model is configured for tier "${effective}".`);
  }

  let lastUnavailable = null;
  for (const modelId of candidates) {
    const startedAt = Date.now();
    try {
      const response = await runtime().send(
        new ConverseStreamCommand({
          modelId,
          ...(system ? { system: [{ text: system }] } : {}),
          messages: toBedrockMessages(messages),
          inferenceConfig: inferenceConfig(config, overrides),
          ...modelFields(config),
        }),
        { abortSignal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
      );

      let usage = null;
      let stopReason = null;
      let text = "";
      for await (const event of response.stream ?? []) {
        if (event.contentBlockDelta?.delta?.text) {
          const chunk = event.contentBlockDelta.delta.text;
          text += chunk;
          yield { type: "delta", text: chunk };
        }
        if (event.messageStop?.stopReason) stopReason = event.messageStop.stopReason;
        if (event.metadata?.usage) usage = event.metadata.usage;
      }
      yield {
        type: "done",
        modelId,
        requestedTier: requested,
        effectiveTier: effective,
        stopReason,
        text,
        latencyMs: Date.now() - startedAt,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        fallback: fellBack(candidates, modelId, lastUnavailable),
      };
      return;
    } catch (error) {
      const classified = classifyBedrockError(error);
      // Only an unavailable model earns a second attempt on another id.
      if (classified.code === "model_unavailable" && modelId !== candidates[candidates.length - 1]) {
        lastUnavailable = classified;
        continue;
      }
      throw classified;
    }
  }
  throw lastUnavailable ?? ModelUnavailable("Every configured model for this tier is unavailable.");
}

/** Non-streaming single turn — used by the health check's live model probe. */
export async function converseOnce({ tier = "standard", system, messages, ...overrides }) {
  const { requested, effective, config } = resolveTier(tier);
  const candidates = modelCandidates(tier);
  if (candidates.length === 0) throw ModelUnavailable(`No model is configured for tier "${effective}".`);

  let lastUnavailable = null;
  for (const modelId of candidates) {
    const startedAt = Date.now();
    try {
      const res = await runtime().send(
        new ConverseCommand({
          modelId,
          ...(system ? { system: [{ text: system }] } : {}),
          messages: toBedrockMessages(messages),
          inferenceConfig: inferenceConfig(config, overrides),
          ...modelFields(config),
        }),
        { abortSignal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
      );
      return {
        text: (res.output?.message?.content ?? []).map((c) => c.text ?? "").join(""),
        modelId,
        requestedTier: requested,
        effectiveTier: effective,
        stopReason: res.stopReason ?? null,
        latencyMs: Date.now() - startedAt,
        inputTokens: res.usage?.inputTokens ?? null,
        outputTokens: res.usage?.outputTokens ?? null,
        fallback: fellBack(candidates, modelId, lastUnavailable),
      };
    } catch (error) {
      const classified = classifyBedrockError(error);
      if (classified.code === "model_unavailable" && modelId !== candidates[candidates.length - 1]) {
        lastUnavailable = classified;
        continue;
      }
      throw classified;
    }
  }
  throw lastUnavailable ?? ModelUnavailable("Every configured model for this tier is unavailable.");
}


/**
 * A full agentic turn: stream, run any tools the model selects, feed the
 * results back, repeat until it answers.
 *
 * Yields the same { type: "delta" } text chunks as streamConversation, plus
 * { type: "tool", ... } events so the caller can show what is being looked up.
 *
 * Two invariants, both enforced here rather than trusted to the model:
 *  - the tool list is scoped to THIS user (toolSpecsFor), so a tool the caller
 *    cannot use is never offered;
 *  - every tool result goes back through executeTool, which validates, audits
 *    and returns the standard error vocabulary. The model never gets to run
 *    anything the framework has not approved.
 */
export async function* streamConversationWithTools({ tier: startTier = "standard", system, messages, user, conversationId, inputMode = "text", onRound = null, skipConfirm = false, onToolProgress = null, signal = null, pinTool = null, policy = null }) {
  // policy (2026-11-04, lib/question-check.mjs + lib/turn-policy.mjs): { kinds, mustSearch, names } — what the question is,
  // whether it must be searched, and the checked name of each code in it
  // pinTool { name, input } (2026-10-26): a slash command whose meaning is fixed — /blank-manifest — does not leave the
  // tool and its input to the model. On the first round the model is made to call that tool (toolChoice), and the
  // input it writes is replaced by the pinned one; later rounds are free again. Seen twice: asked for the blank form,
  // the model picked a flight from the conversation and called it the blank form.
  // The tier may RISE during the turn (escalation after a tool round, item 3); it never falls.
  let tier = startTier;
  let { requested, effective, config } = resolveTier(tier);
  let candidates = modelCandidates(tier);
  const escalations = [];
  const roundResults = [];
  const thoughts = [];
  if (candidates.length === 0) throw ModelUnavailable(`No model is configured for tier "${effective}".`);

  // Web search (2026-11-03, lib/web-sources.mjs): the API's own web_search, a server tool (Anthropic runtime only; the
  // one provider since Tavily was removed, 2026-11-05). `turn` carries the two-pass state: pass one on the approved
  // sources until widen_web_search, then unrestricted.
  const web = await webSettings().catch(() => null);
  const turn = { widened: false, widenedFor: null, searches: [] };
  let toolSpecs = toolSpecsFor(user);
  const offered = new Set(toolSpecs.map((t) => t.toolSpec.name));
  const anthropicSearch = offered.has("widen_web_search") && loadModelConfig().provider === "anthropic";
  toolSpecs = toolSpecs.filter((t) => (t.toolSpec.name === "widen_web_search" ? anthropicSearch : true));
  const webResults = new Map();   // url → { title, pageAge, pass, provider }: what the API's search returned, for the cited sources
  let webSearchRequests = 0;
  let carried = [];               // text blocks of rounds the API paused (pause_turn): part of the answer that follows
  let followedUp = null;          // the deferred check a turn may make: an answer that sent the reader to a check we can make
  const followUps = [];           // every move the turn made after a reply (search, widen, a check, a redraft), with what became of it
  const acted = new Set();
  const audits = [];
  const nameCorrections = [];
  const conversation = toBedrockMessages(messages);
  let usedModelId = null;
  let totalIn = 0;
  let totalOut = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  const toolCalls = [];
  const fallbacks = [];   // every round that answered on a fallback model, with why (2026-11-03)

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    if (signal?.aborted) { const e = new Error("Cancelled by the user."); e.code = "cancelled"; throw e; }
    const lastRound = round === MAX_TOOL_ROUNDS;
    const roundStarted = Date.now();
    let roundText = "";
    let roundReasoning = "";
    let assistantBlocks = [];
    let stopReason = null;
    let roundCited = [];
    let roundStreamed = "";   // every text block of the round as it streamed, narration included
    // The pass this round's request is SENT with. The API runs a search the model asked for but did not get an answer to
    // in its last response (a server_tool_use with no result, next to one of our tool calls) at the start of THIS request,
    // under THIS request's settings (found 2026-11-03: three pass-one searches asked for alongside widen_web_search ran
    // unrestricted). So pass two begins only on a round with no such search pending.
    const lastAssistant = [...conversation].reverse().find((m) => m.role === "assistant");
    const pendingSearch = (lastAssistant?.content ?? []).some((b) => b.raw?.type === "server_tool_use" && !(lastAssistant.content ?? []).some((r) => r.raw?.type === "web_search_tool_result" && r.raw.tool_use_id === b.raw.id));
    const roundPass = turn.widened && !pendingSearch ? 2 : 1;
    const roundWebTool = anthropicSearch && !lastRound && web ? anthropicWebTool(web, { widened: roundPass === 2 }) : null;

    let lastUnavailable = null;
    let streamed = false;
    // The pinned tool's first call is written here, not asked of the model: Sonnet 5.5 and Opus 5.5 refuse a forced
    // tool_choice (2026-11-03), and the model's input was replaced by the pinned one anyway. The model takes over from
    // the tool's result.
    if (pinTool && round === 0 && toolSpecs.some((t) => t.toolSpec.name === pinTool.name)) {
      assistantBlocks = [{ toolUse: { toolUseId: `toolu_pinned_${randomUUID().replace(/-/g, "").slice(0, 20)}`, name: pinTool.name, input: { ...pinTool.input } } }];
      stopReason = "tool_use";
      streamed = true;
    }
    for (const modelId of streamed ? [] : candidates) {
      try {
        const response = await runtime().send(
          new ConverseStreamCommand({
            modelId,
            ...(system ? { system: withCachePoint([{ text: system }], modelId) } : {}),
            messages: conversation,
            inferenceConfig: inferenceConfig(config, {}),
            ...modelFields(config),
            // On the final round the tools are withheld, which forces the model
            // to answer from what it already has instead of asking for more.
            ...(toolSpecs.length > 0 && !lastRound
              ? { toolConfig: { tools: withCachePoint(toolSpecs, modelId) } }
              : {}),
            ...(roundWebTool ? { serverTools: [roundWebTool] } : {}),
          }),
          { abortSignal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
        );

        const blocks = new Map(); // index -> { type, text?, toolUse?, signature?, redacted? }
        for await (const event of response.stream ?? []) {
          const idx = event.contentBlockStart?.contentBlockIndex ?? event.contentBlockDelta?.contentBlockIndex ?? 0;
          // Thinking (Sonnet 5.5 and Opus 5.5 always think): kept whole and sent back unmodified with the tool results,
          // or the API refuses the next round. Its summary is the model's note between tool calls — a thought, never
          // the reply.
          const r = event.contentBlockDelta?.delta?.reasoningContent;
          if (r) {
            const existing = blocks.get(idx) ?? { type: "reasoning", text: "", signature: "", redacted: null };
            if (r.text) { existing.text += r.text; roundReasoning += r.text; }
            if (r.signature) existing.signature += r.signature;
            if (r.redactedContent) existing.redacted = r.redactedContent;
            blocks.set(idx, existing);
          }
          // the API's own web search: its call (input streamed below) and its results, kept whole
          if (event.rawStart) blocks.set(event.rawStart.contentBlockIndex, { type: "raw", block: { ...event.rawStart.block }, inputJson: "" });
          if (event.contentBlockDelta?.delta?.citation) {
            const existing = blocks.get(idx) ?? { type: "text", text: "" };
            (existing.citations ??= []).push(event.contentBlockDelta.delta.citation);
            blocks.set(idx, existing);
          }
          if (event.contentBlockStart?.start?.toolUse) {
            const { toolUseId, name } = event.contentBlockStart.start.toolUse;
            blocks.set(idx, { type: "toolUse", toolUseId, name, inputJson: "" });
          }
          if (event.contentBlockDelta?.delta?.text) {
            const chunk = event.contentBlockDelta.delta.text;
            const existing = blocks.get(idx) ?? { type: "text", text: "" };
            existing.text = (existing.text ?? "") + chunk;
            blocks.set(idx, existing);
            roundText += chunk;
            yield { type: "delta", text: chunk };
          }
          if (event.contentBlockDelta?.delta?.toolUse?.input != null) {
            const existing = blocks.get(idx);
            if (existing) existing.inputJson += event.contentBlockDelta.delta.toolUse.input;
          }
          if (event.messageStop?.stopReason) stopReason = event.messageStop.stopReason;
          if (event.metadata?.usage) {
            webSearchRequests += event.metadata.usage.webSearchRequests ?? 0;
            totalIn += event.metadata.usage.inputTokens ?? 0;
            totalOut += event.metadata.usage.outputTokens ?? 0;
            // Cache hits are billed differently from fresh input, so they are
            // counted separately. Folding them into inputTokens would make the
            // saving invisible in exactly the log used to prove it.
            cacheRead += event.metadata.usage.cacheReadInputTokens ?? 0;
            cacheWrite += event.metadata.usage.cacheWriteInputTokens ?? 0;
          }
        }

        // the round's searches on the API's own tool: which pass, what came back (by host only), for the audit and sources
        for (const b of blocks.values()) {
          if (b.type !== "raw") continue;
          if (b.block.type === "server_tool_use") { if (b.inputJson) b.block.input = safeJson(b.inputJson); turn.searches.push({ provider: "anthropic", id: b.block.id, query: String(b.block.input?.query ?? "").slice(0, 300), pass: roundPass, allowedSent: roundWebTool?.allowed_domains?.length ?? 0, round, results: null, hosts: [] }); }
          if (b.block.type === "web_search_tool_result") {
            const s = turn.searches.find((x) => x.id === b.block.tool_use_id);
            // a result is labelled by the request it ran under (a search left pending runs at the start of the next one)
            if (s) { s.pass = roundPass; s.round = round; s.allowedSent = roundWebTool?.allowed_domains?.length ?? 0; }
            if (Array.isArray(b.block.content)) {
              for (const r of b.block.content) if (r?.url && !webResults.has(r.url)) webResults.set(r.url, { title: r.title ?? null, pageAge: r.page_age ?? null, pass: s?.pass ?? roundPass, provider: "anthropic" });
              if (s) {
                s.results = b.block.content.length; s.hosts = [...new Set(b.block.content.map((r) => { try { return new URL(r.url).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean))].slice(0, 8);
                // pass one must return only approved hosts: anything else means the filter was not applied, said loudly
                if (s.pass === 1 && web) { const outside = b.block.content.filter((r) => classifyUrl(r.url, web) === "other").map((r) => { try { return new URL(r.url).hostname; } catch { return "?"; } }); if (outside.length) { s.outsideApproved = [...new Set(outside)].slice(0, 8); logDetail("web", "pass one returned hosts outside the approved list: the filter was not applied", s.outsideApproved.join(", ")); } }
              }
            } else if (s) { s.results = 0; s.error = String(b.block.content?.error_code ?? "error"); }
          }
        }
        // Text written BEFORE a search the model ran inside this response, with more text after it, is narration
        // ("so I'll search the approved sources.") — not the answer (2026-11-03, prompt 8d). It is kept apart.
        const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
        const lastSearch = ordered.reduce((at, b, i) => (b.type === "raw" ? i : at), -1);
        const textAfter = ordered.some((b, i) => i > lastSearch && b.type === "text" && (b.text ?? "").trim());
        const cut = lastSearch >= 0 && textAfter ? lastSearch : -1;
        roundStreamed = ordered.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        roundCited = ordered.filter((b, i) => i > cut && b.type === "text" && (b.text ?? "").length).map((b) => ({ text: b.text, citations: b.citations ?? [] }));
        assistantBlocks = [...blocks.values()].map((b) =>
          b.type === "toolUse"
            ? { toolUse: { toolUseId: b.toolUseId, name: b.name, input: safeJson(b.inputJson) } }
            : b.type === "raw"
              ? { raw: b.block }
              : b.type === "reasoning"
                ? { reasoningContent: b.redacted != null ? { redactedContent: b.redacted } : { reasoningText: { text: b.text, signature: b.signature } } }
                : { text: b.text ?? "" }   // citations are not sent back: the answer they belong to is already written
        ).filter((b) => (b.text != null ? b.text.length > 0 : true));

        usedModelId = modelId;
        { const f = fellBack(candidates, modelId, lastUnavailable); if (f) fallbacks.push({ ...f, round }); }
        streamed = true;
        break;
      } catch (error) {
        const classified = classifyBedrockError(error);
        if (classified.code === "model_unavailable" && modelId !== candidates[candidates.length - 1]) {
          lastUnavailable = classified;
          continue;
        }
        throw classified;
      }
    }
    if (!streamed) throw lastUnavailable ?? ModelUnavailable("Every configured model for this tier is unavailable.");

    const requestedTools = assistantBlocks.filter((b) => b.toolUse).map((b) => b.toolUse);
    // The API paused a long server-tool turn (its web searches): send the response back as it is and it continues.
    // Its text so far is the start of the answer, not a thought.
    if (stopReason === "pause_turn" && !lastRound) {
      conversation.push({ role: "assistant", content: assistantBlocks });
      carried = [...carried, ...roundCited];
      continue;
    }
    if (stopReason !== "tool_use" || requestedTools.length === 0) {
      // The reply, with each checked code's name written by lib/names.mjs (never the model's own), and what streamed.
      const named = [...carried, ...roundCited].map((b) => { const r = applyResolvedNames(b.text, policy?.names); nameCorrections.push(...r.corrections); return { ...b, text: r.text }; });
      const replyText = named.map((b) => b.text).join("") || roundText;
      const streamedTail = [...carried.map((b) => b.text), roundStreamed].join("") || roundText;
      // What the turn must still do before it may answer (lib/turn-policy.mjs, lib/follow-up.mjs, lib/claim-audit.mjs):
      // in this order, each at most once, only while two rounds are left (the tools, then the answer).
      const room = stopReason === "end_turn" && round <= MAX_TOOL_ROUNDS - 2;
      const offeredNames = new Set(toolSpecs.map((t) => t.toolSpec.name));
      let action = room ? nextAction({ reply: { text: replyText, blocks: named }, turn, policy, webAvailable: anthropicSearch, done: acted }) : null;
      if (!action && room && !followedUp) {
        const subjects = policy?.subjects ?? subjectsOf([...messages].reverse().find((m) => m.role === "user")?.content?.map?.((c) => c.text ?? "").join(" ") ?? "", policy?.names);
        const found = deferredChecks(replyText, offeredNames, subjects);
        if (found.length) { followedUp = found; action = { kind: "check", label: found.map((f) => f.label).join(" and "), tools: found.map((f) => f.tool), prompt: followUpPrompt(found) }; }
      }
      // the audit judges the answer the person will read: once, and once more if the turn moved again after it
      const auditsDone = followUps.filter((f) => f.kind === "audit").length;
      const movedSinceAudit = auditsDone > 0 && followUps.at(-1)?.kind !== "audit";
      if (!action && room && (auditsDone === 0 || (auditsDone === 1 && movedSinceAudit))) {
        let pos = 0; const claims = [];
        for (const b of named) { if ((b.citations ?? []).length) claims.push({ start: pos, end: pos + b.text.length, names: b.citations.flatMap((c) => [c.url, c.source, c.title]).filter(Boolean) }); pos += b.text.length; }
        const a = auditClaims({ text: replyText, claims, searched: turn.searches.length > 0 });
        audits.push({ unsourced: a.unsourced.length, absences: a.absences.length, sentences: a.unsourced.concat(a.absences).slice(0, 12) });
        if (a.unsourced.length || a.absences.length) action = { kind: "audit", label: "the sources of its claims", tools: [], hidden: true, prompt: repairPrompt(a) };
      }
      if (action) {
        acted.add(action.kind);
        if (action.widen) { turn.widened = true; turn.widenedFor = turn.widenedFor ?? "by the turn: pass one gave nothing citable, or the answer left a part it could not establish"; }   // pass two opens in code
        followUps.push({ kind: action.kind, label: action.label, tools: action.tools, callsAt: toolCalls.length, searchesAt: turn.searches.length });
        // Working out whether another call is needed is internal (2026-11-05): the draft that led to it goes to the
        // thinking, never to the reader as a "partial answer". The reader sees one answer. Only a check that was owed and
        // could not be made reaches them, as one line naming it and why (agent/server.mjs › partial).
        { const t = { text: streamedTail, ms: Date.now() - roundStarted, redraft: action.kind }; thoughts.push(t); yield { type: "thought", ...t }; }
        // A search the model asked for in this reply and never got an answer to cannot stand before a plain message: the
        // API refuses it ("web_search tool use … without a corresponding web_search_tool_result", question 7, 2026-11-04).
        // It was never run, so it is left out of what is sent back.
        const answeredIds = new Set(assistantBlocks.filter((b) => b.raw?.type === "web_search_tool_result").map((b) => b.raw.tool_use_id));
        const sendBack = assistantBlocks.filter((b) => !(b.raw?.type === "server_tool_use" && !answeredIds.has(b.raw.id)));
        conversation.push({ role: "assistant", content: sendBack.length ? sendBack : [{ text: replyText || "(no text)" }] });
        conversation.push({ role: "user", content: [{ text: action.prompt }] });
        carried = [];
        continue;
      }
      // The audit of the answer that is read, always (2026-11-04): what it still finds is a real miss, and it is marked in
      // the console beside the sentence ("no source given"), so unsourced substance cannot pass unmarked.
      let finalAudit = null;
      { let pos = 0; const claims = []; for (const b of named) { if ((b.citations ?? []).length) claims.push({ start: pos, end: pos + b.text.length, names: b.citations.flatMap((c) => [c.url, c.source, c.title]).filter(Boolean) }); pos += b.text.length; } finalAudit = auditClaims({ text: replyText, claims, searched: turn.searches.length > 0 }); }
      if (audits.length && !audits.at(-1).after) audits.push({ unsourced: finalAudit.unsourced.length, absences: finalAudit.absences.length, sentences: finalAudit.unsourced.concat(finalAudit.absences).slice(0, 12), after: true });
      else if (!audits.length) audits.push({ unsourced: finalAudit.unsourced.length, absences: finalAudit.absences.length, sentences: finalAudit.unsourced.concat(finalAudit.absences).slice(0, 12), final: true });
      // what became of each move: checked, found nothing, failed, or not made — never "checked" on a failure
      for (const f of followUps) {
        if (f.kind === "audit") { const last = audits.at(-1); f.outcome = last?.after ? (last.unsourced + last.absences === 0 ? "checked" : "partly") : last && last.unsourced + last.absences === 0 ? "checked" : "partly"; continue; }
        if (f.kind === "search" || f.kind === "widen") { const s = turn.searches.slice(f.searchesAt); f.outcome = s.some((x) => (x.results ?? 0) > 0) ? "checked" : s.some((x) => x.error) ? "failed" : s.length ? "empty" : "not_made"; if (f.outcome === "failed") f.why = String(s.find((x) => x.error)?.error ?? ""); continue; }
        const c = toolCalls.slice(f.callsAt).filter((x) => f.tools.includes(x.name)); f.outcome = c.some((x) => x.ok !== false) ? "checked" : c.length ? "failed" : "not_made";
        if (f.outcome === "failed") { const e = c.find((x) => x.ok === false); f.why = String(e?.error ?? ""); f.tool = e?.name ?? f.tools[0]; }
      }
      yield {
        type: "done",
        modelId: usedModelId,
        requestedTier: requested,
        effectiveTier: effective,
        startTier,
        escalations,
        thoughts,
        stopReason,
        inputTokens: totalIn,
        outputTokens: totalOut,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        toolCalls,
        fallbacks,
        // the answer's text blocks with the citations the API attached to each (server.mjs makes them claims and sources)
        answerBlocks: named,
        // the stored reply ends with what streamed; it is replaced by the named reply without the narration
        replaceTail: { from: streamedTail, to: replyText },
        unsourcedSpans: (finalAudit?.spans ?? []).map(({ start, end, kind }) => ({ start, end, kind })),   // offsets into replyText
        followUps: followUps.map(({ callsAt, searchesAt, ...f }) => f),
        audits,
        nameCorrections,
        web: { provider: anthropicSearch ? "anthropic" : "none", widened: turn.widened, widenedFor: turn.widenedFor, searches: turn.searches.map(({ id, ...s }) => s), results: [...webResults].map(([url, r]) => ({ url, ...r })), anthropicSearches: webSearchRequests, tavilySearches: turn.searches.filter((s) => s.provider === "tavily").length, settings: web ? { official: web.official, industry: web.industry, source: web.source, overridden: web.overridden === true, allowedOverride: web.allowedOverride === true } : null },
      };
      return;
    }
    carried = [];

    conversation.push({ role: "assistant", content: assistantBlocks });
    // Text written in a round that ends by calling tools is the model thinking aloud, not the answer
    // (item 8a): it is moved out of the reply into the collapsed "Thought for Ns" disclosure.
    if (roundText.trim() || roundReasoning.trim()) {
      const thought = { text: roundText.trim() ? roundText : roundReasoning, ms: Date.now() - roundStarted };
      thoughts.push(thought);
      yield { type: "thought", ...thought };
    }

    // Tool calls in one round are independent, so they run together.
    const results = await Promise.all(
      requestedTools.map(async (call) => {
        const startedAt = Date.now();
        // Item 11: tell the console a tool STARTED, so long jobs (file generation) show named steps and a
        // building card instead of a bare wait.
        try { onToolProgress?.({ name: call.name, toolUseId: call.toolUseId, step: "start", input: call.input }); } catch { /* best-effort */ }
        // origin: "model" -- a confirmation token in a model tool call is refused
        // by executeTool; only the console's confirm endpoint may spend one.
        if (pinTool && call.name === pinTool.name && !pinTool.used) { pinTool.used = true; call.input = { ...pinTool.input }; }
        const result = await executeTool({ name: call.name, input: call.input, user, conversationId, inputMode, origin: "model", skipConfirm: skipConfirm && inputMode !== "voice", signal, turn, onProgress: (e) => { try { onToolProgress?.({ toolUseId: call.toolUseId, ...e }); } catch { /* best-effort */ } } });
        return { call, result, startedAt, durationMs: Date.now() - startedAt };
      })
    );

    const toolResultBlocks = [];
    const afterResults = [];   // what a search tool says besides its results: the API takes only search_result blocks in such a result
    for (const { call, result, startedAt, durationMs } of results) {
      toolCalls.push({ name: call.name, ok: result.ok !== false, error: result.ok === false ? result.error : null });
      // The RESULT rides on this chunk. The server builds the verbatim frame,
      // flight cards and the changed-on-the-wall block from tool results, and
      // without it every one of those came back empty in live chat -- the
      // audit found the ink frame had never rendered for a real turn. Sources
      // survived only because sourceLabel tolerates a missing result. The
      // server keeps the result to itself; the SSE event still carries only
      // name/input/ok/error.
      yield { type: "tool", name: call.name, input: call.input, ok: result.ok !== false, error: result.ok === false ? result.error : null, result, startedAt, durationMs };
      // search results (the knowledge base) go to the model as citable search_result blocks, then the rest as JSON
      // The API refuses a tool result that mixes search_result blocks with anything else (measured 2026-11-03: "if any blocks
      // in a tool result are of type search_result, all blocks must be of that type"), so the rest goes after the results.
      const { searchResults, ...rest } = result ?? {};
      const asSearch = Array.isArray(searchResults) && searchResults.length > 0 && result.ok !== false && loadModelConfig().provider === "anthropic";
      if (asSearch) afterResults.push({ text: `${call.name} (${call.toolUseId}) also returned: ${JSON.stringify({ ...rest, results: undefined })}` });
      toolResultBlocks.push({
        toolResult: {
          toolUseId: call.toolUseId,
          content: asSearch ? searchResults.map((sr) => ({ searchResult: sr })) : [{ json: rest }],
          ...(result.ok === false ? { status: "error" } : {}),
        },
      });
    }
    // A search the model asked for in this response and has not had answered runs at the start of the next request — but
    // only if that message holds tool results and nothing else (measured 2026-11-04: with our note after the results the
    // API refused it). Then the note is left out for this round.
    const answeredHere = new Set(assistantBlocks.filter((b) => b.raw?.type === "web_search_tool_result").map((b) => b.raw.tool_use_id));
    const searchPending = assistantBlocks.some((b) => b.raw?.type === "server_tool_use" && !answeredHere.has(b.raw.id));
    conversation.push({ role: "user", content: searchPending ? toolResultBlocks : [...toolResultBlocks, ...afterResults] });

    // Escalation (one-way): the caller reads what the tools returned and may raise the tier for the rest
    // of the turn. A lower answer is ignored here as well as in the caller.
    for (const { call, result } of results) roundResults.push({ name: call.name, result });
    if (onRound) {
      const next = await onRound({ tier, toolCalls: roundResults, round });
      const order = ["fast", "standard", "reasoning"];
      if (next?.to && order.indexOf(next.to) > order.indexOf(tier)) {
        const from = tier; tier = next.to;
        ({ requested, effective, config } = resolveTier(tier));
        candidates = modelCandidates(tier);
        const e = { from, to: tier, reason: next.reason ?? "escalated", round };
        escalations.push(e);
        yield { type: "escalated", ...e };
      }
    }

    // One round left: tell the model so, rather than letting it discover the
    // cliff by having its next tool request silently ignored. Without this the
    // turn ends mid-sentence, which a dispatcher reads as the agent breaking.
    if (round === MAX_TOOL_ROUNDS - 1 && !searchPending) {
      conversation.push({
        role: "user",
        content: [{ text: "You have no tool calls left for this turn. Answer now with what you already have, and say plainly what you could not check." }],
      });
    }
  }
}

/**
 * Mark the end of a block Bedrock may cache.
 *
 * Measured on this deployment's own audit log: input is 92% of spend, at a
 * median 18,000 input tokens against 188 output. Almost none of that is the
 * dispatcher's question — it is the system prompt and 43 tool definitions,
 * resent verbatim on every turn and on every tool round within a turn. Caching
 * that prefix is the largest single reduction available, and unlike routing it
 * needs no judgement about which model a question deserves.
 *
 * The cache point goes LAST, so everything before it is the cached prefix.
 * Ordering matters: anything appended after it is fresh input, which is why the
 * turn's messages are deliberately not cached — they change every turn, and a
 * cache point there would invalidate itself.
 *
 * Silently skipped for models that do not support it. A model that rejects the
 * block would fail the whole turn, and a cost optimisation must never be able
 * to take the agent down.
 */
function withCachePoint(blocks, modelId) {
  return supportsPromptCache(modelId) ? [...blocks, { cachePoint: { type: "default" } }] : blocks;
}

/**
 * Anthropic models on Bedrock support prompt caching; Nova's support differs by
 * model and the router's prompt is far too small to be worth caching anyway.
 * An allowlist rather than a denylist: a new model that turns out not to
 * support it then costs nothing extra instead of erroring on first use.
 */
function supportsPromptCache(modelId) {
  return /anthropic\.claude|^claude-/.test(String(modelId ?? ""));   // Bedrock ids and the Anthropic API's own
}

function safeJson(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // A malformed tool input is the model's error to recover from; handing it
    // to the framework produces a clean INVALID_INPUT it can read and retry.
    return { __malformed: String(raw).slice(0, 500) };
  }
}
