// The root no longer hosts the AIP search monolith (audit §5.2). A signed-in "/" is redirected by the middleware to
// the person's start page (Settings → Preferences, stage 4) before this renders; what reaches here is a legacy
// /?icao=EVRA deep link, forwarded to /aip (which resolves it to /aip/EVRA), or the fallback: the Dashboard.

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
