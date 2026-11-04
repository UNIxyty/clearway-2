"use client";

// The staff side of every staff page (2026-11-04): the providers (search, the shared document viewer) and the portal
// frame. Loaded only through components/portal/FrameGate.tsx, so its code never reaches a client or a signed-out visitor.
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { PortalFrame } from "@/components/portal/Shell";

export default function StaffFrame({ children }: { children: ReactNode }) {
  return <Providers><PortalFrame>{children}</PortalFrame></Providers>;
}
