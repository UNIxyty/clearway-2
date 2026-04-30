"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    <div className="p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Debug Raw Stream</h1>
          <p className="text-sm text-muted-foreground">Run: <span className="font-mono">{run || "(missing run id)"}</span></p>
        </div>
        <Button asChild variant="outline">
          <Link href={run ? `/admin/debug?run=${encodeURIComponent(run)}` : "/admin/debug"}>
            Back to Debug Runner
          </Link>
        </Button>
      </div>
      <pre className="rounded border bg-black p-3 text-xs text-green-300 min-h-[70vh] overflow-auto whitespace-pre-wrap">{content}</pre>
    </div>
  );
}

export default function AdminDebugRawPage() {
  return (
    <Suspense fallback={<div className="p-4 md:p-6 text-sm text-muted-foreground">Loading stream…</div>}>
      <AdminDebugRawPageClient />
    </Suspense>
  );
}
