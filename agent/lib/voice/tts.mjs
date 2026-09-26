// Spoken replies (design spec §4.25). ElevenLabs text-to-speech with
// character timestamps, on the same key as speech-to-text. The timestamps
// drive the transcript colouring (S3: spoken #17181c, not yet spoken #b9bdc5)
// and the reading-position highlight (S2), which need sentence timing.
//
// Only ever called with a speech plan's text (speech.mjs) or a fixed phrase —
// never with arbitrary client text — so rule 10 is enforced here, on the
// server, and not by the page.

const BASE = "https://api.elevenlabs.io/v1/text-to-speech";
// "George" — a premade voice, usable on every plan (library voices are not on
// the free tier: the live API returns 402 paid_plan_required for them).
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";
const TIMEOUT_MS = Number(process.env.VOICE_TTS_TIMEOUT_MS || 20_000);
export const MAX_TTS_CHARS = 900;

export function ttsConfigured() {
  return Boolean(String(process.env.ELEVENLABS_API_KEY || "").trim()) && process.env.VOICE_TTS_DISABLED !== "true";
}

/**
 * @param {string} text
 * @param {{ sentences?: string[] }} [opts]
 * @returns {Promise<{ audio: string, mime: string, duration: number, words: {i: number, t: number}[], sentences: {text: string, start: number, end: number}[] }>}
 */
export async function synthesize(text, { sentences = [] } = {}) {
  const key = String(process.env.ELEVENLABS_API_KEY || "").trim();
  if (!key) throw new Error("Voice is not configured on this deployment (ELEVENLABS_API_KEY).");
  const input = String(text ?? "").slice(0, MAX_TTS_CHARS);
  const response = await fetch(`${BASE}/${encodeURIComponent(VOICE_ID)}/with-timestamps?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: input, model_id: MODEL }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Text-to-speech failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const data = await response.json();
  const a = data?.alignment ?? data?.normalized_alignment ?? null;
  const starts = a?.character_start_times_seconds ?? [];
  const ends = a?.character_end_times_seconds ?? [];
  const duration = ends.length ? ends[ends.length - 1] : 0;
  const at = (i) => starts[Math.min(Math.max(0, i), starts.length - 1)] ?? 0;

  // Word marks: character index where each word starts, and when it is heard.
  const words = [];
  const re = /\S+/g; let m;
  while ((m = re.exec(input))) words.push({ i: m.index, t: at(m.index) });

  // Sentence timing for the reading position (READING 2 OF 3).
  const timed = [];
  let from = 0;
  for (const s of sentences) {
    const idx = input.indexOf(s, from);
    if (idx < 0) continue;
    const endIdx = idx + s.length - 1;
    timed.push({ text: s, start: at(idx), end: ends[Math.min(endIdx, ends.length - 1)] ?? duration });
    from = idx + s.length;
  }
  return { audio: String(data?.audio_base64 ?? ""), mime: "audio/mpeg", duration, words, sentences: timed };
}
