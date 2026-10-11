"use client";

// What the user is looking at, derived from the route.
//
// The design's rule: the chip names the page or record, updates as the user
// navigates UNTIL they send, and after that the thread keeps its context. The
// "until they send" half lives in the panel (it pins what it was given); this
// hook only reports the truth of the current page.

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { AgentContext } from "./types";

// Only what the agent can actually use. An airport (from the route or ?icao) is an identifier it looks up; a page name
// alone is not — the agent receives only the label, never the page's content (tested 2026-10-11 on Permissions), so
// portal pages no longer claim to be "asked about" (portal redesign, decision 26a). Reading a page's content is its
// own job (it must keep passenger data on intake and mailbox screens away from the agent).
/**
 * Reports the query string to the portal frame. The frame lives in the root layout, where a bare useSearchParams()
 * would make every statically rendered page give up server rendering; inside its own Suspense boundary only this
 * renders on the client, and the frame (sidebar and all) still renders on the server.
 */
function SearchWatcherInner({ onChange }: { onChange: (search: string) => void }) {
  const params = useSearchParams();
  const search = params?.toString() ?? "";
  useEffect(() => { onChange(search); }, [search, onChange]);
  return null;
}
export function SearchWatcher({ onChange }: { onChange: (search: string) => void }) {
  return <Suspense fallback={null}><SearchWatcherInner onChange={onChange} /></Suspense>;
}

/** `search`: the query string, from <SearchWatcher> (read only after mount, see below). */
export function useAgentContext(search = ""): AgentContext | null {
  const pathname = usePathname();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  // The query string is only read AFTER mount. During SSR it is not knowable,
  // and letting it decide the first render is what makes the server and client
  // trees disagree. The chip appearing a frame late is the correct trade.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return useMemo(() => {
    if (!pathname) return null;

    // An airport view is the most specific thing the portal shows.
    const airport = /^\/aip\/([A-Z0-9]{4})$/i.exec(pathname);
    if (airport) {
      const icao = airport[1].toUpperCase();
      return { kind: "airport", label: icao, icao, icon: "map-pin" };
    }

    const icaoParam = mounted ? params?.get("icao") : null;
    if (icaoParam && /^[A-Za-z0-9]{4}$/.test(icaoParam)) {
      const icao = icaoParam.toUpperCase();
      return { kind: "airport", label: icao, icao, icon: "map-pin" };
    }

    return null;
  }, [pathname, params, mounted]);
}
