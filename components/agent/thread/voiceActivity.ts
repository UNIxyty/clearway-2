import { AGENT_BASE } from "../types";

// Voice readout on the wall display (item 6; docs/agent-wall-voice-readout.md).
// The console's voice flow reports its phases here; the agent service decides
// what the room may see (the privacy policy lives server-side, in
// agent/lib/voice/wall-readout.mjs — nothing here is trusted to filter) and
// relays it to the wall. Fire-and-forget: a readout that fails to post must
// never slow or break the user's voice turn.

export type VoicePhase = "listening" | "transcribing" | "thinking" | "acting" | "done" | "error" | "cancelled";

export type VoiceActivityBody = {
  /** Stable per console voice session (e.g. one per panel mount). */
  sessionId: string;
  phase: VoicePhase;
  /** The provisional tail of what is being said. */
  partial?: string;
  /** Everything already final in this turn. */
  committed?: string;
  tools?: { name: string; state: "running" | "ok" | "error" }[];
  /** summary is only passed through in the form "2 flights shown"; anything else is dropped server-side. */
  outcome?: { kind: "ok" | "confirm" | "error"; summary?: string };
};

export function postVoiceActivity(body: VoiceActivityBody): void {
  try {
    void fetch(`${AGENT_BASE}/api/voice/activity`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* never throws into the voice flow */
  }
}
