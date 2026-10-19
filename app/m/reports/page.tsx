"use client";

// Reports on a phone (Tier 2 › list): report a problem from where it happened. The wall console's reports with their
// status; New report is a full-screen form (wall.reports.create); the detail shows the text and who touched it last.
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MButton, MError } from "@/components/m/ui";
import { T2Chips, T2Detail, T2Groups, T2Page, type Tone } from "@/components/m/tier2";
import { useWallUser, userCan } from "@/lib/m/wall";
import { dayTime, getJson, useAction, useResource, wallUrl } from "@/lib/m/t2";

type Report = { id: string; category?: string; title: string; body?: string; status: string; createdBy?: string | null; createdAt?: string; updatedBy?: string | null; updatedAt?: string; sends?: Array<{ to?: string; at?: string }> };
const STATUS: Record<string, { label: string; tone: Tone }> = { untouched: { label: "Untouched", tone: "warn" }, under_process: { label: "Under process", tone: "info" }, done: { label: "Done", tone: "ok" }, impossible: { label: "Impossible", tone: "bad" } };

export default function ReportsPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openId = search.get("id"); const creating = search.get("new") === "1";
  const r = useResource<{ reports?: Report[]; categories?: string[] }>(wallUrl("/reports"), { fallback: "The wall did not answer." });
  const user = useWallUser();
  const act = useAction("The wall did not accept that. Try again.");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [draft, setDraft] = useState({ category: "", title: "", body: "" });
  const reports = useMemo(() => (r.data?.reports ?? []).slice().sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? "")), [r.data]);
  const picked = openId ? reports.find((x) => x.id === openId) : null;
  const canCreate = userCan(user ?? null, "wall.reports.create");
  usePhonePage({ title: creating ? "New report" : picked ? "Report" : "Reports", subtitle: picked ? (STATUS[picked.status]?.label ?? picked.status) : creating ? null : reports.length ? `${reports.filter((x) => x.status === "untouched" || x.status === "under_process").length} open` : null, back: picked || creating ? () => router.replace("/m/reports") : null, tab: "more", tabs: !picked && !creating });
  const categories = r.data?.categories?.length ? r.data.categories : ["Other"];
  const create = () => act.run("create", async () => { await getJson(wallUrl("/reports"), { json: { category: draft.category || categories[0], title: draft.title.trim(), body: draft.body.trim(), status: "untouched" } }); setDraft({ category: "", title: "", body: "" }); await r.reload(); router.replace("/m/reports"); });
  const open = reports.filter((x) => x.status === "untouched" || x.status === "under_process");
  const shown = filter === "open" ? open : reports;

  if (creating) return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-4">
        {act.failed && <MError title="Not sent." icon="flag" onRetry={act.clear}>{act.failed}</MError>}
        <label className="flex flex-col gap-1.5"><span className="text-[12.5px] font-semibold text-cw-text-muted">What it is about</span>
          <select value={draft.category || categories[0]} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className="h-12 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3.5 text-[16px] text-cw-text outline-none">{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="flex flex-col gap-1.5"><span className="text-[12.5px] font-semibold text-cw-text-muted">In one line</span>
          <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="What went wrong, where" className="h-12 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3.5 text-[16px] text-cw-text outline-none focus:border-cw-focus focus:shadow-[0_0_0_3px_var(--cw-focus-halo)]" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-[12.5px] font-semibold text-cw-text-muted">What happened</span>
          <textarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} rows={6} placeholder="What you did, what you expected, what you saw. The time and the flight help." className="rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3.5 py-3 text-[16px] leading-normal text-cw-text outline-none focus:border-cw-focus focus:shadow-[0_0_0_3px_var(--cw-focus-halo)]" /></label>
        <span className="text-[13px] text-cw-text-muted">Screenshots are attached on a desk. The report is signed with your name.</span>
      </div>
      <div className="sticky bottom-0 z-[5] border-t border-cw-border bg-cw-bg-page px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3"><MButton kind="primary" icon="send" className="w-full" disabled={!draft.title.trim() || act.busy !== null} onClick={() => void create()}>{act.busy ? "Sending…" : "Send the report"}</MButton></div>
    </div>
  );
  if (picked) return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <T2Detail title={picked.title} rows={[{ k: "Status", v: STATUS[picked.status]?.label ?? picked.status }, { k: "About", v: picked.category || "—" }, { k: "What happened", v: <span className="whitespace-pre-wrap">{picked.body || "—"}</span> }, { k: "Sent", v: `${picked.createdBy || "—"} · ${dayTime(picked.createdAt)}` }, ...(picked.updatedBy ? [{ k: "Last touched", v: `${picked.updatedBy} · ${dayTime(picked.updatedAt)}` }] : []), ...(picked.sends?.length ? [{ k: "Emailed", v: picked.sends.map((s) => `${s.to ?? "—"} · ${dayTime(s.at)}`).join("\n") }] : [])]} />
      <span className="px-0.5 text-[13px] leading-normal text-cw-text-muted">Changing the status, editing and emailing a report happen on a desk.</span>
    </div>
  );
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={reports.length === 0} emptyCopy={["No reports", "Something wrong? Report it from here, in your own words."]} errorCopy={["Couldn’t load reports", "Try again in a moment."]} onRetry={r.reload}
      top={<T2Chips value={filter} onChange={setFilter} chips={[{ k: "open", label: "Open", n: open.length }, { k: "all", label: "All", n: reports.length }]} />}
      sticky={canCreate ? <MButton kind="primary" icon="plus" href="/m/reports?new=1">New report</MButton> : undefined}>
      {shown.length === 0 ? <span className="px-0.5 py-6 text-center text-[14.5px] text-cw-text-muted">Nothing open.</span>
        : <T2Groups groups={[{ h: filter === "open" ? "OPEN" : "REPORTS", count: shown.length, rows: shown.map((x) => ({ key: x.id, title: x.title, sub: `${x.category ? `${x.category} · ` : ""}${x.createdBy || "—"} · ${dayTime(x.createdAt)}`, badge: [STATUS[x.status]?.label ?? x.status, STATUS[x.status]?.tone ?? "neutral"], href: `/m/reports?id=${encodeURIComponent(x.id)}` })) }]} />}
    </T2Page>
  );
}
