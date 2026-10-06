"use client";

// One thread, shared by the side panel and the full page (design spec §6.12:
// expand "keeps everything"). Owns messages, the stream, Stop/Continue, the
// pending-confirmation lock, offline queueing of QUESTIONS (never writes —
// §3 rule 11), history, and the server-side conversation id.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStatus } from "./thread/Confirmation";
import { AGENT_BASE, type AgentContext, type AgentMessage, type ConfirmationStatus, type ConversationSummary, type FileData, type PageContextBlock, type PendingConfirmation, type SentAttachment, type ToolActivity } from "./types";
import { markForAutoOpen } from "./thread/autoOpen";

export type SendOptions = { tier?: string | null; attachmentIds?: string[]; attachments?: SentAttachment[]; voice?: boolean; language?: string | null; command?: string | null; pageContext?: PageContextBlock | null; system?: string | null };

export function useThread({ context, initialConversationId = null, initials = null }: { context: AgentContext | null; initialConversationId?: string | null; initials?: string | null }) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [title, setTitle] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState<string[]>([]);
  const [pinnedContext, setPinnedContext] = useState<AgentContext | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [loadingThread, setLoadingThread] = useState(Boolean(initialConversationId));
  const abortRef = useRef<AbortController | null>(null);
  const lastQuestion = useRef<{ text: string; opts: SendOptions } | null>(null);

  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`${AGENT_BASE}/api/history`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setConversations(body?.conversations ?? []);
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setLoadingThread(true);
    const res = await fetch(`${AGENT_BASE}/api/conversations/${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setLoadingThread(false);
    if (!body?.ok) { setError("That conversation could not be loaded."); return false; }
    setConversationId(id);
    setTitle(body.conversation?.title ?? null);
    const msgs: AgentMessage[] = (body.messages ?? []).map((m: AgentMessage) => ({ ...m, initials: m.role === "user" ? initials : null }));
    setMessages(msgs);
    setPinnedContext(body.conversation?.context ?? null);
    // A pending prompt survives a reload — but the server decides whether it is
    // still pending (the persisted block only knows it was issued).
    const pend = msgs.flatMap((m) => m.blocks?.confirmations ?? []).find((c) => !c.status || c.status === "pending");
    if (pend) {
      const s = await fetchStatus(pend.token).catch(() => null);
      const status = (s?.status ?? "expired") as ConfirmationStatus | "pending";
      if (status === "pending") setPendingConfirmation(pend);
      else {
        setPendingConfirmation(null);
        const at = s?.appliedAt ?? s?.cancelledAt ?? s?.expiresAt ?? new Date().toISOString();
        setMessages((list) => list.map((m) => (m.blocks?.confirmations ? { ...m, blocks: { ...m.blocks, confirmations: m.blocks.confirmations.map((x) => (x.token === pend.token ? { ...x, status, appliedAt: status === "applied" ? at : x.appliedAt, cancelledAt: status === "cancelled" ? at : x.cancelledAt, result: s?.result ?? x.result } : x)) } } : m)));
      }
    } else setPendingConfirmation(null);
    return true;
  }, [initials]);

  useEffect(() => { if (initialConversationId) void openConversation(initialConversationId); }, [initialConversationId, openConversation]);

  const newThread = useCallback(() => { setConversationId(null); setTitle(null); setMessages([]); setPinnedContext(null); setError(null); setPendingConfirmation(null); }, []);

  const send = useCallback(async (text: string, opts: SendOptions = {}) => {
    setError(null);
    if (pendingConfirmation) return; // §3 rule 7: locked until answered
    if (offline) { setQueued((q) => [...q, text]); return; } // questions queue; nothing that changes data does
    const pinned = pinnedContext ?? context;
    setPinnedContext(pinned);
    lastQuestion.current = { text, opts };
    const userId = `local-${Date.now()}`;
    setMessages((m) => [...m, { id: userId, role: "user", content: text, createdAt: new Date().toISOString(), sending: true, voice: Boolean(opts.voice), initials, blocks: opts.attachments?.length || opts.pageContext ? { ...(opts.attachments?.length ? { attachments: opts.attachments } : {}), ...(opts.pageContext ? { pageContext: opts.pageContext } : {}) } : undefined }, { id: "streaming", role: "assistant", content: "", streaming: true, createdAt: new Date().toISOString(), toolActivity: [] }]);
    setStreaming(true); setActivity(null);

    const controller = new AbortController(); abortRef.current = controller;
    let answer = "";
    const tools: ToolActivity[] = [];
    let done: Record<string, unknown> | null = null;
    const patchAssistant = (patch: Partial<AgentMessage>) => setMessages((list) => { const next = [...list]; for (let i = next.length - 1; i >= 0; i -= 1) if (next[i].role === "assistant") { next[i] = { ...next[i], ...patch }; break; } return next; });
    const markUser = (patch: Partial<AgentMessage>) => setMessages((list) => list.map((m) => (m.id === userId ? { ...m, ...patch } : m)));

    try {
      const response = await fetch(`${AGENT_BASE}/api/chat`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ message: text, conversationId, context: pinned, ...(opts.tier ? { tier: opts.tier } : {}), ...(opts.attachmentIds?.length ? { attachmentIds: opts.attachmentIds } : {}), ...(opts.voice ? { inputMode: "voice", voice: { language: opts.language ?? null } } : {}), ...(opts.pageContext ? { pageContext: { ...opts.pageContext, dataUrl: undefined } } : {}), ...(opts.system ? { system: opts.system } : {}) }),
      });
      if (!response.ok || !response.body) { const b = await response.json().catch(() => null); throw new Error(b?.message || `The assistant is unavailable (HTTP ${response.status}).`); }
      markUser({ sending: false });
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      const building = new Map<string, { id: string; filename: string; format: string | null; steps: string[]; index: number }>();
      let thoughtText = ""; let thoughtMs = 0; const escalations: { from: string; to: string; reason: string }[] = [];
      const currentBlocks = () => { let found: Record<string, unknown> = {}; setMessages((list) => { for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].role === "assistant") { found = (list[i].blocks ?? {}) as Record<string, unknown>; break; } return list; }); return found; };
      for (;;) {
        const { done: end, value } = await reader.read(); if (end) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const event = /^event: (.+)$/m.exec(frame)?.[1]; const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (!event || !data) continue;
          const payload = JSON.parse(data);
          if (event === "start") {
            setConversationId(payload.conversationId); if (payload.title) setTitle(payload.title);
            // The server says whether each file was actually read; the sent chip shows it (§4.18).
            if (Array.isArray(payload.attachments)) markUser({ blocks: { attachments: payload.attachments as SentAttachment[] } });
          }
          else if (event === "delta") { answer += payload.text; setActivity(null); patchAssistant({ content: answer }); }
          else if (event === "thought") {
            // Item 8a: that round's text was thinking aloud before a tool call — move it out of the reply.
            if (answer.endsWith(payload.text)) answer = answer.slice(0, answer.length - String(payload.text).length);
            thoughtText += (thoughtText ? "\n\n" : "") + String(payload.text).trim(); thoughtMs += Number(payload.ms) || 0;
            patchAssistant({ content: answer, blocks: { ...(currentBlocks()), thinking: { text: thoughtText, ms: thoughtMs } } as never });
          }
          else if (event === "tool_progress") {
            // Item 11: a tool started or reported a step. Long jobs show as running steps; a file being built
            // shows as a building card with its named steps until the finished card replaces it.
            if (payload.step === "start") { tools.push({ name: payload.name, ok: true, error: null, startedAt: new Date().toISOString(), durationMs: null, args: null, state: "running", toolUseId: payload.toolUseId } as never); patchAssistant({ toolActivity: [...tools] }); }
            if (payload.name === "generate_file" || payload.name === "make_passenger_manifest") {
              const prev = building.get(payload.toolUseId) ?? { id: payload.toolUseId, filename: payload.filename ?? "file", format: payload.format ?? null, steps: [] as string[], index: -1 };
              building.set(payload.toolUseId, { ...prev, filename: payload.filename ?? prev.filename, format: payload.format ?? prev.format, steps: payload.steps ?? prev.steps, index: payload.index ?? prev.index });
              patchAssistant({ blocks: { ...(currentBlocks()), building: [...building.values()] } as never });
            }
          }
          else if (event === "escalated") { escalations.push(payload); patchAssistant({ routeSource: `escalated ${payload.from}→${payload.to}` }); }
          else if (event === "tool") {
            { const r = tools.findIndex((t) => (t as { state?: string }).state === "running" && t.name === payload.name); if (r >= 0) tools.splice(r, 1); }
            if (payload.name === "generate_file" || payload.name === "make_passenger_manifest") { for (const [k, v] of building) if (v) { building.delete(k); break; } patchAssistant({ blocks: { ...(currentBlocks()), building: [...building.values()] } as never }); }
            tools.push({ name: payload.name, ok: payload.ok, error: payload.error ?? null, startedAt: payload.startedAt ?? null, durationMs: payload.durationMs ?? null, args: payload.input ?? null, state: "done", write: Boolean(payload.confirmationRequired) });
            setActivity(payload.name);
            patchAssistant({ toolActivity: [...tools] });
          }
          else if (event === "done") done = payload;
          else if (event === "error") throw new Error(payload.message || payload.error);
        }
      }
      const d = done ?? {};
      const confirmations = ((d.confirmations as PendingConfirmation[] | undefined) ?? []);
      patchAssistant({
        id: `msg-${Date.now()}`, content: answer, streaming: false,
        sources: (d.sources as AgentMessage["sources"]) ?? [],
        toolActivity: ((d.toolActivity as ToolActivity[] | undefined) ?? tools).map((t) => ({ ...t, state: "done" })),
        latencyMs: (d.latencyMs as number | undefined) ?? null,
        modelId: (d.modelId as string | undefined) ?? null, modelTier: (d.modelTier as string | undefined) ?? null, routeSource: (d.routeSource as string | undefined) ?? null,
        inputTokens: (d.inputTokens as number | undefined) ?? null, outputTokens: (d.outputTokens as number | undefined) ?? null,
        blocks: {
          verbatim: (d.verbatim as never) ?? [], flights: (d.flights as never) ?? [], actions: (d.actions as never) ?? [], mono: (d.mono as never) ?? [],
          documents: (d.documents as never) ?? [], files: (d.files as never) ?? [], airports: (d.airports as never) ?? [], tables: (d.tables as never) ?? [], confirmations,
          ...(d.thinking ? { thinking: d.thinking as never } : thoughtText ? { thinking: { text: thoughtText, ms: thoughtMs } as never } : {}),
          ...(d.routing ? { routing: d.routing as never } : {}),
        },
      });
      if (confirmations.length) setPendingConfirmation(confirmations[0]);
      // A passenger manifest opens in the document viewer as soon as it is ready (ops check it before sending) —
      // only for a file produced live in this turn, never when an old conversation is reloaded.
      for (const f of ((d.files as FileData[] | undefined) ?? [])) if (f.openInViewer) markForAutoOpen(f.id);
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      if (aborted) {
        const finished = tools.length; const cancelled = 0;
        patchAssistant({ content: answer, toolActivity: tools.map((t) => ({ ...t, state: "done" })), streaming: false, stopped: { at: new Date().toISOString(), finished, cancelled } });
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        markUser({ sending: false, failed: /unavailable|HTTP 5|network/i.test(msg) ? "the agent is unavailable" : undefined });
        setError(msg);
        patchAssistant({ content: answer, toolActivity: tools, streaming: false, error: msg });
      }
    } finally {
      setStreaming(false); setActivity(null); abortRef.current = null;
    }
  }, [context, conversationId, initials, offline, pendingConfirmation, pinnedContext]);

  // Queued questions send when the connection returns.
  useEffect(() => { if (!offline && queued.length && !streaming) { const [next, ...rest] = queued; setQueued(rest); void send(next); } }, [offline, queued, streaming, send]);

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);
  const continueReply = useCallback(() => { if (lastQuestion.current) void send("Continue from where you stopped.", lastQuestion.current.opts); }, [send]);

  const onConfirmationSettled = useCallback((c: PendingConfirmation, status: ConfirmationStatus, at: string, result?: Record<string, unknown> | null) => {
    setMessages((list) => list.map((m) => ({ ...m, blocks: m.blocks?.confirmations ? { ...m.blocks, confirmations: m.blocks.confirmations.map((x) => (x.token === c.token ? { ...x, status, appliedAt: status === "applied" ? at : x.appliedAt, cancelledAt: status === "cancelled" ? at : x.cancelledAt, result: result ?? x.result } : x)) } : m.blocks })));
    setPendingConfirmation((p) => (p?.token === c.token ? null : p));
  }, []);

  return {
    messages, conversationId, title, conversations, streaming, activity, error, setError, offline, queued,
    pinnedContext, setPinnedContext, pendingConfirmation, loadingThread,
    send, stop, continueReply, newThread, loadHistory, openConversation, onConfirmationSettled,
  };
}
export type Thread = ReturnType<typeof useThread>;
