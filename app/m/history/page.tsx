"use client";

// Agent history on a phone (Tier 2 › list grouped by day): find an old conversation. Search on top; a row opens the
// thread in the phone's Ops Agent.
import { useMemo, useState } from "react";
import { usePhonePage } from "@/components/m/chrome";
import { T2Groups, T2Page, T2Search } from "@/components/m/tier2";
import type { ConversationSummary } from "@/components/agent/types";
import { agentUrl, dayHeading, groupBy, hmZ, useResource } from "@/lib/m/t2";

export default function HistoryPhonePage() {
  const [q, setQ] = useState("");
  const r = useResource<{ conversations?: ConversationSummary[]; total?: number }>(agentUrl(`/history?q=${encodeURIComponent(q.trim())}`), { fallback: "The agent did not answer." });
  const rows = useMemo(() => (r.data?.conversations ?? []).slice().sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")), [r.data]);
  usePhonePage({ title: "History", subtitle: r.data?.total ? `${r.data.total} conversations` : null, tab: "agent" });
  const groups = groupBy(rows, (c) => dayHeading(c.lastMessageAt)).map((g) => ({ h: g.h, rows: g.rows.map((c) => ({ key: c.id, title: c.title || "Untitled", sub: [c.context?.label ? `About ${c.context.label}` : null, c.snippet, c.changes ? `${c.changes} change${c.changes === 1 ? "" : "s"}` : null, c.sent ? `${c.sent} sent` : null, c.voice ? "voice" : null].filter(Boolean).join(" · "), meta: hmZ(c.lastMessageAt), href: `/m/agent?t=${encodeURIComponent(c.id)}` })) }));
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={rows.length === 0 && !q.trim()} emptyCopy={["No conversations yet", "Ask the agent anything; it will be here."]} errorCopy={["Couldn’t load history", "Try again in a moment."]} onRetry={r.reload}
      top={<T2Search value={q} onChange={setQ} placeholder="Search conversations" />}>
      {rows.length === 0 ? <span className="px-0.5 py-6 text-center text-[14.5px] text-cw-text-muted">Nothing matches “{q.trim()}”.</span> : <T2Groups groups={groups} />}
    </T2Page>
  );
}
