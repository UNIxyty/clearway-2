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
  const stream = new ReadableStream({
    start(controller) {
      for (const event of run.events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      const unsub = subscribeDebugRun(params.id, (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      });
      if (!unsub) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ level: "error", message: "Run not found" })}\n\n`));
      }
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
      }, 15000);
      const done = () => {
        clearInterval(heartbeat);
        unsub?.();
        controller.close();
      };
      run.emitter.once("done", done);
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
