// Live transcript for push-to-talk (design spec §4.23, §8): ElevenLabs Scribe
// v2 Realtime, reached by the BROWSER directly with a single-use token.
//
// Token, not relay — the decision, stated:
//   ElevenLabs issues single-use tokens for exactly this
//   (POST /v1/single-use-token/realtime_scribe → { token }, consumed on first
//   use, expires after 15 minutes). The API key stays on this server; the
//   browser gets one token per utterance, minted only after the caller passed
//   assertMayUseAgent and the Voice capability switch. A relay would add a hop
//   of latency to every 250 ms audio chunk, hold a socket per speaker on this
//   service, and put the audio through a process whose promise (§8.4) is that
//   it never keeps audio — the direct path keeps that promise by construction.
//
// The whole URL is built HERE, not in the browser: the model, the commit
// strategy (VAD), timestamps with per-word logprob, language detection and the
// ranked keyterm list are server decisions. The browser only appends audio.

import { keytermsFor } from "./keyterms.mjs";

const TOKEN_ENDPOINT = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";
const WS_BASE = process.env.ELEVENLABS_REALTIME_URL || "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
const MODEL = process.env.ELEVENLABS_REALTIME_MODEL || "scribe_v2_realtime";
export const SAMPLE_RATE = 16_000;
/** Scribe auto-commits after ~36 s of audio if nothing else closes a segment. */
export const AUTO_COMMIT_SECONDS = 36;
/**
 * Below this per-word logprob a committed word is shown as uncertain (§4.23
 * state 3, V8). Calibrated on the live API: clean synthetic speech scored
 * −0.4 … −1.3 per word (a correct "BTI472" came back at −1.31), so the bar
 * sits well under that. Tunable per deployment without a release.
 */
export const UNCERTAIN_LOGPROB = Number(process.env.VOICE_UNCERTAIN_LOGPROB || -2.0);

/**
 * @returns {Promise<{ url: string, expiresInSeconds: number, sampleRate: number, autoCommitSeconds: number, uncertainLogprob: number, keyterms: string[], candidates: {term: string, kind: string, hint: string|null}[] }>}
 */
export async function mintRealtimeSession(user, { language = null } = {}) {
  const key = String(process.env.ELEVENLABS_API_KEY || "").trim();
  if (!key) throw new Error("Voice is not configured on this deployment (ELEVENLABS_API_KEY).");

  // Keyterms and the token in parallel: the token is the slow half on a cold
  // path and the keyterms are cached per user for ten minutes.
  const [tokenRes, terms] = await Promise.all([
    fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "xi-api-key": key }, signal: AbortSignal.timeout(8_000) }),
    keytermsFor(user).catch(() => ({ realtime: [], candidates: [], sources: {} })),
  ]);
  if (!tokenRes.ok) {
    const detail = (await tokenRes.text().catch(() => "")).slice(0, 200);
    throw new Error(`Realtime token refused (${tokenRes.status})${detail ? `: ${detail}` : ""}`);
  }
  const { token } = await tokenRes.json();
  if (!token) throw new Error("Realtime token missing from the response.");

  const q = new URLSearchParams({
    model_id: MODEL,
    token,
    audio_format: `pcm_${SAMPLE_RATE}`,
    commit_strategy: "vad",
    // A dispatcher pauses mid-question to look at the wall; 1.2 s keeps one
    // question in one segment without holding text back for long.
    vad_silence_threshold_secs: String(Number(process.env.VOICE_VAD_SILENCE_SECS || 1.2)),
    include_timestamps: "true",          // → committed_transcript_with_timestamps, words carry logprob
    include_language_detection: "true",  // → language_code, for the reply-language directive
    // §8.4: nothing about the audio is kept on our side; ask the vendor not to either.
    enable_logging: "false",
  });
  if (language) q.set("language_code", String(language).slice(0, 8));
  for (const term of (terms.realtime ?? []).slice(0, 50)) q.append("keyterms", term);

  return {
    url: `${WS_BASE}?${q.toString()}`,
    expiresInSeconds: 15 * 60,
    sampleRate: SAMPLE_RATE,
    autoCommitSeconds: AUTO_COMMIT_SECONDS,
    uncertainLogprob: UNCERTAIN_LOGPROB,
    keyterms: terms.realtime ?? [],
    candidates: terms.candidates ?? [],
    sources: terms.sources ?? {},
  };
}
