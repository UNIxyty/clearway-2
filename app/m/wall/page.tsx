"use client";

// The Wall tab is a door into the wall (2026-10-27). The phone shell keeps its tab bar — one app, five tabs — and
// behind this tab is the wall's own phone page: the Digital Wall app at /digital-wall/timeline/, framed, on the same
// origin and the same session. It is the wall's document, not the portal's, so it draws with the room's own colours
// and font and no portal token or data-theme can reach it (the boundary rig/stage1-check.mjs asserts). The portal's
// earlier phone board (Stage 2) is retired here; its facts module (shared/wall-facts.mjs) is what the wall's page
// reads too. A registered screen never comes here: it stays on the display at any size.
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { usePhonePage } from "@/components/m/chrome";

function Door() {
  const params = useSearchParams();
  const flight = params.get("flight");
  usePhonePage({ title: "Wall", tab: "wall", bar: false });
  const src = `/digital-wall/timeline/?in=m${flight ? `&flight=${encodeURIComponent(flight)}` : ""}`;
  return (
    // The status-bar strip above the frame: inside the frame the phone's safe area reads as zero.
    <div data-wall-door="" className="flex min-h-0 flex-1 flex-col bg-black pt-[env(safe-area-inset-top)]">
      <iframe key={src} src={src} title="Digital Wall" className="block min-h-0 w-full flex-1 border-0" allow="screen-wake-lock" />
    </div>
  );
}

export default function WallPage() {
  return <Suspense fallback={null}><Door /></Suspense>;
}
