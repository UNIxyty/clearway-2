import { notFound, redirect } from "next/navigation";

// The airport view itself is rendered by the [icao] layout so its state
// (PDF viewer, NOTAM/weather/GEN caches, sync streams) survives navigation.
// The sub-tabs were removed: /aip/<ICAO> is the single canonical page, and
// the legacy /gen, /notam and /weather URLs redirect to it here (server
// redirect). Unknown segments are a 404 (the layout also guards this for
// client-side navigations).
const LEGACY_TABS = new Set(["gen", "notam", "weather"]);

export default function AirportTabPage({
  params,
}: {
  params: { icao: string; tab?: string[] };
}) {
  const tab = params.tab ?? [];
  if (tab.length === 0) return null;
  if (tab.length === 1 && LEGACY_TABS.has(tab[0])) {
    redirect(`/aip/${params.icao}`);
  }
  notFound();
}
