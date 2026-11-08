// A recording for Chrome's fake microphone (--use-file-for-fake-audio-capture), made in code (2026-11-08). The suites
// that talk read a WAV from rig/.scratch that one Mac had made by hand, so a rig built anywhere else played silence.
// The rig's ElevenLabs stand-in does not recognise words: it commits its fixed phrase once ≥ 0.5 s of sound above 0.03
// of full scale has arrived and 1.2 s of quiet follows (rig/voice/mock-elevenlabs.mjs). So this is speech-shaped
// sound — harmonics under a syllable-rate envelope — between silences, the same on every machine.
//   import { fakeSpeechWav } from "../voice/fake-speech.mjs"; const file = fakeSpeechWav("rig/.scratch/voice-x.wav");
import fs from "node:fs";
import path from "node:path";

export function fakeSpeechWav(file, { lead = 0.6, voiced = 2.4, tail = 2.5, rate = 48000 } = {}) {
  const n = Math.round((lead + voiced + tail) * rate); const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate; let v = 0;
    if (t >= lead && t < lead + voiced) {
      const u = t - lead; const syllable = Math.max(0, Math.sin(Math.PI * 4 * u)) ** 0.6;   // about four syllables a second
      const f0 = 140 + 20 * Math.sin(2 * Math.PI * 0.7 * u);                                  // a speaking voice's pitch, drifting
      for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f0 * h * u) / h;
      v *= 0.28 * syllable;
    }
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVE", 8); head.write("fmt ", 12);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.concat([head, pcm]));
  return file;
}
