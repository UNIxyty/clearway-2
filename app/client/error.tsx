"use client";

// A client page that could not be made (2026-11-13): the sidebar and the header stay, and the page's place says so
// with one button that tries again. The parts of a page have their own, smaller message
// (components/client/PartBoundary.tsx); this one is for a page that failed as a whole, on the server or in the
// browser. The error goes to the console for the developers, never into the words.
import { useEffect } from "react";
import StatusScreen from "@/components/portal/StatusScreen";

export default function ClientPageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[client] page error", error?.digest ?? "", error); }, [error]);
  return <StatusScreen embedded kind="error" tone="danger" eyebrow="Something went wrong" title="This page could not be shown" line="Something went wrong on our side. Try the page again." action={{ label: "Try again", onClick: reset, attr: "data-try-again" }} />;
}
