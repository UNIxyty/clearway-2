import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDebugRun, subscribeDebugRun } from "@/lib/debug-runner";

type Params = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const run = getDebugRun(params.id);
  if (!run) return new Response(JSON.stringify({ error: "Run not found" }), { status: 404 });

  const encoder = new TextEncoder();
  let cleanupStream = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsub: (() => void) | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let done = () => {};
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        unsub?.();
        unsub = null;
        run.emitter.off("done", done);
      };
      cleanupStream = cleanup;
      const send = (payload: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          cleanup();
        }
      };
      done = () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      };

      for (const event of run.events) {
        send(`data: ${JSON.stringify(event)}\n\n`);
      }
      unsub = subscribeDebugRun(params.id, (event) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });
      if (!unsub) {
        send(`data: ${JSON.stringify({ level: "error", message: "Run not found" })}\n\n`);
      }
      heartbeat = setInterval(() => {
        send("event: ping\ndata: {}\n\n");
      }, 15000);
      run.emitter.once("done", done);
    },
    cancel() {
      cleanupStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
