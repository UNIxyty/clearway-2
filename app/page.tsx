// The root no longer hosts the AIP search monolith (audit §5.2): "/" lands
// on the dashboard. Airport search lives at /aip; the airport view is a real
// deep-linkable route at /aip/<ICAO>. Legacy /?icao=EVRA deep links are
// forwarded to /aip, which resolves them to /aip/EVRA.

import { redirect } from "next/navigation";

export default function Home({
  searchParams,
}: {
  searchParams?: { icao?: string | string[] };
}) {
  const icaoParam = searchParams?.icao;
  const icao = (Array.isArray(icaoParam) ? icaoParam[0] : icaoParam)?.trim();
  if (icao) redirect(`/aip?icao=${encodeURIComponent(icao)}`);
  redirect("/dashboard");
}
