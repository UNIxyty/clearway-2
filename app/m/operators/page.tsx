"use client";

// Operators on a phone (Tier 2 › list that opens a detail): is an operator's Leon link up? A status pill on each row;
// the detail shows the last sync and offers pause / resume (wall.operators.edit) and a flight refresh
// (wall.flights.refresh). Adding, renaming and deleting operators stay on a desk.
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Chips, T2Detail, T2Groups, T2Page, type Tone } from "@/components/m/tier2";
import { useWallUser, userCan } from "@/lib/m/wall";
import { dayTime, getJson, useAction, useResource, wallUrl } from "@/lib/m/t2";

type Operator = { id: string; oprId: string; name: string; isActive: boolean; hasRefreshToken?: boolean; lastSyncAt?: string | null; lastSyncStatus?: "idle" | "success" | "error" | null; lastSyncError?: string | null; createdAt?: string; updatedAt?: string };
const statusOf = (o: Operator): { label: string; tone: Tone } => o.lastSyncStatus === "error" ? { label: "Sync failing", tone: "bad" } : !o.isActive ? { label: "Paused", tone: "neutral" } : o.lastSyncStatus === "success" ? { label: "Connected", tone: "ok" } : { label: "Waiting", tone: "warn" };

export default function OperatorsPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openId = search.get("id");
  const r = useResource<{ operators?: Operator[] }>(wallUrl("/operators?includeInactive=true"), { poll: 30_000, fallback: "The wall did not answer." });
  const user = useWallUser();
  const act = useAction("The wall did not accept that. Try again.");
  const [filter, setFilter] = useState<"all" | "connected" | "issues">("all");
  const ops = useMemo(() => (r.data?.operators ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [r.data]);
  const picked = openId ? ops.find((o) => o.id === openId) : null;
  usePhonePage({ title: picked ? picked.name : "Operators", subtitle: picked ? picked.oprId : ops.length ? `${ops.filter((o) => statusOf(o).tone === "ok").length} of ${ops.length} connected` : null, mono: false, back: picked ? () => router.replace("/m/operators") : null, tab: "more", tabs: !picked });
  const issues = ops.filter((o) => statusOf(o).tone !== "ok");
  const shown = filter === "all" ? ops : filter === "connected" ? ops.filter((o) => statusOf(o).tone === "ok") : issues;
  const canEdit = userCan(user ?? null, "wall.operators.edit"), canRefresh = userCan(user ?? null, "wall.flights.refresh");
  const setActive = (o: Operator, isActive: boolean) => act.run("active", async () => { await getJson(wallUrl(`/operators/${encodeURIComponent(o.id)}`), { method: "PATCH", json: { isActive } }); await r.reload(); });
  const refresh = () => act.run("refresh", async () => { await getJson(wallUrl("/timeline/refresh"), { method: "POST", json: {} }); await r.reload(); });

  if (picked) { const st = statusOf(picked); return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      {act.failed && <MError title="Not done." icon="building-2" onRetry={act.clear}>{act.failed}</MError>}
      <T2Detail title={picked.name} rows={[{ k: "Code", v: picked.oprId, mono: true }, { k: "Leon", v: `${st.label}${picked.lastSyncError ? ` · ${picked.lastSyncError}` : ""}` }, { k: "Last sync", v: dayTime(picked.lastSyncAt), mono: true }, { k: "Token", v: picked.hasRefreshToken ? "Held" : "Missing — set it on a desk" }, { k: "Since", v: dayTime(picked.createdAt), mono: true }]}
        actions={[...(canRefresh ? [{ label: "Fetch flights again", onClick: () => void refresh(), busy: act.busy === "refresh", disabled: act.busy !== null }] : []), ...(canEdit ? [picked.isActive ? { label: "Pause the Leon sync", kind: "danger" as const, onClick: () => void setActive(picked, false), busy: act.busy === "active", disabled: act.busy !== null } : { label: "Resume the Leon sync", kind: "primary" as const, onClick: () => void setActive(picked, true), busy: act.busy === "active", disabled: act.busy !== null }] : [])]} />
      <span className="px-0.5 text-[13px] leading-normal text-cw-text-muted">Pausing stops reading this operator’s flights from Leon; the wall keeps what it has. Adding, renaming and removing operators happen on a desk.</span>
    </div>
  ); }
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={ops.length === 0} emptyCopy={["No operators yet", "Add operators on a wider screen."]} errorCopy={["Couldn’t load operators", "Leon syncs are not affected."]} onRetry={r.reload}
      top={<T2Chips value={filter} onChange={setFilter} chips={[{ k: "all", label: "All", n: ops.length }, { k: "connected", label: "Connected", n: ops.length - issues.length }, { k: "issues", label: "Issues", n: issues.length }]} />}>
      <T2Groups groups={[{ h: "OPERATORS", rows: shown.map((o) => { const st = statusOf(o); return { key: o.id, title: o.name, sub: `${o.oprId}${o.lastSyncAt ? ` · synced ${dayTime(o.lastSyncAt)}` : ""}`, badge: [st.label, st.tone], href: `/m/operators?id=${encodeURIComponent(o.id)}` }; }) }]} />
    </T2Page>
  );
}
