"use client";

// What the user is looking at, derived from the route.
//
// The design's rule: the chip names the page or record, updates as the user
// navigates UNTIL they send, and after that the thread keeps its context. The
// "until they send" half lives in the panel (it pins what it was given); this
// hook only reports the truth of the current page.

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { AgentContext } from "./types";

const PAGE_LABELS: Array<[RegExp, string, string]> = [
  [/^\/dashboard/, "Dashboard", "layout-dashboard"],
  [/^\/aip\/service-status/, "Service status", "activity"],
  [/^\/aip$/, "Airport search", "search"],
  [/^\/admin\/users/, "Users", "users"],
  [/^\/admin\/debug/, "Debug runner", "terminal"],
  [/^\/admin\/airports\/deleted/, "Deleted airports", "trash-2"],
  [/^\/account\/search-stats/, "Search statistics", "chart-bar"],
  [/^\/developer\/inbox/, "Developer inbox", "inbox"],
  [/^\/help/, "Help Centre", "life-buoy"],
];

export function useAgentContext(): AgentContext | null {
  const pathname = usePathname();
  const params = useSearchParams();

  return useMemo(() => {
    if (!pathname) return null;

    // An airport view is the most specific thing the portal shows.
    const airport = /^\/aip\/([A-Z0-9]{4})$/i.exec(pathname);
    if (airport) {
      const icao = airport[1].toUpperCase();
      return { kind: "airport", label: icao, icao, icon: "map-pin" };
    }

    const icaoParam = params?.get("icao");
    if (icaoParam && /^[A-Za-z0-9]{4}$/.test(icaoParam)) {
      const icao = icaoParam.toUpperCase();
      return { kind: "airport", label: icao, icao, icon: "map-pin" };
    }

    for (const [pattern, label, icon] of PAGE_LABELS) {
      if (pattern.test(pathname)) return { kind: "page", label, icon };
    }
    return null;
  }, [pathname, params]);
}
