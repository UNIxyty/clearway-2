"use client";

// Flight intake (agent-design-spec-intake.md §I3): every scheduled flight and handling request the Ops Agent
// read, newest first, with its Leon state per leg. One row expands at a time; rows update every 15 s and do not
// reorder while one is open. Search runs on the server. Keys: / search, j k rows, Enter open (§I15).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PortalShell, { useIdentity } from "@/components/portal/Shell";
import AgentStyles from "../ui/AgentStyles";
import { C, SHADOW, TONE, mono } from "../ui/tokens";
import { Icon, Keycap, Spinner, hmZ } from "../ui/primitives";
import { IntakeStyles, Select, TabList, Tooltip, TypeChip, useHotkeys } from "./controls";
import { intakeApi, type ListRow } from "./api";
import { CARD, COLHEAD, LegSquare, RowStatusPill, STATUS, ago, ddMon, errText } from "./intake-shared";
import { RequestDetailView } from "./intake-detail";

const GRID = "116px 106px 112px 124px minmax(0,1.2fr) 76px 84px minmax(0,1.3fr) 76px 16px";
type Tab = "all" | "needs" | "progress" | "loaded" | "closed";
type Overview = Awaited<ReturnType<typeof intakeApi.overview>>;
type Counts = { all: number; needs: number; progress: number; loaded: number; closed: number };
const POLL_MS = 15000;
// PortalShell heading props, spread in (the heading is not a tooltip; this page has no native title tooltips).
const SHELL = { crumb: "Ops Agent", title: "Flight intake", subtitle: "Scheduled flights from provider portals and handling requests from email, read by the Ops Agent and loaded into Leon after ops confirm. Newest first. All times UTC." };

