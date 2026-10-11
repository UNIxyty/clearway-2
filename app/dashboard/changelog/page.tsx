"use client";

// Dashboard → Full changelog: the whole feed behind the dashboard's Changelog block (the latest 60 entries the
// changelog API assembles). Ordinary users see their own edits and what happened to their reports and emails;
// admins see everyone's, and the page says so.

import { useState } from "react";
import PortalShell from "@/components/portal/Shell";
import { Card, EmptyState, ErrorState, Segmented, SkeletonRows } from "@/components/kit";
import { ChangeRow, type ChangeEntry } from "@/components/portal/dashboard/blocks";
import { usePoll } from "@/components/portal/dashboard/shared";

type Filter = "all" | "edits" | "errors";

export default function ChangelogPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, loading, error, refresh } = usePoll<{ entries?: ChangeEntry[]; scope?: "mine" | "everyone" }>(`/api/dashboard/changelog?filter=${filter}`, 60_000);
  const entries = data?.entries ?? [];
  const everyone = data?.scope === "everyone";
  return (
    <PortalShell title="Changelog" crumb="/dashboard/changelog"
      subtitle={everyone ? "Everyone's edits and errors across every service — only admins see this. The latest 60." : "Your own edits, and what happened to your reports and emails. The latest 60."}>
      <div style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        <Card title={everyone ? "Everyone" : "Yours"} icon="scroll-text" padded={false}
          actions={<Segmented size="sm" label="Show" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "edits", label: "Edits" }, { value: "errors", label: "Errors" }]} />}>
          {loading && !data ? <SkeletonRows rows={6} avatar={false} label="Loading the changelog" />
            : error && !data ? <ErrorState title="Couldn't load the changelog" detail={error} onRetry={() => void refresh()} />
            : entries.length === 0 ? (
              <EmptyState icon="scroll-text" title={filter === "errors" ? "No errors logged" : "Nothing logged yet"}>
                {filter === "errors" ? "No failures from email delivery, debug runs or wall webhooks." : "Edits to airports, reports and settings appear here as they happen."}
              </EmptyState>
            ) : <ul className="m-0 list-none p-0">{entries.map((e, i) => <ChangeRow key={`${e.at}-${i}`} e={e} />)}</ul>}
        </Card>
      </div>
    </PortalShell>
  );
}
