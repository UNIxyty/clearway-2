// Timeline and Flights (2026-11-10): one frame, kept mounted across the two addresses, showing the wall app's client
// surface (/digital-wall/timeline/?in=client). The same Board the ops wall draws, fed by the wall backend's scoped
// answers — not a copy in the portal. The frame and this shell agree on the page through postMessage: the sidebar
// changes the frame's page; a switch made inside the frame changes the address here. The frame is its own part
// (components/client/PartBoundary.tsx): if it cannot be drawn, the sidebar and the header stay.
import type { ReactNode } from "react";
import ClientFrame from "@/components/client/ClientFrame";
import PartBoundary from "@/components/client/PartBoundary";

export default function WatchLayout({ children }: { children: ReactNode }) {
  return <>{children}<PartBoundary where="client/frame" words="Your flights did not load."><ClientFrame /></PartBoundary></>;
}
