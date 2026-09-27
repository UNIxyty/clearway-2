// Microphone PCM tap for voice input (components/agent/thread/voiceCapture.ts). A real file, loaded by URL —
// the console serves it from /voice-worklet.js, the Chrome extension ships it at its root — because an
// extension's CSP (script-src 'self') refuses worklet modules built from blob: URLs.
// Posts Float32 frames in 2048-sample batches; resampling happens on the main thread.
class CwPcm extends AudioWorkletProcessor {
  constructor() { super(); this.b = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const c = inputs[0] && inputs[0][0];
    if (c) for (let k = 0; k < c.length; k++) { this.b[this.n++] = c[k]; if (this.n === this.b.length) { this.port.postMessage(this.b.slice(0)); this.n = 0; } }
    return true;
  }
}
registerProcessor("cw-pcm", CwPcm);