export default function IntakePage() {
  const [tab, setTab] = useState<Tab>("all");
  const [type, setType] = useState<"" | "handling" | "scheduled">("");
  const [stage, setStage] = useState("");
  const [from, setFrom] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [flash, setFlash] = useState<Record<string, "red" | "blue">>({});
  const [now, setNow] = useState(() => Date.now());
  const [searchFocus, setSearchFocus] = useState(false);
  const openRef = useRef<string | null>(null); openRef.current = open;
  const rowsRef = useRef<ListRow[] | null>(null); rowsRef.current = rows;
  const search = useRef<HTMLInputElement>(null);
  const rowBtns = useRef(new Map<string, HTMLButtonElement>());
  const seq = useRef(0);
  const { display } = useIdentity();

  // Deep link ?r=<requestId>
  useEffect(() => { const r = new URLSearchParams(window.location.search).get("r"); if (r) setOpen(r); }, []);
  const setOpenUrl = useCallback((id: string | null) => {
    setOpen(id);
    try { const u = new URL(window.location.href); if (id) u.searchParams.set("r", id); else u.searchParams.delete("r"); window.history.replaceState(window.history.state, "", u.toString()); } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await intakeApi.list({ tab, q, type });
      if (my !== seq.current) return;
      const prev = rowsRef.current;
      // Flash rows whose status changed since the last poll (IN2).
      if (prev) {
        const was = new Map(prev.map((x) => [x.id, x.statusKey]));
        const fl: Record<string, "red" | "blue"> = {};
        for (const x of r.rows) if (was.has(x.id) && was.get(x.id) !== x.statusKey) fl[x.id] = x.needsAttention ? "red" : "blue";
        if (Object.keys(fl).length) { setFlash(fl); setTimeout(() => setFlash({}), 1300); }
      }
      let next = r.rows;
      // No reordering while a row is open: keep the old order, update in place, new rows go last.
      const o = openRef.current;
      if (o && prev && prev.some((x) => x.id === o)) {
        const byId = new Map(r.rows.map((x) => [x.id, x]));
        const kept = prev.map((x) => byId.get(x.id) ?? (x.id === o ? x : null)).filter(Boolean) as ListRow[];
        next = [...kept, ...r.rows.filter((x) => !prev.some((p) => p.id === x.id))];
      }
      setRows(next); setCounts(r.counts); setError(null);
    } catch (e) { if (my === seq.current) { setError(errText(e)); setRows((x) => x ?? []); } }
  }, [tab, q, type]);
  // While a request is being sent to Leon (or read), poll faster so the row's spinner clears as soon as Leon answers.
  const busy = (rows ?? []).some((x) => x.statusKey === "in_progress");
  useEffect(() => { void load(); const t = setInterval(() => void load(), busy ? 3000 : POLL_MS); return () => clearInterval(t); }, [load, busy]);
  useEffect(() => {
    const go = () => intakeApi.overview().then((o) => { setOverview(o); setOverviewError(false); }).catch(() => setOverviewError(true));
    void go(); const t = setInterval(go, 60000); return () => clearInterval(t);
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  // Search is server-side; a short pause after typing.
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 250); return () => clearTimeout(t); }, [qInput]);
  useEffect(() => { setRows(null); }, [tab, q, type]);

  const stageOf = (r: ListRow) => r.stage.split(" · ")[0];
  const stages = useMemo(() => [...new Set((rows ?? []).map(stageOf))].sort(), [rows]);
  const froms = useMemo(() => [...new Set((rows ?? []).map((r) => r.from).filter(Boolean))].sort(), [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) => (!stage || stageOf(r) === stage) && (!from || r.from === from)), [rows, stage, from]);

  const focusRow = (i: number) => { const r = shown[i]; if (!r) return; setCursor(i); const el = rowBtns.current.get(r.id); el?.focus(); el?.scrollIntoView({ block: "nearest" }); };
  useHotkeys({
    "/": (e) => { e.preventDefault(); search.current?.focus(); search.current?.select(); },
    j: (e) => { e.preventDefault(); focusRow(Math.min(shown.length - 1, cursor + 1)); },
    k: (e) => { e.preventDefault(); focusRow(Math.max(0, cursor - 1)); },
    Enter: (e) => {
      const a = document.activeElement;
      if (a && a !== document.body) return; // a focused row button handles Enter itself
      const r = shown[cursor]; if (!r) return; e.preventDefault(); setOpenUrl(open === r.id ? null : r.id);
    },
    Escape: (e) => { if (e.target === search.current) { search.current?.blur(); } },
  });

  const toggle = (id: string, i: number) => { setCursor(i); setOpenUrl(open === id ? null : id); };
  const openRow = open ? shown.find((r) => r.id === open) ?? null : null;
  const emptyFirstRun = rows !== null && !error && counts?.all === 0 && !q && !type;

  return (
    <PortalShell {...SHELL}
      headerRight={<Health overview={overview} failed={overviewError} />}>
      <AgentStyles />
      <IntakeStyles />
      <div style={{ padding: "28px 28px 48px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <TabList<Tab> label="Requests" value={tab} onChange={(t) => { setTab(t); setOpenUrl(null); setCursor(-1); }}
            tabs={[
              { value: "all", label: "All", count: counts?.all },
              { value: "needs", label: "Needs attention", count: counts?.needs, countTone: "red" },
              { value: "progress", label: "In progress", count: counts?.progress },
              { value: "loaded", label: "Loaded", count: counts?.loaded },
              { value: "closed", label: "Closed", count: counts?.closed },
            ]} />
          <Select<"" | "handling" | "scheduled"> prefix="Type" aria-label="Type" value={type} onChange={setType} active={!!type} compact={false}
            options={[{ value: "", label: "All" }, { value: "handling", label: "Handling" }, { value: "scheduled", label: "Scheduled", hint: "not collected yet" }]} />
          <Select<string> prefix="Stage" aria-label="Stage" value={stage} onChange={setStage} active={!!stage} compact={false}
            options={[{ value: "", label: "Any" }, ...stages.map((s) => ({ value: s, label: s }))]} />
          <Select<string> prefix="From" aria-label="From" value={from} onChange={setFrom} active={!!from} compact={false}
            options={[{ value: "", label: "All" }, ...froms.map((s) => ({ value: s, label: s }))]} />
          <div style={{ flex: 1 }} />
          <label style={{ width: 320, height: 36, display: "flex", alignItems: "center", gap: 8, border: `1px solid ${searchFocus ? C.primary : C.borderControl}`, boxShadow: searchFocus ? SHADOW.focus : "none", background: C.surface, borderRadius: 9, padding: "0 8px 0 11px", boxSizing: "border-box" }}>
            <Icon name="search" size={14} color={C.muted} />
            <input ref={search} type="text" value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label="Search reference, route, registration, date" placeholder="Search reference, route, registration, date" spellCheck={false} autoComplete="off" onFocus={() => setSearchFocus(true)} onBlur={() => setSearchFocus(false)}
              onKeyDown={(e) => { if (e.key === "Escape" && qInput) { e.preventDefault(); setQInput(""); } }}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13, color: C.ink }} />
            <Keycap standalone>/</Keycap>
          </label>
        </div>

        {error && <div role="alert" style={{ fontSize: 13, color: C.danger }}>Could not load the requests: {error}</div>}

        {rows === null ? <Skeleton /> : emptyFirstRun ? (
          <Empty icon="inbox" heading="No flight requests yet">Scheduled flights appear here when a provider emails ops@clearway.aero, and handling requests when a dispatcher does. Each shows up within a minute.</Empty>
        ) : shown.length === 0 && !open ? (
          q ? <Empty icon="search-x" heading={`No requests match "${q}"`}>Search looks at the reference, route, registration and date. Check the code, or clear the search to see every request.</Empty>
            : <Empty icon="filter-x" heading="No requests in this view">Nothing here matches the tab and filters. Choose All, or clear the filters, to see every request.</Empty>
        ) : (
          <div style={{ ...CARD, overflow: "hidden" }}>
            <div aria-hidden style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "11px 16px", background: C.page, borderBottom: `1px solid ${C.divider}`, ...COLHEAD, fontSize: 10.5 }}>
              <span>Status</span><span>Type</span><span>From</span><span>Reference</span><span>Route</span><span>Date</span><span>Legs</span><span>Stage</span><span>Updated</span><span />
            </div>
            {open && !openRow && (
              <div style={{ borderTop: `1px solid ${C.dividerRow}` }}>
                <div style={{ padding: "10px 16px", fontSize: 12.5, color: C.muted, display: "flex", gap: 8, alignItems: "center" }}><Icon name="link" size={13} color={C.muted} />This request is not in the current view (opened from a link, or filtered out).</div>
                <RequestDetailView key={open} id={open} updatedAt={null} onCollapse={() => setOpenUrl(null)} onChanged={() => void load()} runsAs={display} />
              </div>
            )}
            {shown.map((r, i) => {
              const s = STATUS[r.statusKey] ?? STATUS.in_progress; const isOpen = open === r.id;
              const stageColor = s.stage === "red" ? TONE.red.fg : s.stage === "amber" ? TONE.amber.fg : C.body;
              const legsLabel = `${r.legs.length} legs: ${r.legs.map((l, j) => `leg ${j + 1} ${l.state === "in" ? "In Leon" : l.state === "not" ? "NOT in Leon" : l.state === "unknown" ? "Unknown, checking" : l.state === "removed" ? "removed" : "Not sent"}`).join(", ")}`;
              return (
                <div key={r.id} style={{ borderTop: `1px solid ${C.dividerRow}` }}>
                  <button type="button" ref={(el) => { if (el) rowBtns.current.set(r.id, el); else rowBtns.current.delete(r.id); }}
                    aria-expanded={isOpen} aria-controls={isOpen ? `req-${r.id}` : undefined} onClick={() => toggle(r.id, i)} onFocus={() => setCursor(i)}
                    className={`ag-focus cw-row${flash[r.id] ? ` cw-flash-${flash[r.id]}` : ""}`}
                    style={{ width: "100%", display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "12px 16px", alignItems: "center", cursor: "pointer", border: "none", fontFamily: "inherit", textAlign: "left", color: C.ink, background: isOpen ? C.rowExpanded : C.surface, boxShadow: s.edge ? `inset 3px 0 0 ${s.edge}` : "none" }}>
                    <span style={{ justifySelf: "start" }}><RowStatusPill k={r.statusKey} label={r.statusLabel} /></span>
                    <span style={{ justifySelf: "start" }}><TypeChip type={r.type} /></span>
                    <span style={{ fontSize: 13, color: C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.from}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>{r.statusKey === "in_progress" && <Spinner color={C.primary} size={13} />}<span style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), wordBreak: "break-all" }}>{r.reference}</span></span>
                    <span style={{ ...mono({ fontSize: 12.5 }), color: C.ink, lineHeight: 1.5 }}>{r.route || "—"}</span>
                    <span style={{ ...mono({ fontSize: 12.5 }), color: C.body }}>{ddMon(r.firstStd) || "—"}</span>
                    <span role="img" aria-label={legsLabel} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ ...mono({ fontSize: 12.5 }), minWidth: 10 }}>{r.legs.length}</span>
                      <span style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{r.legs.map((l, j) => <LegSquare key={j} k={l.state} />)}</span>
                    </span>
                    <span style={{ fontSize: 13, lineHeight: 1.45, color: stageColor, fontWeight: s.stage ? 600 : 400 }}>{r.stage}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ ...mono({ fontSize: 12 }), color: C.body }}>{hmZ(r.updatedAt)}</span>
                      <span style={{ fontSize: 11.5, color: C.faint }}>{ago(r.updatedAt, now)}</span>
                    </span>
                    <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={C.faint} />
                  </button>
                  {isOpen && <div id={`req-${r.id}`}><RequestDetailView key={r.id} id={r.id} updatedAt={r.updatedAt} onCollapse={() => { setOpenUrl(null); rowBtns.current.get(r.id)?.focus(); }} onChanged={() => void load()} runsAs={display} /></div>}
                </div>
              );
            })}
            <div style={{ padding: "11px 16px", borderTop: `1px solid ${C.divider}`, display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: C.faint, flexWrap: "wrap" }}>
              <span style={{ flex: 1 }}>{shown.length} of {counts?.all ?? shown.length} requests · updates every 15 s{open ? " · order held while a request is open" : ""}</span>
              {[["/", "search"], ["j k", "move"], ["⏎", "open"], ["o", "original email"], ["[ ]", "legs"], ["Esc", "close"]].map(([k, l]) => (
                <span key={k} style={{ display: "flex", gap: 5, alignItems: "center" }}><Keycap standalone>{k}</Keycap>{l}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

function Health({ overview, failed }: { overview: Overview | null; failed: boolean }) {
  const h = overview?.health;
  const pill = (key: string, label: string, state: "ok" | "down" | "neutral" | "unknown", status: string, tip?: string) => {
    const dot = state === "ok" ? C.okDot : state === "down" ? C.dangerBadge : state === "neutral" ? TONE.slate.ic : C.disabled;
    const bd = state === "down" ? TONE.red.bd : C.border;
    const inner = (props?: Record<string, unknown>) => (
      <span {...props} tabIndex={tip ? 0 : undefined} className={tip ? "ag-focus" : undefined} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.body, background: C.surface, border: `1px solid ${bd}`, borderRadius: 999, padding: "5px 11px 5px 9px", whiteSpace: "nowrap" }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: state === "down" ? C.danger : C.muted }}>{status}</span>
      </span>
    );
    return tip ? <Tooltip key={key} label={tip} placement="bottom">{(tp) => inner(tp)}</Tooltip> : <span key={key}>{inner()}</span>;
  };
  if (!h) return <div style={{ display: "flex", gap: 8 }}>{failed ? pill("x", "Status", "unknown", "not available") : null}</div>;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {pill("mail", "Intake mailbox", h.mailbox.ok ? "ok" : "down", h.mailbox.ok ? "Reachable" : `Not responding${h.mailbox.lastAt ? ` since ${hmZ(h.mailbox.lastAt)}` : ""}`, h.mailbox.note ?? undefined)}
      {pill("leon", "Leon API", h.leon.ok ? "ok" : "down", h.leon.ok ? "Reachable" : "Not responding")}
      {pill("portals", "CNAIR portal", h.portals.lookup ? "ok" : "neutral", h.portals.lookup ? "Read after approval" : "Look-up off", h.portals.note)}
      {h.timezones && (!h.timezones.ok || h.timezones.behind) && pill("timezones", "Time zones", h.timezones.ok ? "neutral" : "down", h.timezones.ok ? `${h.timezones.version} · newer data published` : "Out of date · local times not converted", h.timezones.note)}
    </div>
  );
}

