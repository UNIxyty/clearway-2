"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PortalShell, { type DeepContext } from "@/components/portal/Shell";

const DEBUG_DEEP_CONTEXT: DeepContext = {
  icon: "terminal",
  code: "Debug runner",
  sub: "admin tooling",
  backHref: "/",
  items: [
    { id: "dbg-run", label: "Run a check", icon: "play", href: "/admin/debug" },
    { id: "dbg-raw", label: "Raw stream", icon: "server", href: "/admin/debug/raw" },
    { id: "dbg-logs", label: "Email logs", icon: "inbox", href: "/admin/debug/email-logs" },
  ],
};

type StreamEvent = {
  at?: string;
  level?: string;
  message?: string;
  airport?: string;
};

function AdminDebugRawPageClient() {
  const params = useSearchParams();
  const run = params.get("run") || "";
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!run) return;
    const source = new EventSource(`/api/admin/debug/runs/${encodeURIComponent(run)}/stream`);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StreamEvent;
        const line = `${data.at || new Date().toISOString()} [${data.level || "info"}] ${data.airport ? `${data.airport} ` : ""}${data.message || ""}`;
        setLines((prev) => [...prev.slice(-1500), line]);
      } catch {}
    };
    return () => source.close();
  }, [run]);

  const content = useMemo(() => lines.join("\n"), [lines]);

  return (
    <PortalShell
      title="Debug Raw Stream"
      crumb="/admin/debug/raw"
      subtitle={`Run: ${run || "(missing run id)"}`}
      deepContext={DEBUG_DEEP_CONTEXT}
    >
      <div className="p-4 md:p-6">
        <pre className="rounded border bg-black p-3 text-xs text-green-300 min-h-[70vh] max-h-[70vh] overflow-auto whitespace-pre-wrap">{content}</pre>
      </div>
    </PortalShell>
  );
}

export default function AdminDebugRawPage() {
  return (
    <Suspense fallback={<div className="p-4 md:p-6 text-sm text-muted-foreground">Loading stream…</div>}>
      <AdminDebugRawPageClient />
    </Suspense>
  );
}
