#!/usr/bin/env node
// Does keyterm prompting actually rescue ICAO codes? (PROMPT 9's gate.)
//
//   node scripts/agent-voice-benchmark.mjs --audio docs/voice-benchmark
//
// Runs every recorded query through Scribe TWICE — once cold, once primed with
// the keyterm list — and reports the difference. The headline number is
// CRITICAL TOKEN RECALL: of the ICAO codes, registrations and aviation codes
// that were actually said, how many came back intact. That is scored separately
// from word error rate on purpose. A sentence can be 95% correct and still send
// a dispatcher to the wrong airport, and WER averages that away.
//
// Needs ELEVENLABS_API_KEY and real recordings. It refuses to invent either:
// a number produced from synthesised speech would answer a different question
// than the one being asked.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const value = (f, d) => (args.indexOf(f) === -1 ? d : args[args.indexOf(f) + 1] ?? d);
const AUDIO_DIR = value("--audio", "docs/voice-benchmark");
const MODEL = value("--model", "scribe_v2_realtime");
const KEY = String(process.env.ELEVENLABS_API_KEY || "").trim();

const manifest = JSON.parse(readFileSync(path.join(AUDIO_DIR, "queries.json"), "utf8"));

function fail(message) { console.error(`\n${message}\n`); process.exit(2); }

if (!KEY) fail("ELEVENLABS_API_KEY is not set. Set it in .env and re-run.");

const audioFor = (id) => {
  const files = readdirSync(AUDIO_DIR).filter((f) => f.startsWith(`${id}.`) && /\.(wav|mp3|m4a|flac|ogg|webm)$/i.test(f));
  return files.length ? path.join(AUDIO_DIR, files[0]) : null;
};

const missing = manifest.queries.filter((q) => !audioFor(q.id));
if (missing.length === manifest.queries.length) {
  fail(
    `No recordings found in ${AUDIO_DIR}.\n\n` +
    `Record each query in docs/voice-benchmark/queries.json as <id>.wav — for example en-01.wav.\n` +
    `Record real dispatchers in the room they work in. Do NOT synthesise the audio: clean TTS speech\n` +
    `cannot tell you whether keyterm prompting rescues accented, noisy ICAO codes, which is the only\n` +
    `question this benchmark exists to answer.`,
  );
}
if (missing.length) {
  console.log(`note: ${missing.length} of ${manifest.queries.length} queries have no recording yet — scoring the rest.\n`);
}

/** Keyterms: the codes under test, plus the fixed aviation vocabulary. */
async function keyterms() {
  const { FIXED_AVIATION_TERMS } = await import("../agent/lib/voice/keyterms.mjs");
  const fromQueries = new Set();
  for (const q of manifest.queries) for (const t of q.critical) fromQueries.add(t.toUpperCase());
  return [...new Set([...fromQueries, ...FIXED_AVIATION_TERMS])];
}

async function transcribe(file, terms) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)]), path.basename(file));
  form.append("model_id", MODEL);
  if (terms) form.append("keyterms_prompt", JSON.stringify(terms));
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST", headers: { "xi-api-key": KEY }, body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/** Was the token transcribed intact? Case and hyphens are not the point. */
const normalise = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
function hasToken(transcript, token) {
  const flat = normalise(transcript);
  return flat.includes(normalise(token));
}

function wer(expected, actual) {
  const a = String(expected).toLowerCase().split(/\s+/).filter(Boolean);
  const b = String(actual).toLowerCase().split(/\s+/).filter(Boolean);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return a.length ? d[a.length][b.length] / a.length : 0;
}

async function main() {
  const terms = await keyterms();
  console.log(`model: ${MODEL}\nkeyterms: ${terms.length}\naudio: ${AUDIO_DIR}\n`);

  const rows = [];
  for (const q of manifest.queries) {
    const file = audioFor(q.id);
    if (!file) continue;
    let cold, warm;
    try {
      cold = await transcribe(file, null);
      warm = await transcribe(file, terms);
    } catch (e) {
      console.log(`  ${q.id}  TRANSCRIPTION FAILED — ${e.message}`);
      continue;
    }
    const coldHits = q.critical.filter((t) => hasToken(cold.text ?? "", t));
    const warmHits = q.critical.filter((t) => hasToken(warm.text ?? "", t));
    rows.push({ q, cold: cold.text ?? "", warm: warm.text ?? "", coldHits, warmHits });

    const delta = warmHits.length - coldHits.length;
    const flag = delta > 0 ? "  <-- keyterms recovered" : delta < 0 ? "  <-- keyterms LOST" : "";
    console.log(`  ${q.id} [${q.lang}]  codes ${coldHits.length}/${q.critical.length} -> ${warmHits.length}/${q.critical.length}${flag}`);
    if (delta !== 0) {
      console.log(`        cold: ${cold.text}`);
      console.log(`        warm: ${warm.text}`);
    }
  }

  const tot = (f) => rows.reduce((n, r) => n + f(r), 0);
  const criticalTotal = tot((r) => r.q.critical.length);
  const coldRecall = criticalTotal ? tot((r) => r.coldHits.length) / criticalTotal : 0;
  const warmRecall = criticalTotal ? tot((r) => r.warmHits.length) / criticalTotal : 0;
  const coldWer = rows.length ? rows.reduce((n, r) => n + wer(r.q.text, r.cold), 0) / rows.length : 0;
  const warmWer = rows.length ? rows.reduce((n, r) => n + wer(r.q.text, r.warm), 0) / rows.length : 0;

  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log(`\n  ${rows.length} recordings, ${criticalTotal} critical tokens`);
  console.log(`  CRITICAL TOKEN RECALL   cold ${pct(coldRecall)}  ->  keyterms ${pct(warmRecall)}   (${(warmRecall - coldRecall >= 0 ? "+" : "")}${((warmRecall - coldRecall) * 100).toFixed(1)} points)`);
  console.log(`  word error rate         cold ${pct(coldWer)}  ->  keyterms ${pct(warmWer)}`);

  const gain = warmRecall - coldRecall;
  console.log(
    gain >= 0.05
      ? `\n  VERDICT: keyterm prompting earns its place — ${(gain * 100).toFixed(1)} points of ICAO recall.`
      : gain <= -0.01
        ? `\n  VERDICT: keyterm prompting makes it WORSE here. Do not build on it. Investigate before proceeding.`
        : `\n  VERDICT: no meaningful improvement (${(gain * 100).toFixed(1)} points). Say so before building on it — the brief asks for exactly this call.`,
  );
}

main().catch((e) => { console.error(`\nbenchmark aborted: ${e.message}`); process.exit(1); });
