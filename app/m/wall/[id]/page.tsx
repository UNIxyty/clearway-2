// A flight on the wall, by its old phone address (/m/wall/<id>): the wall app's phone surface with that flight open
// (v3, 2026-11-13). The id is the wall's flight id (oprId:flightNid).
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function plain(id: string): string {
  try { return decodeURIComponent(id); } catch { return id; }
}

export default function WallFlightPage({ params }: { params: { id: string } }) {
  const id = plain(String(params?.id || "")).trim();
  redirect(id ? `/digital-wall/phone/?flight=${encodeURIComponent(id)}` : "/digital-wall/phone/");
}
