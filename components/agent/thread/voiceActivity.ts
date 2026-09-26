"use client";

// Voice activity for the wall readout: what the person talking to the agent is
// doing right now (listening, transcribing, thinking, acting, done). Fire and
// forget — a readout that is down must never slow or break the voice path, so
// this never throws and never awaits anything the caller depends on.

import { AGENT_BASE } from "../types";

export type VoicePhase = "listening" | "transcribing" | "thinking" | "acting" | "done" | "error" | "cancelled";
export type VoiceActivityBody = {
  sessionId: string;
  phase: VoicePhase;
  partial?: string;
  committed?: string;
  tools?: { name: string; state: string }[];
  outcome?: { kind: string; summary?: string };
};

export function postVoiceActivity(body: VoiceActivityBody): void {
  try {
    void fetch(`${AGENT_BASE}/api/voice/activity`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never throws */
  }
}
