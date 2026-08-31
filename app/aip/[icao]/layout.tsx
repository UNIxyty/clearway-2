"use client";

// Per-airport view (audit §5.2, post-deploy fix): /aip/<ICAO> shows the whole
// airport on ONE page — document card + GEN section + rail map/NOTAM/weather —
// with the MAIN sidebar (no deep-context swap; the in-page "Search › ICAO"
// breadcrumb links back to /aip). The AirportView is rendered HERE, in the
// [icao] layout, so its state (PDF viewer, NOTAM/weather/GEN caches, sync
// streams) survives navigation. Legacy /gen, /notam and /weather URLs are
// server-redirected to /aip/<ICAO> by the [[...tab]] page; anything else
// under the ICAO is a 404.

import { notFound, usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import PortalShell from "@/components/portal/Shell";
import AirportView from "@/components/portal/AirportView";

// Legacy sub-tab segments: still valid URLs (the page redirects them).
const LEGACY_TAB_SEGMENTS = new Set(["gen", "notam", "weather"]);

export default function AirportLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { icao: string };
}) {
  const pathname = usePathname() || "";

  // /aip/<icao> plus the redirecting legacy tabs — anything deeper or an
  // unknown segment is a 404.
  const segments = pathname.split("/").filter(Boolean);
  const validDepth =
    segments.length <= 2 || (segments.length === 3 && LEGACY_TAB_SEGMENTS.has(segments[2]));

  const rawIcao = params.icao ?? "";
  if (!/^[A-Za-z0-9]{4}$/.test(rawIcao) || !validDepth) notFound();

  const icao = rawIcao.toUpperCase();

  return (
    <PortalShell>
      <Suspense
        fallback={
          <div className="px-4 py-6 pb-12 sm:px-[30px]">
            <div className="mx-auto w-full max-w-[1600px]">
              <p className="text-sm text-[#6c7079]">Loading…</p>
            </div>
          </div>
        }
      >
        <AirportView icao={icao} />
      </Suspense>
      {children}
    </PortalShell>
  );
}
