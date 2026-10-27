"use client";

// A flight on the wall, from anywhere in /m (Flights, Important, NOTAM check…): the Wall tab, with that flight open on
// the wall's own phone page (2026-10-27). The id is the wall's flight id (oprId:flightNid).
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePhonePage } from "@/components/m/chrome";

export default function WallFlightPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  usePhonePage({ title: "Wall", tab: "wall", bar: false });
  useEffect(() => { router.replace(`/m/wall?flight=${encodeURIComponent(decodeURIComponent(String(id)))}`); }, [id, router]);
  return null;
}
