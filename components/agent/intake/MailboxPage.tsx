"use client";

// Agent mailbox (agent-design-spec-mailbox.md §M1–§M18): every email to and from the agent's addresses and
// what the agent did with it. Restricted (§M3). Needs attention is the default view (§M4.2). The body is
// untrusted and sandboxed (§M8). Personal data only through the reveal call (§M14).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PortalShell, { useIdentity } from "@/components/portal/Shell";
import AgentStyles from "../ui/AgentStyles";
import { C, TONE, TYPE, mono } from "../ui/tokens";
import { Button, Icon, Keycap, dayTimeZ } from "../ui/primitives";
import { IntakeStyles, Segmented, Select, TabList, useHotkeys } from "./controls";
import { ApiError, mailboxApi, type MailMessage, type MailOverview, type MailRow } from "./api";
import { EmptyState, LinkAsButton, rangeWords } from "./mailbox-shared";
import { GapMarker, ListSkeleton, MailListRow, NewChip } from "./mailbox-list";
import { ReceivedReader, type ThreadItem } from "./mailbox-reader";
import { SentReader } from "./mailbox-sent";

type Box = "received" | "sent";
type Access = { allowed: boolean; readersCount: number | null };
const VIEW_KEY = "cw.mailbox.view";
const RECEIVED_VIEWS = ["needs", "all", "processed", "replies", "ignored"] as const;
const SENT_VIEWS = ["all", "needs"] as const;
const DEFAULT_VIEW: Record<Box, string> = { received: "needs", sent: "all" };
const SEARCH_PLACEHOLDER = "Search sender, subject, body, reference, registration, callsign, route";

function readStoredViews(): Record<Box, string> {
  try { const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? "null"); if (v && typeof v === "object") return { received: RECEIVED_VIEWS.includes(v.received) ? v.received : "needs", sent: SENT_VIEWS.includes(v.sent) ? v.sent : "all" }; } catch { /* storage unavailable */ }
  return { ...DEFAULT_VIEW };
}
function storeViews(v: Record<Box, string>) { try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } }

const RECEIVED_STATUS = [{ value: "", label: "Any" }, { value: "processed", label: "Processed" }, { value: "not_recognised", label: "Not recognised" }, { value: "failed", label: "Failed" }, { value: "reply", label: "Reply" }, { value: "ignored", label: "Ignored" }, { value: "waiting", label: "Waiting" }];
const SENT_STATUS = [{ value: "", label: "Any" }, { value: "delivered", label: "Delivered" }, { value: "delivery_delayed", label: "Delayed" }, { value: "bounced", label: "Bounced" }, { value: "complained", label: "Marked as spam" }, { value: "queued", label: "Queued" }, { value: "captured", label: "Captured, not sent" }, { value: "failed", label: "Failed" }];
const RANGES = [{ value: "1", label: "Today" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }];
const ATTS = [{ value: "any", label: "Any" }, { value: "with", label: "With attachments" }, { value: "without", label: "Without attachments" }];

