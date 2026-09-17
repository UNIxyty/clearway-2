// Auto-collected context — six read-only fields in fixed order. The client
// sends what only it can know (page, browser, viewport, last failed request);
// the server fills what it must not trust the client for: role, and the
// service-status snapshot from the existing 13-check prover.

import { getSnapshot } from "@/lib/service-checker";
import type { HelpContext } from "@/lib/help/shared";

const clip = (v: unknown, max = 200) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

export function buildServiceSnapshotSummary(): string {
  try {
    const snapshot = getSnapshot();
    if (!snapshot.checks.length) return "no data yet";
    const unhealthy = snapshot.checks.filter((c) => c.state === "down" || c.state === "degraded");
    if (!unhealthy.length) return "all healthy";
    return unhealthy
      .slice(0, 3)
      .map((c) => `${c.id} ${c.state === "down" ? "unhealthy" : "degraded"}`)
      .join(" · ")
      .concat(unhealthy.length > 3 ? ` · +${unhealthy.length - 3}` : "");
  } catch {
    return "no data yet";
  }
}

export function buildHelpContext(input: {
  client: Partial<Record<"page" | "browser" | "viewport" | "lastRequest", unknown>>;
  role: string;
}): HelpContext {
  return {
    page: clip(input.client.page) || "unknown",
    role: clip(input.role, 80) || "user",
    browser: clip(input.client.browser, 120) || "unknown",
    viewport: clip(input.client.viewport, 40) || "unknown",
    services: buildServiceSnapshotSummary(),
    lastRequest: clip(input.client.lastRequest, 160) || "none",
  };
}
