"use client";

// Deep-linkable airport context (audit §5.2): /aip/<ICAO> plus the /gen,
// /notam and /weather sub-tabs. The AirportView is rendered HERE, in the
// [icao] layout, so its state (PDF viewer, NOTAM/weather/GEN caches, sync
// streams) survives tab navigation — pages remount per URL, layouts don't.
// The shell shows the airport deep context (back to /aip, one nav item per
// tab) built from components/portal/nav.ts AIRPORT_DEEP_ITEMS.

import { notFound, usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import PortalShell, { type DeepContext } from "@/components/portal/Shell";
import { AIRPORT_DEEP_ITEMS } from "@/components/portal/nav";
import AirportView, { type AirportTab } from "@/components/portal/AirportView";

const TAB_SEGMENTS: Record<string, AirportTab> = {
  gen: "gen",
  notam: "notam",
  weather: "weather",
};

export default function AirportLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { icao: string };
}) {
  const pathname = usePathname() || "";
  const [airportName, setAirportName] = useState<string | null>(null);

  // /aip/<icao>[/<tab>] — anything deeper or an unknown tab is a 404.
  const segments = pathname.split("/").filter(Boolean);
  const tabSegment = segments[2] ?? "";
  const tab: AirportTab | null =
    segments.length <= 2 ? "aip" : segments.length === 3 ? TAB_SEGMENTS[tabSegment] ?? null : null;

  const rawIcao = params.icao ?? "";
  if (!/^[A-Za-z0-9]{4}$/.test(rawIcao) || !tab) notFound();

  const icao = rawIcao.toUpperCase();
  const deepContext: DeepContext = {
    icon: "plane",
    code: icao,
    sub: airportName ?? undefined,
    backHref: "/aip",
    items: AIRPORT_DEEP_ITEMS.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      href: item.tab ? `/aip/${icao}/${item.tab}` : `/aip/${icao}`,
      active: (item.tab === "" ? "aip" : item.tab) === tab,
    })),
  };

  return (
    <PortalShell deepContext={deepContext}>
      <Suspense
        fallback={
          <div className="px-4 py-6 pb-12 sm:px-[30px]">
            <div className="mx-auto w-full max-w-[1600px]">
              <p className="text-sm text-[#6c7079]">Loading…</p>
            </div>
          </div>
        }
      >
        <AirportView icao={icao} tab={tab} onAirportName={setAirportName} />
      </Suspense>
      {children}
    </PortalShell>
  );
}