export default function MailboxPage() {
  const { display } = useIdentity();
  const [access, setAccess] = useState<Access | null>(null);
  const [accessErr, setAccessErr] = useState<string | null>(null);
  const [overview, setOverview] = useState<MailOverview | null>(null);
  const [box, setBox] = useState<Box>("received");
  const [views, setViews] = useState<Record<Box, string>>(DEFAULT_VIEW);
  const view = views[box];
  const [qInput, setQInput] = useState(""); const [q, setQ] = useState("");
  const [days, setDays] = useState(7);
  const [address, setAddress] = useState(""); const [status, setStatus] = useState(""); const [att, setAtt] = useState("any");
  const [rows, setRows] = useState<MailRow[] | null>(null);
  const [personalQuery, setPersonalQuery] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);
  const [pending, setPending] = useState<MailRow[] | null>(null);
  const [flash, setFlash] = useState<{ fresh: Set<string>; changed: Set<string> }>({ fresh: new Set(), changed: new Set() });
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<MailMessage | null>(null);
  const [msgErr, setMsgErr] = useState<string | null>(null);
  const [plain, setPlain] = useState(false); const [rawOpen, setRawOpen] = useState(false);
  const rowsRef = useRef<MailRow[] | null>(null); rowsRef.current = rows;
  const listRef = useRef<HTMLDivElement>(null); const readerRef = useRef<HTMLDivElement>(null); const searchRef = useRef<HTMLInputElement>(null);
  const rowEls = useRef(new Map<string, HTMLDivElement>());
  const reqNo = useRef(0); const gAt = useRef(0); const deepDone = useRef(false);
  const allowed = access?.allowed === true;

  // ── access, stored view, overview ─────────────────────────────────────────────────────────────────────
  useEffect(() => { setViews(readStoredViews()); }, []);
  useEffect(() => {
    mailboxApi.access().then((a) => setAccess({ allowed: a.allowed, readersCount: a.readersCount }))
      .catch((e) => { if (e instanceof ApiError && e.status === 403) setAccess({ allowed: false, readersCount: null }); else setAccessErr(e instanceof ApiError ? e.message : "The agent did not answer."); });
  }, []);
  const loadOverview = useCallback(() => mailboxApi.overview(days).then(setOverview).catch(() => {}), [days]);
  useEffect(() => { if (!allowed) return; void loadOverview(); const t = setInterval(() => void loadOverview(), 30_000); return () => clearInterval(t); }, [allowed, loadOverview]);

  // ── list ──────────────────────────────────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent: boolean) => {
    const n = ++reqNo.current;
    if (!silent) { setRows(null); setPending(null); setListErr(null); }
    try {
      const r = await mailboxApi.list({ box, view, q: q.trim() || undefined, days, address: address || undefined });
      if (n !== reqNo.current) return;
      setPersonalQuery(r.personalQuery); setListErr(null);
      const cur = rowsRef.current;
      if (!silent || !cur) { setRows(r.rows); return; }
      const before = new Map(cur.map((x) => [x.id, x]));
      const fresh = r.rows.filter((x) => !before.has(x.id)).map((x) => x.id);
      const changed = r.rows.filter((x) => { const o = before.get(x.id); return o && (o.status !== x.status || o.delivery !== x.delivery || o.what !== x.what); }).map((x) => x.id);
      const atTop = (listRef.current?.scrollTop ?? 0) <= 4;
      if (atTop || fresh.length === 0) { setRows(r.rows); setPending(null); setFlash({ fresh: new Set(fresh), changed: new Set(changed) }); }
      else { const next = new Map(r.rows.map((x) => [x.id, x])); setRows(cur.map((x) => next.get(x.id) ?? x)); setPending(r.rows); setFlash({ fresh: new Set(), changed: new Set(changed) }); }
    } catch (e) { if (n === reqNo.current && !silent) { setRows([]); setListErr(e instanceof ApiError ? e.message : "The agent did not answer."); } }
  }, [box, view, q, days, address]);
  useEffect(() => { if (allowed) void load(false); }, [allowed, load]);
  useEffect(() => { if (!allowed) return; const t = setInterval(() => void load(true), 20_000); return () => clearInterval(t); }, [allowed, load]);
  useEffect(() => { if (!flash.fresh.size && !flash.changed.size) return; const t = setTimeout(() => setFlash({ fresh: new Set(), changed: new Set() }), 1400); return () => clearTimeout(t); }, [flash]);
  useEffect(() => { const t = setTimeout(() => setQ(qInput), 300); return () => clearTimeout(t); }, [qInput]);
  const showPending = () => { if (pending) { const old = new Set((rows ?? []).map((x) => x.id)); setFlash({ fresh: new Set(pending.filter((x) => !old.has(x.id)).map((x) => x.id)), changed: new Set() }); setRows(pending); setPending(null); } listRef.current?.scrollTo({ top: 0 }); };

  const shown = useMemo(() => (rows ?? []).filter((r) => {
    if (status) { if (box === "sent") { const d = r.delivery ?? "queued"; if (status === "queued" ? !(d === "queued" || d === "sent") : d !== status) return false; } else if (r.status !== status) return false; }
    if (att === "with" && !r.attachments) return false; if (att === "without" && r.attachments) return false;
    return true;
  }), [rows, status, att, box]);

  // ── selection + deep link ─────────────────────────────────────────────────────────────────────────────
  const select = useCallback((id: string | null) => {
    setSel(id); setPlain(false); setRawOpen(false);
    try { const u = new URL(window.location.href); if (id) u.searchParams.set("m", id); else u.searchParams.delete("m"); window.history.replaceState(window.history.state, "", u.toString()); } catch { /* ignore */ }
  }, []);
  const loadMsg = useCallback(async (id: string, silent: boolean) => {
    if (!silent) { setMsg(null); setMsgErr(null); }
    try { const r = await mailboxApi.message(id); setMsg((cur) => (id === sel || !cur || cur.id === id || !silent ? r.message : cur)); }
    catch (e) { if (!silent) setMsgErr(e instanceof ApiError ? e.message : "The agent did not answer."); }
  }, [sel]);
  useEffect(() => { if (sel) void loadMsg(sel, false); else { setMsg(null); setMsgErr(null); } }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  // A selected message whose row changed status (e.g. Waiting → Processed) is read again.
  useEffect(() => { if (sel && flash.changed.has(sel)) void loadMsg(sel, true); }, [flash, sel, loadMsg]);
  useEffect(() => {
    if (!allowed || deepDone.current) return; deepDone.current = true;
    const m = new URLSearchParams(window.location.search).get("m");
    if (!m || !/^[0-9a-f-]{36}$/i.test(m)) return;
    mailboxApi.message(m).then(({ message }) => { const b: Box = message.direction === "outbound" ? "sent" : "received"; setBox(b); setViews((v) => ({ ...v, [b]: "all" })); setSel(m); setMsg(message); }).catch(() => select(null));
  }, [allowed, select]);

  const setView = (v: string) => { setViews((cur) => { const next = { ...cur, [box]: v }; storeViews(next); return next; }); setStatus(""); };
  const switchBox = (b: Box, keep = false) => { if (b === box) return; setBox(b); setStatus(""); if (!keep) select(null); };
  const openThread = (t: ThreadItem) => { if (t.kind === "ev") return; switchBox(t.kind === "out" ? "sent" : "received", true); select(t.id); };
  const onChanged = (m?: MailMessage) => { if (m && m.id === sel) setMsg(m); else if (sel) void loadMsg(sel, true); void load(true); void loadOverview(); };

  // ── keyboard (§M17): / j k Enter g n / g a u p Esc — no single key processes, ignores, forwards or reveals ─
  const move = (d: number) => {
    if (!shown.length) return;
    const i = shown.findIndex((r) => r.id === sel);
    const next = shown[Math.max(0, Math.min(shown.length - 1, i < 0 ? (d > 0 ? 0 : shown.length - 1) : i + d))];
    if (next && next.id !== sel) { select(next.id); rowEls.current.get(next.id)?.scrollIntoView({ block: "nearest" }); (rowEls.current.get(next.id)?.querySelector("button.mb-rowbtn") as HTMLButtonElement | null)?.focus({ preventScroll: true }); }
  };
  useHotkeys({
    "/": (e) => { e.preventDefault(); searchRef.current?.focus(); },
    j: () => move(1), k: () => move(-1),
    // Enter on a row (or with nothing focused) moves focus to the reader; the row's own click still selects it.
    Enter: (e) => {
      const t = e.target as HTMLElement;
      const onRow = t.classList?.contains("mb-rowbtn");
      if (!(t === document.body || onRow) || (!sel && !onRow)) return;
      const rowId = onRow ? t.closest("[data-row-id]")?.getAttribute("data-row-id") ?? null : null;
      e.preventDefault(); if (rowId && rowId !== sel) select(rowId);
      setTimeout(() => readerRef.current?.focus(), 0);
    },
    g: () => { gAt.current = Date.now(); },
    n: () => { if (Date.now() - gAt.current < 1200) { gAt.current = 0; setView("needs"); } },
    a: () => { if (Date.now() - gAt.current < 1200) { gAt.current = 0; setView("all"); } },
    u: () => { if (msg && msg.direction === "inbound") setRawOpen((v) => !v); },
    p: () => { if (msg && msg.direction === "inbound") setPlain((v) => !v); },
    Escape: () => { if (document.activeElement === searchRef.current || qInput) { setQInput(""); setQ(""); searchRef.current?.blur(); } },
  }, allowed);

  // ── render ────────────────────────────────────────────────────────────────────────────────────────────
  if (accessErr) return <Frame><div style={{ padding: 28 }}><div role="alert" style={{ fontSize: 14, color: C.danger }}>{accessErr}</div></div></Frame>;
  if (!access) return <Frame><div style={{ padding: 28, fontSize: 13, color: C.faint }}>Checking access…</div></Frame>;
  if (!access.allowed) return <Frame><NoAccess readers={access.readersCount} /></Frame>;

  const addrs = overview?.health.addresses ?? [];
  const down = addrs.filter((a) => !a.ok);
  const counts = overview?.counts;
  const backlogN = Math.max(overview?.queue ?? 0, counts?.waiting ?? 0);
  const filtersOn = !!(address || status || att !== "any" || days !== 7);
  const clearFilters = () => { setAddress(""); setStatus(""); setAtt("any"); setDays(7); };
  const clearSearch = () => { setQInput(""); setQ(""); };
  const filterWords = [address && `Address ${address}`, status && `Status ${(box === "sent" ? SENT_STATUS : RECEIVED_STATUS).find((s) => s.value === status)?.label}`, att !== "any" && ATTS.find((x) => x.value === att)?.label].filter(Boolean).join(" · ");

  let empty: React.ReactNode = null;
  if (rows && shown.length === 0 && !listErr) {
    if (personalQuery) empty = <EmptyState icon="shield" heading={`No results for "${q}"`} action={<Button size="xs" variant="secondary" onClick={clearSearch}>Clear search</Button>}>Personal data isn&apos;t searchable. Passport numbers, dates of birth and nationalities are left out of the search index on purpose. Search by reference, registration, sender or route instead.</EmptyState>;
    else if (q) empty = <EmptyState icon="search" heading={`No results for "${q}"`} action={<Button size="xs" variant="secondary" onClick={clearSearch}>Clear search</Button>}>Nothing in {rangeWords(days)} matches. Search covers sender, subject, body, reference, registration, callsign and route.</EmptyState>;
    else if (box === "received" && down.length && (view === "needs" || view === "all")) empty = <EmptyState icon="mail-x" tone="red" heading="Nothing here, but this list is not complete" action={view !== "all" ? <Button size="xs" variant="secondary" onClick={() => setView("all")}>Show all received</Button> : undefined}>{down.map((d) => d.address).join(", ")} {down.length === 1 ? "is" : "are"} not connected{down[0].why ? ` (${down[0].why})` : ""}. Anything sent there has not arrived, so an empty list does not mean nothing needs attention. It fills in when the connection is back.</EmptyState>;
    else if (filtersOn && (status || att !== "any" || address)) empty = <EmptyState icon="filter-x" heading="No messages match these filters" action={<Button size="xs" variant="secondary" onClick={clearFilters}>Clear filters</Button>}>{filterWords || "These filters"} · {rangeWords(days)}. Widen the date range or clear the filters.</EmptyState>;
    else if (box === "received" && view === "needs") empty = <EmptyState icon="circle-check" heading="Nothing needs attention" action={<Button size="xs" variant="secondary" onClick={() => setView("all")}>Show all</Button>}>Every email in {rangeWords(days)} was processed, answered or ignored for a reason. Switch to All to see them.</EmptyState>;
    else if (box === "received" && view === "all") empty = <EmptyState icon="inbox" heading={counts?.received === 0 && days >= 30 ? "No mail has arrived yet" : `No mail in ${rangeWords(days)}`}>{addrs.length ? `${addrs.map((a) => a.address).join(", ")} ${addrs.length === 1 ? "is" : "are"} connected. ` : ""}The first email will appear here within a minute of arriving.{days < 30 ? " Older mail: widen the Received range." : ""}</EmptyState>;
    else if (box === "received" && view === "replies") empty = <EmptyState icon="reply" heading={`No replies in ${rangeWords(days)}`}>Replies to the agent&apos;s questions land here: answers to a “Process?” email, and anything else sent back to the intake address.</EmptyState>;
    else if (box === "received") empty = <EmptyState icon="inbox" heading={`Nothing ${view === "processed" ? "processed" : "ignored"} in ${rangeWords(days)}`}>Switch to All to see every email in this range.</EmptyState>;
    else if (view === "needs") empty = <EmptyState icon="circle-check" heading="Every sent email arrived">No bounces, delays or spam reports in {rangeWords(days)}.</EmptyState>;
    else empty = <EmptyState icon="send" heading={`Nothing sent in ${rangeWords(days)}`}>Emails the agent sends (review requests, notifications, forwards) appear here.</EmptyState>;
  }
  const footer = rows === null ? "Loading messages…" : box === "received" && view === "needs" ? `${shown.length} need${shown.length === 1 ? "s" : ""} attention in ${rangeWords(days)} · newest first` : `Showing ${shown.length} in ${rangeWords(days)}${rows.length >= 500 ? " · the newest 500; narrow the range or search for older" : ""}`;
  const receivedViews = [
    { value: "needs", label: "Needs attention", count: counts?.needs, countTone: (counts?.needs ?? 0) > 0 ? ("red" as const) : undefined },
    { value: "all", label: "All" }, { value: "processed", label: "Processed" }, { value: "replies", label: "Replies" }, { value: "ignored", label: "Ignored" },
  ];
  const sentViews = [{ value: "all", label: "All" }, { value: "needs", label: "Needs attention", count: counts?.sentNeeds, countTone: (counts?.sentNeeds ?? 0) > 0 ? ("red" as const) : undefined }];

  return (
    <Frame>
      <div style={{ height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, padding: "24px 28px 20px", minWidth: 0 }}>
        {/* Header (§M3) */}
        <header style={{ display: "flex", gap: 24, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: "1 1 460px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, ...TYPE.pageTitle, color: C.ink }}>Agent mailbox</h1>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.body, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 999, padding: "3px 10px" }}><Icon name="lock" size={12} color={C.muted} />Restricted · ops leads and intake admins</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: C.muted, maxWidth: 760 }}>Every email to and from the agent&apos;s addresses, and what the agent did with it. Not a mail client: nothing is written or replied to from here. All times UTC.</p>
          </div>
          <div aria-label="Connection health" role="group" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 520 }}>
            {!overview && <HealthPill tone="slate" label="Checking connections…" />}
            {addrs.map((a) => <HealthPill key={a.address} tone={a.ok ? "green" : "red"} addr={a.address} label={a.ok ? (a.lastAt ? `Connected · last mail ${dayTimeZ(a.lastAt)}` : "Connected · no mail yet") : `Not connected · ${a.why ?? "reason unknown"}`} />)}
            {overview && <HealthPill tone={!overview.health.resend.ok ? "red" : overview.mailMode === "capture" ? "slate" : overview.health.resend.delayed ? "amber" : "green"} addr="Resend" plainName label={!overview.health.resend.ok ? "Not answering" : overview.mailMode === "capture" ? "Test mode · captured, not sent" : overview.health.resend.delayed ? `Sending · ${overview.health.resend.delayed} delayed` : "Sending"} />}
          </div>
        </header>

        {/* Banners (§M15.3, §M15.4) */}
        {down.map((d) => <DownBanner key={d.address} addr={d} others={addrs.filter((a) => a.ok).map((a) => a.address)} />)}
        {backlogN > 10 && (
          <div role="status" className="cw-expand" style={{ display: "flex", gap: 12, alignItems: "flex-start", background: C.warnTint, border: `1px solid ${C.warnBorder}`, borderRadius: 12, padding: "12px 16px" }}>
            <Icon name="hourglass" size={18} color={TONE.amber.ic} style={{ marginTop: 2 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: TONE.amber.fg }}>{backlogN} emails are waiting to be processed.</span>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}>Mail is arriving normally. The agent is working through the queue. Requests in the queue are not on the intake page yet.</span>
            </div>
            <span style={{ ...mono({ fontSize: 12 }), color: TONE.amber.fg }}>queue {overview?.queue ?? 0} · waiting {counts?.waiting ?? 0}</span>
          </div>
        )}

        {/* Controls (§M3) */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <TabList underline label="Mailbox" value={box} onChange={(b) => switchBox(b)} tabs={[{ value: "received", label: "Received", count: counts?.received }, { value: "sent", label: "Sent", count: counts?.sent }]} />
          {box === "received"
            ? <Segmented label="View" value={view} onChange={setView} options={receivedViews} />
            : <Segmented label="View" value={view} onChange={setView} options={sentViews} />}
          <span style={{ flex: 1 }} />
          <label style={{ position: "relative", display: "inline-flex", alignItems: "center", width: 330, height: 34 }}>
            <Icon name="search" size={14} color={C.muted} style={{ position: "absolute", left: 10 }} />
            <input ref={searchRef} type="text" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={SEARCH_PLACEHOLDER} aria-label="Search mail" spellCheck={false} autoComplete="off" className="ag-focus"
              onKeyDown={(e) => { if (e.key === "Enter") setQ(qInput); }}
              style={{ width: "100%", height: 34, boxSizing: "border-box", borderRadius: 9, border: `1px solid ${qInput ? C.citeOutline : C.borderControl}`, background: qInput ? C.suggestHover : C.surface, padding: "0 34px 0 30px", fontFamily: "inherit", fontSize: 12.5, color: C.ink, outline: "none" }} />
            <span style={{ position: "absolute", right: 8, pointerEvents: "none" }}><Keycap standalone>/</Keycap></span>
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Select prefix="Address" aria-label="Address" value={address} onChange={setAddress} active={!!address} options={[{ value: "", label: addrs.length > 1 ? `All ${addrs.length}` : "All" }, ...addrs.map((a) => ({ value: a.address, label: a.address }))]} />
          <Select prefix="Status" aria-label="Status" value={status} onChange={setStatus} active={!!status} options={box === "sent" ? SENT_STATUS : RECEIVED_STATUS} />
          <Select prefix={box === "sent" ? "Sent" : "Received"} aria-label={box === "sent" ? "Sent range" : "Received range"} value={String(days)} onChange={(v) => setDays(Number(v))} active={days !== 7} options={RANGES} />
          <Select prefix="Attachments" aria-label="Attachments" value={att} onChange={setAtt} active={att !== "any"} options={ATTS} />
          {filtersOn && <button type="button" className="ag-focus" onClick={clearFilters} style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.primary, background: "none", border: "none", cursor: "pointer" }}>Clear filters</button>}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: C.muted }}>Last 7 days by default · older mail by date range</span>
        </div>

        {/* Panes (§M3): list 470 · reader */}
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "470px minmax(0,1fr)", gap: 14 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            <div ref={listRef} role="list" aria-label={box === "sent" ? "Sent mail" : "Received mail"} aria-busy={rows === null} style={{ flex: 1, minHeight: 0, overflowY: "auto", position: "relative" }}
              onScroll={(e) => { if (pending && e.currentTarget.scrollTop <= 4) showPending(); }}>
              {pending && <NewChip n={pending.filter((x) => !(rows ?? []).some((y) => y.id === x.id)).length} onShow={showPending} />}
              {box === "received" && down.map((d) => <GapMarker key={d.address} address={d.address} lastAt={d.lastAt} why={d.why} />)}
              {rows === null ? <ListSkeleton /> : listErr ? <div role="alert" style={{ padding: 18, fontSize: 13, color: C.danger }}>{listErr} <button type="button" className="ag-focus" onClick={() => void load(false)} style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: C.primary, background: "none", border: "none", cursor: "pointer" }}>Try again</button></div> : empty ?? shown.map((r) => (
                <div role="listitem" key={r.id}>
                  <MailListRow r={r} selected={r.id === sel} isNew={flash.fresh.has(r.id)} flash={flash.changed.has(r.id)} addresses={addrs.map((a) => a.address)} onSelect={() => select(r.id)}
                    setRef={(el) => { if (el) rowEls.current.set(r.id, el); else rowEls.current.delete(r.id); }} />
                </div>
              ))}
            </div>
            <div style={{ padding: "9px 14px", borderTop: `1px solid ${C.divider}`, fontSize: 12, color: C.faint, display: "flex", gap: 8 }}>
              <span style={{ flex: 1 }}>{footer}</span>
              {rows && shown.length > 1 && <span style={mono({ fontSize: 11.5 })}>j / k to move</span>}
            </div>
          </div>

          <div ref={readerRef} tabIndex={-1} aria-label="Reader" role="region" className="ag-focus" style={{ minHeight: 0, overflowY: "auto", outline: "none", paddingBottom: 12 }}>
            {!sel ? (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "48px 28px", textAlign: "center", fontSize: 13.5, color: C.faint }}>Choose a message to see what happened to it.</div>
            ) : msgErr ? (
              <div role="alert" style={{ background: C.surface, border: `1.5px dashed ${C.dangerBadge}`, borderRadius: 14, padding: "20px 22px", fontSize: 13.5, color: C.danger }}>{msgErr}</div>
            ) : !msg || msg.id !== sel ? (
              <div aria-busy="true" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px", display: "flex", flexDirection: "column", gap: 10 }}>
                {[55, 80, 70, 40].map((w, i) => <span key={i} style={{ height: i === 0 ? 16 : 10, width: `${w}%`, borderRadius: 5, background: C.hover }} />)}
              </div>
            ) : (
              <div key={msg.id} className="cw-fade">
                {msg.direction === "outbound"
                  ? <SentReader message={msg} onOpenThread={openThread} />
                  : <ReceivedReader message={msg} runAs={display || "you"} capture={overview?.mailMode === "capture"} plain={plain} setPlain={setPlain} rawOpen={rawOpen} setRawOpen={setRawOpen} onChanged={onChanged} onOpenThread={openThread} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell footer={false}>
      <AgentStyles />
      <IntakeStyles />
      <style>{`.mb-rowbtn:focus-visible { outline-offset: -2px; }`}</style>
      {children}
    </PortalShell>
  );
}

