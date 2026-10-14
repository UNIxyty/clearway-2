// What a person sees when something fails: what happened and what to do, in our own words. The detail — an exception,
// an upstream body, a database error, a stack, a setting that is missing — goes to the server log, never to a screen:
// we do not control what an upstream service puts in an error, so that is also how a token or a passenger's name
// would reach someone's screen. rig/check-error-text.mjs and rig/error-text-browser-check.mjs fail when it does.
import { NextResponse } from "next/server";

/** Common endings: what to do next (shared with the browser through lib/error-text.ts). */
export { TRY_AGAIN, REPORT_IT } from "@/lib/error-text";

/** Log the detail on the server, under a tag that says where it came from. */
export function logFailure(tag: string, what: string, detail?: unknown): void {
  const d = detail instanceof Error ? `${detail.name}: ${detail.message}` : detail;
  console.error(`[${tag}] ${what}`, d === undefined ? "" : d);
}

/**
 * A JSON error response with a person-facing message. `code` is for the page to tell cases apart; it is never shown.
 * The detail is logged, not sent.
 */
export function failure(
  status: number,
  message: string,
  log?: { tag: string; what: string; detail?: unknown },
  extra?: Record<string, unknown>,
): NextResponse {
  if (log) logFailure(log.tag, log.what, log.detail);
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

/** What really happened underneath: the upstream's own HTTP status, or that it did not answer at all. */
export type UpstreamStatus = number | "unreachable" | "timeout" | "unknown";

/**
 * A failure of something the portal depends on (a sync worker, an AI provider, an AIP site). Answers 503, not 502 or
 * 504: Cloudflare, in front of production, replaces the body of an origin 502 or 504 with its own error page, so the
 * person would never read our message (seen 2026-10-14). We change the envelope, not the truth: the real status goes
 * to the log and to `upstreamStatus` in the body. rig/check-error-text.mjs fails on a 502 or 504.
 */
export function upstreamFailure(
  message: string,
  upstreamStatus: UpstreamStatus,
  log?: { tag: string; what: string; detail?: unknown },
  extra?: Record<string, unknown>,
): NextResponse {
  const logged = log ? { ...log, what: `${log.what} (upstream: ${upstreamStatus})` } : undefined;
  return failure(503, message, logged, { upstreamStatus, ...(extra ?? {}) });
}

/** An upstream status passed on to the page: a 502 or 504 becomes 503 (see upstreamFailure); others go through. */
export const surfaceStatus = (status: number): number => (status === 502 || status === 504 ? 503 : status);

/** Fields of a worker's error event that the page may need to tell cases apart. Everything else is dropped. */
const MACHINE_FIELDS = ["code", "status", "done", "prefix", "type", "icao"] as const;

/**
 * Pass a sync worker's event stream (`data: {json}` events) through to the page with its error events re-worded.
 * Progress events (`step`, `done`, …) go through unchanged. An event that carries `error` is logged and replaced by
 * `{ error: <our message>, …machine fields }`; the worker's `error` and `detail` text never reach the page. A function
 * `message` can choose the wording (and a `code`) from the worker's event.
 */
export function publicEventStream(
  body: ReadableStream<Uint8Array>,
  tag: string,
  message: string | ((event: Record<string, unknown>) => string | { error: string; code?: string | number }),
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const rewrite = (block: string): string =>
    block
      .split("\n")
      .map((line) => {
        if (!line.startsWith("data:")) return line;
        const raw = line.slice(5).trim();
        let event: unknown;
        try {
          event = JSON.parse(raw);
        } catch {
          return line;
        }
        if (!event || typeof event !== "object" || Array.isArray(event)) return line;
        const e = event as Record<string, unknown>;
        if (!e.error) return line;
        logFailure(tag, "Worker sent an error event", { error: e.error, detail: e.detail });
        const safe: Record<string, unknown> = {};
        for (const k of MACHINE_FIELDS) {
          const v = e[k];
          if (typeof v === "number" || typeof v === "boolean") safe[k] = v;
          else if (typeof v === "string" && /^[A-Za-z0-9_.-]{1,24}$/.test(v)) safe[k] = v;
        }
        const out = typeof message === "function" ? message(e) : message;
        const ours = typeof out === "string" ? { error: out } : out;
        return `data: ${JSON.stringify({ ...safe, ...ours })}`;
      })
      .join("\n");

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) controller.enqueue(encoder.encode(`${rewrite(block)}\n\n`));
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer) controller.enqueue(encoder.encode(rewrite(buffer)));
      },
    }),
  );
}
