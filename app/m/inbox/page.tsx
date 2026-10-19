"use client";

// The developer's inbox on a phone (Tier 2 › list grouped by status): reply to a thread. Waiting on you first; a row
// opens the thread page with a reply box and the status switch. Developers only (the server gates /api/help/inbox).
import { useMemo } from "react";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Groups, T2Page } from "@/components/m/tier2";
import type { HelpThread } from "@/lib/help/shared";
import { STATUS, TYPE } from "@/lib/m/help";
import { ago, useResource } from "@/lib/m/t2";

export default function InboxPhonePage() {
  const r = useResource<{ threads?: HelpThread[] }>("/api/help/inbox", { poll: 30_000, fallback: "The portal did not answer." });
  const threads = useMemo(() => (r.data?.threads ?? []).slice().sort((a, b) => (b.lastMessageAt ?? b.createdAt ?? "").localeCompare(a.lastMessageAt ?? a.createdAt ?? "")), [r.data]);
  const waiting = threads.filter((t) => t.status === "untouched"), open = threads.filter((t) => t.status === "under_process"), done = threads.filter((t) => t.status === "done" || t.status === "impossible");
  usePhonePage({ title: "Inbox", subtitle: threads.length ? `${waiting.length} waiting on you` : null, tab: "more" });
  if (r.status === 403 || r.status === 401) return <MError title="The inbox is the developer’s" icon="inbox">Your own questions are under Help & support.</MError>;
  const row = (t: HelpThread) => ({ key: t.id, title: t.title, sub: `${t.userName || t.userEmail || "—"} · ${TYPE[t.type] ?? t.type} · ${t.reference}`, meta: ago(t.lastMessageAt ?? t.createdAt), badge: t.type === "urgent" && t.status === "untouched" ? ["Urgent", "bad"] as const : [STATUS[t.status]?.label ?? t.status, STATUS[t.status]?.tone ?? "neutral"] as const, href: `/m/help/${encodeURIComponent(t.reference)}` });
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={threads.length === 0} emptyCopy={["Inbox is clear", "New threads from Help & support appear here."]} errorCopy={["Couldn’t load threads", "Try again in a moment."]} onRetry={r.reload}>
      <T2Groups groups={[{ h: "WAITING ON YOU", count: waiting.length, tone: waiting.length ? "warning" : undefined, rows: waiting.map(row) }, { h: "BEING LOOKED AT", count: open.length, rows: open.map(row) }, { h: "DONE", count: done.length, rows: done.slice(0, 20).map(row) }]} />
    </T2Page>
  );
}