function Skeleton() {
  const w = ["62%", "80%", "48%", "70%", "55%", "74%"];
  return (
    <div aria-busy="true" aria-label="Loading requests" style={{ ...CARD, overflow: "hidden" }}>
      <div style={{ height: 38, background: C.page, borderBottom: `1px solid ${C.divider}` }} />
      {w.map((x, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: 16, borderTop: `1px solid ${C.dividerRow}`, alignItems: "center" }}>
          <span style={{ height: 20, borderRadius: 999, background: C.hover, width: 90 }} />
          {[70, 80, 90].map((p, j) => <span key={j} style={{ height: 10, borderRadius: 5, background: j % 2 ? C.hover : C.divider, width: `${p}%` }} />)}
          <span style={{ height: 10, borderRadius: 5, background: C.hover, width: x }} />
          <span style={{ height: 10, borderRadius: 5, background: C.divider, width: "70%" }} />
          <span style={{ height: 10, borderRadius: 5, background: C.hover, width: "60%" }} />
          <span style={{ height: 10, borderRadius: 5, background: C.divider, width: w[(i + 2) % 6] }} />
          <span style={{ height: 10, borderRadius: 5, background: C.hover, width: "70%" }} />
          <span />
        </div>
      ))}
      <div style={{ padding: "12px 16px", fontSize: 12.5, color: C.faint, borderTop: `1px solid ${C.dividerRow}` }}>Loading requests…</div>
    </div>
  );
}

function Empty({ icon, heading, children }: { icon: string; heading: string; children: React.ReactNode }) {
  return (
    <div style={{ ...CARD, padding: "64px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
      <Icon name={icon} size={24} color={C.faint} />
      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>{heading}</div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: C.muted, maxWidth: 540 }}>{children}</div>
    </div>
  );
}