function HealthPill({ tone, label, addr, plainName }: { tone: "green" | "red" | "amber" | "slate"; label: string; addr?: string; plainName?: boolean }) {
  const t = TONE[tone]; const bad = tone === "red";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: bad ? t.fg : C.body, background: C.surface, border: `1px solid ${bad ? t.bd : C.borderControl}`, borderRadius: 999, padding: "4px 10px", maxWidth: 500 }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: t.ic, flex: "none" }} />
      {addr && <span style={plainName ? { fontWeight: 700 } : { ...mono({ fontSize: 11.5, fontWeight: 600 }) }}>{addr}</span>}
      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </span>
  );
}

function DownBanner({ addr, others }: { addr: MailOverview["health"]["addresses"][number]; others: string[] }) {
  return (
    <div role="alert" className="cw-expand" style={{ display: "flex", gap: 14, alignItems: "flex-start", background: C.dangerTint, border: `1.5px solid ${C.dangerBadge}`, borderRadius: 12, padding: "14px 16px" }}>
      <Icon name="mail-x" size={22} color={C.dangerBadge} style={{ marginTop: 1 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.danger }}>Nothing is arriving. The connection to {addr.address} is down{addr.why ? `: ${addr.why}` : ""}.</span>
        <span style={{ fontSize: 13, lineHeight: 1.55, color: C.body }}>This is not a quiet morning: the agent cannot receive mail on this address, so handling requests sent to it{addr.lastAt ? ` since ${dayTimeZ(addr.lastAt)}` : ""} are not here and have not been processed. Until it is fixed, check with senders by phone or another address.{others.length ? ` ${others.join(", ")} ${others.length === 1 ? "is" : "are"} working.` : ""}</span>
        <span style={{ ...mono({ fontSize: 12 }), color: C.body }}>{addr.lastAt ? `Last mail ${dayTimeZ(addr.lastAt)}` : "No mail on record"} · reason: {addr.why ?? "unknown"}</span>
      </div>
    </div>
  );
}

function NoAccess({ readers }: { readers: number | null }) {
  return (
    <div style={{ padding: "64px 28px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 520, maxWidth: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "26px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: C.sidebar, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="lock" size={20} color={C.muted} /></span>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: C.ink }}>You don&apos;t have access to the agent mailbox</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: C.body }}>It holds emails with passport numbers and dates of birth, so it is open only to ops leads and intake admins.{readers != null ? ` ${readers} ${readers === 1 ? "person has" : "people have"} access today.` : ""}</p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: C.body }}>If you are looking for a request, the Flight intake page shows every request the agent created, without the raw email.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <LinkAsButton href="/agent/intake" primary icon="arrow-right">Go to Flight intake</LinkAsButton>
          <span style={{ fontSize: 12.5, color: C.muted, alignSelf: "center" }}>Ask an admin for access.</span>
        </div>
      </div>
    </div>
  );
}
