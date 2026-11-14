// The old phone wall's address (v3, 2026-11-13). The phone wall is now the wall app's own phone surface at
// /digital-wall/phone/, one app for staff and clients, so this page only sends an old link or bookmark there and
// keeps the flight it named (?flight=<id>, the wall's flight id).
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PHONE = "/digital-wall/phone/";

export default function WallPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const raw = searchParams?.flight;
  const flight = String((Array.isArray(raw) ? raw[0] : raw) || "").trim();
  redirect(flight ? `${PHONE}?flight=${encodeURIComponent(flight)}` : PHONE);
}
