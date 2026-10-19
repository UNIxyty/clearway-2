"use client";

// The agent's activity log on a phone (Tier 2 › list grouped by day): what did the agent do? Filter chips as on the
// desk (all · answers · changes · sent · denied); each row says who asked, what was done and how it ended. A plain
// user sees their own rows; admins see everyone's.
import { useMemo, useState } from "react";
import { usePhonePage } from "@/components/m/chrome";
import { T2Chips, T2Groups, T2Page, type Tone } from "@/components/m/tier2";
import { agentUrl, dayHeading, groupBy, hmZ, useResource } from "@/lib/m/t2";

type Row = { id: string; at: string; who?: string; from?: string; kind?: string; tool?: string; args?: string; result?: { text?: string; tone?: string }; confirmed?: { text?: string; tone?: string }; conversationId?: string | null };
const FILTERS = [{ k: "all", label: "All" }, { k: "answers", label: "Answers" }, { k: "changes", label: "Changes" }, { k: "sent", label: "Sent" }, { k: "denied", label: "Denied" }] as const;
type Filter = (typeof FILTERS)[number]["k"];
const toneOf = (t?: string): Tone => t === "danger" ? "bad" : t === "warn" ? "warn" : t === "ok" ? "ok" : "neutral";
const KIND_LABEL: Record<string, string> = { READ: "Read", WRITE: "Changed", SEND: "Sent", FILE: "File", ANSWER: "Answer", INSERT: "Added" };

export default function ActivityPhonePage() {
  const [filter, setFilter] = useState<Filter>("all");
  const r = useResource<{ rows?: Row[]; scope?: "mine" | "all" }>(agentUrl(`/activity?filter=${filter}&limit=60`), { fallback: "The agent did not answer." });
  const rows = useMemo(() => r.data?.rows ?? [], [r.data]);
  usePhonePage({ title: "Activity log", subtitle: r.data ? (r.data.scope === "all" ? "Everyone’s" : "Yours") : null, tab: "agent" });
  const groups = groupBy(rows, (x) => dayHeading(x.at)).map((g) => ({ h: g.h, rows: g.rows.map((x) => ({ key: x.id, title: `${KIND_LABEL[x.kind ?? ""] ?? x.kind ?? "Did"} · ${x.tool ?? ""}`.replace(/ · $/, ""), sub: [x.args, x.who ? `by ${x.who}` : null, x.confirmed?.text].filter(Boolean).join(" · "), meta: hmZ(x.at), badge: x.result?.text ? [x.result.text, toneOf(x.result.tone)] as const : undefined, href: x.conversationId ? `/m/agent?t=${encodeURIComponent(x.conversationId)}` : undefined })) }));
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={rows.length === 0} emptyCopy={[filter === "all" ? "Nothing yet" : "Nothing in that filter", "What the agent reads, changes and sends appears here, with who asked."]} errorCopy={["Couldn’t load the log", "Try again in a moment."]} onRetry={r.reload}
      top={<T2Chips value={filter} onChange={setFilter} chips={FILTERS.map((f) => ({ k: f.k, label: f.label }))} />}>
      <T2Groups groups={groups} />
      {rows.length >= 60 && <span className="px-0.5 text-[13px] text-cw-text-muted">The last 60. Older rows and the CSV export are on a desk.</span>}
    </T2Page>
  );
}
