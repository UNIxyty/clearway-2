"use client";

// The portal's page-not-found (moved out of app/not-found.tsx 2026-10-28): a client component so that the root not-found
// adds nothing but a module reference to every page's payload. Since 2026-11-11 the shared status screen; the button
// goes to the start, which the middleware turns into the person's own front door (a client's start page, staff's
// start page, sign-in for a visitor). The words never say whether another address exists.
import StatusScreen from "@/components/portal/StatusScreen";

export default function PortalNotFound() {
  return <StatusScreen kind="not-found" eyebrow="Not found" title="There is no page at this address" line="Check the address, or go back to the start and find the page from there." action={{ label: "Go to the start", href: "/" }} />;
}
