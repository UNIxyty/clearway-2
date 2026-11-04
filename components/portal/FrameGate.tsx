"use client";

// Which frame a page gets (2026-11-04). The portal's frame (components/portal/Shell.tsx) carries the staff menu, the
// agent panel and their code. It used to wrap every page and draw nothing on /client — but its code still shipped to a
// client's browser, staff menu labels and all (rig/client-allow-check.mjs found it in three of twenty scripts). Now it
// is loaded only for addresses outside /client: a client's page never references its code at all. The client's world
// has its own shell (components/client/ClientShell.tsx, from app/client/layout.tsx).
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const PortalFrame = dynamic(() => import("@/components/portal/Shell").then((m) => m.PortalFrame));

export function FrameGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  if (pathname === "/client" || pathname.startsWith("/client/")) return <>{children}</>;
  return <PortalFrame>{children}</PortalFrame>;
}
