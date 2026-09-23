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
import { Button, ConsoleStyles, ErrorBanner, EmptyState, TextInput, t } from "@/components/console-kit";

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
        <div className="cw-kit" style={{ margin: "0 auto", maxWidth: 620, padding: "64px 32px", textAlign: "center", fontSize: 13.5, color: t.muted }}>
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
      <ConsoleStyles />
      <div className="cw-kit" style={{ margin: "0 auto", maxWidth: 780, padding: "24px 32px", display: "flex", flexDirection: "column", gap: 12, minHeight: "100%" }}>
        {turns.length === 0 && (
          <EmptyState title="Ask a question to get started">
            The assistant answers as you — it can only see what you can see.
          </EmptyState>
        )}

        {turns.map((turn, i) => (
          <div
            key={i}
            style={{
              alignSelf: turn.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              background: turn.role === "user" ? t.blueWash : t.card,
              border: `1px solid ${turn.role === "user" ? t.blueBorder : t.border}`,
              borderRadius: 13,
              boxShadow: t.shadow,
              padding: "12px 15px",
              fontSize: 14,
              lineHeight: 1.6,
              color: t.ink,
              whiteSpace: "pre-wrap",
            }}
          >
            {turn.content || (streaming && i === turns.length - 1 ? (
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center", color: t.faint }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.faint, animation: "cwfade .9s ease-in-out infinite alternate" }} />
                thinking
              </span>
            ) : "")}
          </div>
        ))}

        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div ref={endRef} />

        <div style={{ position: "sticky", bottom: 0, display: "flex", gap: 10, paddingTop: 10, paddingBottom: 12, background: "linear-gradient(to bottom, rgba(251,251,252,0), #fbfbfc 22%)" }}>
          <TextInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
            disabled={streaming}
            placeholder="Ask about an airport, a NOTAM, a document…"
            style={{ height: 44 }}
          />
          <Button variant="primary" spin={streaming} disabled={streaming || !input.trim()} onClick={() => void send()} style={{ height: 44, flexShrink: 0 }}>
            Send
          </Button>
        </div>
      </div>
    </PortalShell>
  );
}
