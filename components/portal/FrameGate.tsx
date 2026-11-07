"use client";

// Which frame a page gets (2026-11-04). The portal's frame (components/portal/Shell.tsx) and the staff providers (search,
// the document viewer) carry the staff menu, the agent panel and portal API names in their code. They used to wrap every
// page and draw nothing where they did not belong — but their code still shipped: to a client's browser (the staff menu,
// found by rig/client-allow-check.mjs) and to every signed-out visitor's (68 staff addresses on the sign-in page, found
// by rig/bundle-sweep.mjs). Now they load only on staff pages; a client's page and a signed-out page never reference
// their code at all. The client's world has its own shell (components/client/ClientShell.tsx).
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Pages for a client or for nobody signed in: the client's world, sign-in and its flows, asking for access, the
// set-password link, and the screens shown instead of the portal (maintenance, pending, blocked, forbidden).
const OUTSIDE = /^\/(client|login|signup|auth|request-access|welcome|forgot-password|reset-password|maintenance|pending-approval|access-blocked|forbidden)(\/|$)/;
export const isOutsidePage = (pathname: string) => OUTSIDE.test(pathname);

const StaffFrame = dynamic(() => import("@/components/portal/StaffFrame"));

export function FrameGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  if (isOutsidePage(pathname)) return <>{children}</>;
  return <StaffFrame>{children}</StaffFrame>;
}
