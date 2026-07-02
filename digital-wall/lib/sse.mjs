// Server-Sent Events hub for the Digital Wall backend.
//
// One process-wide hub: connected clients (wall displays + console users)
// register a response stream; broadcast() pushes small JSON events to all of
// them. The UI keeps its 60s poll as a fallback, so losing SSE only degrades
// freshness — it never breaks the wall.

const HEARTBEAT_MS = 25 * 1000;

function eventFrame(event) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export class SseHub {
  constructor() {
    this.clients = new Map(); // clientId -> { res, user, surface, connectedAt }
    this.nextClientId = 1;
    this.heartbeat = setInterval(() => {
      for (const [id, client] of this.clients.entries()) {
        try {
          client.res.write(`: ping ${Date.now()}\n\n`);
        } catch {
          this.removeClient(id);
        }
      }
    }, HEARTBEAT_MS);
    // Never keep the process alive just for heartbeats.
    if (typeof this.heartbeat.unref === "function") this.heartbeat.unref();
  }

  addClient({ req, res, user, surface = "display" }) {
    const id = this.nextClientId++;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(`retry: 5000\n`);
    res.write(eventFrame({ type: "hello", clientId: id, serverTime: new Date().toISOString() }));

    this.clients.set(id, {
      res,
      user: user ?? null,
      surface: String(surface || "display"),
      connectedAt: new Date().toISOString(),
    });

    req.on("close", () => this.removeClient(id));
    this.broadcastPresence();
    return id;
  }

  removeClient(id) {
    if (!this.clients.has(id)) return;
    const client = this.clients.get(id);
    this.clients.delete(id);
    try {
      client.res.end();
    } catch {
      /* already gone */
    }
    this.broadcastPresence();
  }

  broadcast(event) {
    const frame = eventFrame(event);
    for (const [id, client] of this.clients.entries()) {
      try {
        client.res.write(frame);
      } catch {
        this.removeClient(id);
      }
    }
  }

  presenceUsers() {
    const byUser = new Map();
    for (const client of this.clients.values()) {
      const user = client.user;
      const key = user?.userId || "anonymous";
      if (!byUser.has(key)) {
        byUser.set(key, {
          userId: key,
          email: user?.email ?? null,
          name: user?.name ?? "Unknown",
          initials: user?.initials ?? "??",
          surfaces: new Set(),
          connections: 0,
          connectedAt: client.connectedAt,
        });
      }
      const entry = byUser.get(key);
      entry.surfaces.add(client.surface);
      entry.connections += 1;
      if (client.connectedAt < entry.connectedAt) entry.connectedAt = client.connectedAt;
    }
    return [...byUser.values()].map((entry) => ({
      ...entry,
      surfaces: [...entry.surfaces].sort(),
    }));
  }

  broadcastPresence() {
    this.broadcast({ type: "presence.changed", users: this.presenceUsers() });
  }
}
