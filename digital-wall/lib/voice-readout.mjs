// Voice readout relay (item 6; docs/agent-wall-voice-readout.md).
//
// The agent service sanitises a console's voice activity and POSTs it here,
// server-to-server, on /internal/voice-activity with the dedicated shared
// secret AGENT_WALL_EVENTS_SECRET (header x-agent-events-secret) — NOT the
// debug runner secret. This module:
//   - checks that secret in constant time (unset secret = route disabled);
//   - re-validates the payload shape (defence in depth: the agent already
//     applied the privacy policy; this only clamps types and lengths and drops
//     unknown fields, so a bug upstream cannot widen what reaches the room);
//   - keeps at most ONE readout per console session in memory, with a TTL, so
//     a console that disconnects mid-turn cannot leave a stale readout;
//   - hands the result to the SSE hub as a `voice-activity` event.
// Nothing here is persisted, and nothing changes wall state.

import { createHash, timingSafeEqual } from "node:crypto";

export const VOICE_READOUT_TTL_MS = 20_000;
const MAX_READOUTS = 8;
const PHASES = new Set(["listening", "transcribing", "thinking", "acting", "done", "error", "cancelled"]);
const TOOL_STATES = new Set(["running", "ok", "error"]);
const OUTCOME_KINDS = new Set(["ok", "confirm", "error", "cancelled"]);

export function voiceEventsSecretConfigured() {
  return Boolean(String(process.env.AGENT_WALL_EVENTS_SECRET || "").trim());
}

/** Constant-time comparison (hash first so lengths never leak or throw). */
export function voiceEventsSecretMatches(provided) {
  const expected = String(process.env.AGENT_WALL_EVENTS_SECRET || "").trim();
  if (!expected) return false;
  const a = createHash("sha256").update(String(provided ?? "")).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function str(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}

/** Clamp to the shape the display renders; returns null if it is not one. */
export function normaliseVoiceReadout(raw) {
  const id = String(raw?.id ?? "");
  if (!/^[a-f0-9]{8,64}$/.test(id)) return null;
  const phase = String(raw?.phase ?? "");
  if (!PHASES.has(phase)) return null;
  const activity = (Array.isArray(raw?.activity) ? raw.activity : []).slice(-3).map((a) => ({
    label: str(a?.label, 48),
    state: TOOL_STATES.has(a?.state) ? a.state : "running",
  })).filter((a) => a.label);
  const outcome = raw?.outcome && OUTCOME_KINDS.has(raw.outcome.kind)
    ? { kind: raw.outcome.kind, text: str(raw.outcome.text, 64) }
    : null;
  return {
    id,
    phase,
    speaker: str(raw?.speaker, 40) || "A dispatcher",
    transcript: {
      committed: str(raw?.transcript?.committed, 160),
      partial: str(raw?.transcript?.partial, 160),
    },
    activity,
    outcome,
    at: new Date().toISOString(),
    ttlMs: VOICE_READOUT_TTL_MS,
  };
}

export class VoiceReadoutStore {
  constructor({ broadcast, ttlMs = VOICE_READOUT_TTL_MS }) {
    this.broadcast = broadcast;
    this.ttlMs = ttlMs;
    this.readouts = new Map(); // id -> { readout, expiresAt }
    this.sweeper = setInterval(() => this.sweep(), 2_000);
    if (typeof this.sweeper.unref === "function") this.sweeper.unref();
  }

  upsert(readout) {
    this.readouts.delete(readout.id); // re-insert = most recent last
    this.readouts.set(readout.id, { readout, expiresAt: Date.now() + this.ttlMs });
    while (this.readouts.size > MAX_READOUTS) {
      const oldest = this.readouts.keys().next().value;
      this.readouts.delete(oldest);
      this.broadcast({ type: "voice-activity", id: oldest, phase: "expired" });
    }
    this.broadcast({ type: "voice-activity", ...readout });
  }

  /** Events stopped arriving: tell every display to drop the readout. */
  sweep(now = Date.now()) {
    for (const [id, entry] of [...this.readouts.entries()]) {
      if (entry.expiresAt > now) continue;
      this.readouts.delete(id);
      this.broadcast({ type: "voice-activity", id, phase: "expired" });
    }
  }
}
