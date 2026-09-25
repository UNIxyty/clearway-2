// Speech-to-text for push-to-talk (design spec §4.23, §8). ElevenLabs Scribe,
// batch: the recording is sent once the key is released and the transcript
// comes back whole. Audio is transcribed and discarded — nothing is written to
// disk and nothing but the text is kept (§8.4 is a promise in the copy).

const ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL = process.env.ELEVENLABS_STT_MODEL || "scribe_v1";
const TIMEOUT_MS = Number(process.env.VOICE_STT_TIMEOUT_MS || 45_000);

export function sttConfigured() {
  return Boolean(String(process.env.ELEVENLABS_API_KEY || "").trim());
}

/**
 * @param {{ buffer: Buffer, mime: string|null, languageHint?: string|null }} input
 * @returns {Promise<{ text: string, language: string|null, languageProbability: number|null, words: number }>}
 */
export async function transcribe({ buffer, mime, languageHint = null }) {
  const key = String(process.env.ELEVENLABS_API_KEY || "").trim();
  if (!key) throw new Error("Voice is not configured on this deployment (ELEVENLABS_API_KEY).");
  const form = new FormData();
  form.append("model_id", MODEL);
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");
  if (languageHint) form.append("language_code", languageHint);
  const type = mime && /^audio\/|^video\/webm/.test(mime) ? mime.split(";")[0] : "audio/webm";
  const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : type.includes("wav") ? "wav" : type.includes("mpeg") ? "mp3" : "webm";
  form.append("file", new Blob([buffer], { type }), `speech.${ext}`);
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "xi-api-key": key }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Speech-to-text failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const data = await response.json();
  return {
    text: String(data?.text ?? "").trim(),
    language: data?.language_code ?? null,
    languageProbability: typeof data?.language_probability === "number" ? data.language_probability : null,
    words: Array.isArray(data?.words) ? data.words.filter((w) => w?.type === "word").length : 0,
  };
}
