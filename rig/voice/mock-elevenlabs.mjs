// A stand-in for ElevenLabs on the rig (:3986), so no rig test depends on an outside service answering, and the rig
// never spends the production account. It answers the four calls the agent and the browser make:
//   POST /v1/single-use-token/realtime_scribe     → a token
//   WS   /v1/speech-to-text/realtime              → the live transcript (also reached through the rig proxy at
//                                                   ws://127.0.0.1:3999/__elevenlabs/…, the console's own origin)
//   POST /v1/speech-to-text                       → a batch transcript
//   POST /v1/text-to-speech/<voice>/with-timestamps → a short spoken reply (rig/voice/reply-sample.mp3)
// The live transcript is earned: it is sent only once real voiced audio has arrived (≥ 0.5 s above the noise floor),
// so a test that passes still proves the page captured the microphone and streamed it. What it "hears" is the phrase
// set with POST /__rig/phrase {"text": …}; by default the manifest suite's "Pax manifest for KLJ7350".
//   node rig/voice/mock-elevenlabs.mjs        (rig/start.sh starts it; run-all-suites.sh makes sure it is up)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.MOCK_ELEVENLABS_PORT || 3986);
const here = path.dirname(new URL(import.meta.url).pathname);
const REPLY = fs.readFileSync(path.join(here, "reply-sample.mp3")).toString("base64");
let phrase = "Pax manifest for KLJ7350";
let tokens = 0;

const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
const words = (text) => text.split(/\s+/).filter(Boolean).map((w, i) => ({ text: w, start: 0.4 * i, end: 0.4 * i + 0.35, type: "word", logprob: -0.4 }));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/^\/__elevenlabs/, "");
  if (req.method === "POST" && p === "/__rig/phrase") { phrase = String(JSON.parse(String(await readBody(req)) || "{}").text || phrase); return json(res, 200, { phrase }); }
  if (!req.headers["xi-api-key"]) return json(res, 401, { detail: { status: "invalid_api_key" } });
  if (req.method === "POST" && p === "/v1/single-use-token/realtime_scribe") return json(res, 200, { token: `rig-${++tokens}` });
  if (req.method === "POST" && p === "/v1/speech-to-text") { await readBody(req); return json(res, 200, { text: phrase, language_code: "en", language_probability: 0.99, words: words(phrase) }); }
  const tts = p.match(/^\/v1\/text-to-speech\/[^/]+\/with-timestamps$/);
  if (req.method === "POST" && tts) {
    const text = String(JSON.parse(String(await readBody(req)) || "{}").text || "");
    const per = 0.06; const chars = [...text];
    return json(res, 200, { audio_base64: REPLY, alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * per), character_end_times_seconds: chars.map((_, i) => (i + 1) * per) } });
  }
  json(res, 404, { detail: `rig stand-in: no ${req.method} ${p}` });
});

// The live transcript. Voice activity: samples above 0.03 of full scale. A segment is committed after 1.2 s of quiet
// following speech (commit_strategy=vad), or when the client sends commit: true.
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const p = new URL(req.url, "http://x").pathname.replace(/^\/__elevenlabs/, "");
  if (p !== "/v1/speech-to-text/realtime") { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.send(JSON.stringify({ message_type: "session_started", session_id: `rig-session-${Date.now()}`, config: { sample_rate: 16000, audio_format: "pcm_16000", rig_stand_in: true } }));
    let voiced = 0, quiet = 0, partialSent = false;
    const commit = (forced) => {
      if (voiced >= 0.5) {
        ws.send(JSON.stringify({ message_type: "committed_transcript", text: phrase }));
        ws.send(JSON.stringify({ message_type: "committed_transcript_with_timestamps", text: phrase, language_code: "en", words: words(phrase) }));
      } else if (forced) ws.send(JSON.stringify({ message_type: "insufficient_audio_activity" }));
      voiced = 0; quiet = 0; partialSent = false;
    };
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.message_type !== "input_audio_chunk") return;
      const pcm = Buffer.from(String(m.audio_base_64 || ""), "base64");
      let loud = 0; for (let i = 0; i + 1 < pcm.length; i += 2) if (Math.abs(pcm.readInt16LE(i)) > 1000) loud += 1;
      const secs = pcm.length / 2 / 16000;
      if (secs && loud / (pcm.length / 2) > 0.02) { voiced += secs; quiet = 0; } else if (voiced > 0) quiet += secs;
      if (voiced >= 0.5 && !partialSent) { partialSent = true; ws.send(JSON.stringify({ message_type: "partial_transcript", text: phrase })); }
      if (m.commit) commit(true);
      else if (voiced >= 0.5 && quiet >= 1.2) commit(false);
    });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`rig ElevenLabs stand-in on :${PORT}`));
