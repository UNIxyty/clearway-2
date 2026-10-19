"use client";

// The agent's mailbox on a phone (Tier 2 › list that opens a detail): see why an email failed. Mailbox readers only
// (mailboxApi.access). The received box, needs-you first; the detail says what the agent made of it and offers the
// same actions as the desk (intake.mailbox.act): ignore, process, reprocess. Bodies are revealed only on a desk.
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Chips, T2Detail, T2Groups, T2Page, type Tone } from "@/components/m/tier2";
import { mailboxApi, type MailRow } from "@/components/agent/intake/api";
import { dayTime, hmZ, useAction, useResource, agentUrl, dayHeading, groupBy } from "@/lib/m/t2";

const STATUS: Record<string, { label: string; tone: Tone }> = { waiting: { label: "Waiting", tone: "warn" }, processed: { label: "Processed", tone: "ok" }, not_recognised: { label: "Not recognised", tone: "neutral" }, failed: { label: "Failed", tone: "bad" }, reply: { label: "Reply", tone: "info" }, ignored: { label: "Ignored", tone: "neutral" }, sent: { label: "Sent", tone: "ok" } };
type View = "needs" | "all" | "sent";

export default function MailboxPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openId = search.get("id");
  const access = useResource<{ allowed?: boolean; readersCount?: number }>(agentUrl("/mailbox/access"));
  const [view, setView] = useState<View>("needs");
  const box = view === "sent" ? "sent" : "received";
  const r = useResource<{ rows?: MailRow[] }>(access.data?.allowed ? agentUrl(`/mailbox/messages?box=${box}&view=${view === "needs" ? "needs" : "all"}&days=7`) : null, { poll: 30_000, fallback: "The agent did not answer." });
  const act = useAction("The agent did not accept that. Try again.");
  const rows = useMemo(() => r.data?.rows ?? [], [r.data]);
  const picked = openId ? rows.find((m) => m.id === openId) : null;
  usePhonePage({ title: picked ? "Email" : "Mailbox", subtitle: picked ? (STATUS[picked.status]?.label ?? picked.status) : access.data?.allowed ? "Last 7 days" : null, back: picked ? () => router.replace("/m/mailbox") : null, tab: "agent", tabs: !picked });
  const doAct = (m: MailRow, verb: "ignore" | "unignore" | "reprocess" | "process-handling") => act.run(verb, async () => { await mailboxApi.action(m.id, verb); await r.reload(); router.replace("/m/mailbox"); });
  if (access.data && !access.data.allowed) return <MError title="The mailbox is for its readers" icon="mail">Ask an admin to add you as a mailbox reader. Everything else on the phone works.</MError>;

  if (picked) return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      {act.failed && <MError title="Not done." icon="mail" onRetry={act.clear}>{act.failed}</MError>}
      <T2Detail title={picked.subject || "(no subject)"} rows={[{ k: picked.direction === "outbound" ? "To" : "From", v: picked.direction === "outbound" ? (picked.to ?? []).join(", ") : picked.from, mono: true }, { k: "Received", v: dayTime(picked.at), mono: true }, { k: "What the agent made of it", v: picked.what || "—" }, ...(picked.ref ? [{ k: "Reference", v: picked.ref, mono: true }] : []), ...(picked.requestState ? [{ k: "Request", v: picked.requestState }] : []), ...(picked.attachments ? [{ k: "Attachments", v: String(picked.attachments) }] : []), ...(picked.delivery ? [{ k: "Delivery", v: picked.delivery }] : [])]}
        actions={[...(picked.requestId ? [{ label: "Open the request", href: `/m/intake/${encodeURIComponent(picked.requestId)}` }] : []), ...(picked.direction !== "outbound" ? [picked.status === "ignored" ? { label: "Un-ignore", onClick: () => void doAct(picked, "unignore"), busy: act.busy === "unignore", disabled: act.busy !== null } : { label: "Ignore", kind: "danger" as const, onClick: () => void doAct(picked, "ignore"), busy: act.busy === "ignore", disabled: act.busy !== null }, ...(picked.status === "not_recognised" || picked.status === "failed" ? [{ label: "Read it as a handling request", kind: "primary" as const, onClick: () => void doAct(picked, "process-handling"), busy: act.busy === "process-handling", disabled: act.busy !== null }, { label: "Read it again", onClick: () => void doAct(picked, "reprocess"), busy: act.busy === "reprocess", disabled: act.busy !== null }] : [])] : [])]} />
      <span className="px-0.5 text-[13px] leading-normal text-cw-text-muted">The email’s body and raw source are shown on a desk, where opening them is logged.</span>
    </div>
  );
  const groups = groupBy(rows, (m) => dayHeading(m.at)).map((g) => ({ h: g.h, rows: g.rows.map((m) => ({ key: m.id, title: m.subject || "(no subject)", sub: `${m.direction === "outbound" ? (m.to ?? []).join(", ") : m.from}${m.what ? ` · ${m.what}` : ""}`, meta: hmZ(m.at), badge: [STATUS[m.status]?.label ?? m.status, STATUS[m.status]?.tone ?? "neutral"] as const, href: `/m/mailbox?id=${encodeURIComponent(m.id)}` })) }));
  return (
    <T2Page loading={(access.loading && !access.data) || (r.loading && !r.data)} error={access.error ?? r.error} stale={Boolean(r.data)} empty={rows.length === 0} emptyCopy={[view === "needs" ? "Nothing needs you" : "Nothing here", view === "needs" ? "Every email this week was read." : "Emails from the last 7 days appear here."]} errorCopy={["Couldn’t load the mailbox", "Try again in a moment."]} onRetry={r.reload}
      top={<T2Chips value={view} onChange={setView} chips={[{ k: "needs", label: "Needs you" }, { k: "all", label: "Received" }, { k: "sent", label: "Sent" }]} />}>
      <T2Groups groups={groups} />
    </T2Page>
  );
}
