"use client";

// The portal's error page (2026-11-11): what a person sees when a page throws. The shared status screen, with the one
// button trying the page again. The error itself goes to the console for the developers, never into the words.
import { useEffect } from "react";
import StatusScreen from "@/components/portal/StatusScreen";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[portal] page error", error?.digest ?? "", error); }, [error]);
  return <StatusScreen kind="error" tone="danger" eyebrow="Something went wrong" title="This page could not be shown" line="Something went wrong on our side. Try the page again; if it keeps failing, report it from Help & support." action={{ label: "Try again", onClick: () => reset() }} />;
}
