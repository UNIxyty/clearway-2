// Imported FIRST by main.ts. Two things the reused console modules assume and an offscreen document lacks:
//
// 1. fetch with a RELATIVE path. voiceCapture.ts / useVoiceInput call fetch(`${AGENT_BASE}/api/voice/...`)
//    where AGENT_BASE is "/agent" (stamped by vite.config.mts) with credentials "same-origin". In a
//    chrome-extension:// page a relative URL resolves to the extension itself, and "same-origin" would drop the
//    console's cookies. Every request whose URL starts with "/" is rewritten to the console origin, sent with
//    credentials "include", the x-clearway-client: extension header and cache no-store (PROTOCOL.md, Server).
//    Absolute URLs pass through untouched (the ElevenLabs socket URL is used by WebSocket, not fetch).
//
// 2. requestAnimationFrame. VoiceCapture drives its level meter with rAF, and an offscreen document is never
//    visible, so Chrome does not run animation frames there — the bands would never move. Replaced with a
//    timer at ~60 Hz; cancelAnimationFrame maps to clearTimeout. main.ts throttles what it forwards anyway.
import { CONSOLE_ORIGIN } from "~/shared/config";

const nativeFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  // "/agent/..." is ours; "//host/..." is protocol-relative and not.
  if (!url.startsWith("/") || url.startsWith("//")) return nativeFetch(input, init);
  const target = `${CONSOLE_ORIGIN}${url}`;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("x-clearway-client", "extension");
  const patched: RequestInit = { ...init, headers, credentials: "include", cache: "no-store" };
  // A Request object carries its own method/body: rebase it onto the new URL, then apply the overrides.
  const base = input instanceof Request ? new Request(target, input) : target;
  return nativeFetch(base, patched);
}) as typeof window.fetch;

const FRAME_MS = 16;
window.requestAnimationFrame = ((cb: FrameRequestCallback): number => window.setTimeout(() => cb(performance.now()), FRAME_MS)) as typeof window.requestAnimationFrame;
window.cancelAnimationFrame = ((id: number): void => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;

export {};
