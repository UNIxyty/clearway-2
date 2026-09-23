"use client";

// Minimal chat surface for Part 1. Its job is to prove the path end to end —
// session -> gate -> Bedrock -> streamed reply -> audit — not to be the final
// agent UI. Tools, confirmations and conversation history are later parts.
//
// The page renders NOTHING agent-shaped until availability comes back true: a
// user without a grant must see no trace of the agent, so "checking" and
// "unavailable" both render as a plain not-found, never a disabled panel.

import { useEffect, useRef, useState } from "react";
import PortalShell from "@/components/portal/Shell";

type Turn = { role: "user" | "assistant"; content: string };

const AGENT_BASE = process.env.NEXT_PUBLIC_AGENT_BASE_URL || "/agent";

export default function AgentChat() {
  const [availability, setAvailability] = useState<"checking" | "yes" | "no">("checking");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  );
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/assistant/availability", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => setAvailability(d?.available ? "yes" : "no"))
      .catch(() => setAvailability("no"));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns([...next, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const response = await fetch(`${AGENT_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Same-origin so the Supabase session cookie rides along: the agent
        // acts as THIS user, with no service account behind it.
        credentials: "same-origin",
        body: JSON.stringify({ conversationId: conversationId.current, messages: next }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || `The assistant is unavailable (HTTP ${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line; keep the tail for the next chunk.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const event = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (!event || !data) continue;
          const payload = JSON.parse(data);
          if (event === "delta") {
            assistant += payload.text;
            setTurns([...next, { role: "assistant", content: assistant }]);
          } else if (event === "error") {
            throw new Error(payload.message || payload.error);
          }
        }
      }
      if (!assistant) setTurns(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTurns(next);
    } finally {
      setStreaming(false);
    }
  }

  // No entry point, no empty panel, no disabled button — nothing.
  if (availability !== "yes") {
    return (
      <PortalShell crumb="" title="Not found" subtitle="">
        <div className="mx-auto max-w-[620px] px-[30px] py-16 text-center text-[13px] text-cw-muted">
          {availability === "checking" ? "" : "This page does not exist."}
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      crumb="Assistant"
      title="Ask the assistant"
      subtitle="Early access. It answers as you — it can only see what you can see."
    >
      <div className="mx-auto flex h-full max-w-[760px] flex-col gap-3 px-[30px] py-6">
        {turns.length === 0 && (
          <div className="rounded-[13px] border border-cw-border bg-white p-6 text-center text-[13px] text-cw-muted">
            Ask a question to get started.
          </div>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className="rounded-[13px] border px-4 py-3 text-[13.5px] leading-[1.55] whitespace-pre-wrap"
            style={
              t.role === "user"
                ? { borderColor: "#dbe6ff", background: "#f2f7ff", color: "#17181c" }
                : { borderColor: "#e6e7ea", background: "#fff", color: "#17181c" }
            }
          >
            {t.content || (streaming && i === turns.length - 1 ? "…" : "")}
          </div>
        ))}
        {error && (
          <div className="rounded-[13px] border border-[#f3c7c2] bg-[#fdf2f2] px-4 py-3 text-[13px] text-[#b42318]">
            {error}
          </div>
        )}
        <div ref={endRef} />
        <div className="sticky bottom-0 flex gap-2 bg-cw-bg py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
            disabled={streaming}
            placeholder="Ask about an airport, a NOTAM, a document…"
            className="h-10 flex-1 rounded-[9px] border border-cw-border bg-white px-3 text-[13.5px] text-cw-ink outline-none disabled:opacity-60"
          />
          <button
            onClick={() => void send()}
            disabled={streaming || !input.trim()}
            className="h-10 cursor-pointer rounded-[9px] border-none bg-cw-primary px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {streaming ? "…" : "Send"}
          </button>
        </div>
      </div>
    </PortalShell>
  );
}
