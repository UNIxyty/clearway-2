// Help Centre live updates — an in-process SSE hub for the portal, following
// the platform's existing SSE mechanism (the wall hub / debug-run streams):
// text/event-stream, `data: <json>` frames, comment heartbeats.
//
// Routing rule, enforced here and nowhere else: an event reaches the thread's
// OWNER and every connected DEVELOPER. Ops never receive anyone else's threads.
// Kept on globalThis so dev HMR and route-chunk isolation share one hub.

import type { HelpStreamEvent } from "@/lib/help/shared";

type Client = {
  id: number;
  userId: string;
  isDeveloper: boolean;
  send: (frame: string) => void;
  close: () => void;
};

type Hub = { clients: Map<number, Client>; nextId: number };

const HUB_KEY = Symbol.for("clearway.help.sse-hub");

function hub(): Hub {
  const g = globalThis as unknown as Record<symbol, Hub | undefined>;
  if (!g[HUB_KEY]) g[HUB_KEY] = { clients: new Map(), nextId: 1 };
  return g[HUB_KEY]!;
}

export function addHelpClient(input: {
  userId: string;
  isDeveloper: boolean;
  send: (frame: string) => void;
  close: () => void;
}): () => void {
  const h = hub();
  const id = h.nextId++;
  h.clients.set(id, { id, ...input });
  return () => h.clients.delete(id);
}

export function publishHelpEvent(event: HelpStreamEvent): void {
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of hub().clients.values()) {
    if (!client.isDeveloper && client.userId !== event.ownerUserId) continue;
    try {
      client.send(frame);
    } catch {
      hub().clients.delete(client.id);
      try { client.close(); } catch { /* already gone */ }
    }
  }
}

export function helpClientCount(): number {
  return hub().clients.size;
}
