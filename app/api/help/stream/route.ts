import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { addHelpClient } from "@/lib/help/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Help Centre SSE. Same mechanism as the platform's other streams:
 * data frames with JSON events, comment heartbeats every 25s.
 * Ops connections receive only their own threads' events; developers all.
 */
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (frame: string) => controller.enqueue(encoder.encode(frame));
      const close = () => {
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      };
      cleanup = addHelpClient({ userId: auth.user.id, isDeveloper: auth.isDeveloper, send, close });
      send(`retry: 5000\ndata: ${JSON.stringify({ type: "hello", serverTime: new Date().toISOString() })}\n\n`);
      heartbeat = setInterval(() => {
        try { send(": ping\n\n"); } catch { close(); cleanup?.(); }
      }, 25_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
