"use client";

// AIP → Service status (portal redesign, stage 3 — "Page Service Status"): where AIP retrieval works, by country.
// A summary band (the donut, a legend that filters the table, the latest changes) above one full-width table.
// Same data and 10-second poll as before: GET /api/country-service-status. Read-only here; admins set the states in
// Admin → Service status editor. The table filters in the browser — the legend and the Status filter are one filter.
//
// What the page does not show, because no data carries it: a country code, a source (EAD / national), a region, or
// what a country's state was before it changed. "Recently changed" is the latest updates and the state each was set to.

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import { Badge, Callout, DataTable, FilterBar, FilteredStrip, Skeleton, TableCard, errorDetail, filterReasons, type Column, type Tone } from "@/components/kit";
import { COUNTRY_SERVICE_STATES, COUNTRY_SERVICE_STATE_META, type CountryServiceState } from "@/lib/country-service-status-shared";

type Row = { country: string; state: CountryServiceState; note?: string; updatedAt?: string | null; runningDebug?: boolean };

const TONE: Record<CountryServiceState, Tone> = { not_checked: "neutral", in_work: "orange", partially_works: "warning", operational: "success", issues: "danger" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "12 Sep" this year, "12 Sep 2025" before — UTC, like every date in the portal. */
function day(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}${sameYear ? "" : ` ${d.getUTCFullYear()}`}`;
}
const labelOf = (s: CountryServiceState) => (COUNTRY_SERVICE_STATE_META[s] ?? COUNTRY_SERVICE_STATE_META.not_checked).label;

const R = 70, C = 2 * Math.PI * R;
function Donut({ counts, total, ready }: { counts: Record<CountryServiceState, number>; total: number; ready: boolean }) {
  // The arcs grow from zero once the numbers are in (900ms, staggered); with reduced motion they are simply drawn.
  const [grown, setGrown] = useState(false);
  useEffect(() => { if (!ready) return; const t = window.setTimeout(() => setGrown(true), 120); return () => window.clearTimeout(t); }, [ready]);
  let acc = 0;
  return (
    <div className="relative h-[176px] w-[176px] flex-none">
      <svg viewBox="0 0 176 176" width="176" height="176" className="-rotate-90" aria-hidden>
        <circle cx="88" cy="88" r={R} fill="none" stroke="var(--cw-bg-active)" strokeWidth="22" />
        {COUNTRY_SERVICE_STATES.map((s, i) => {
          const len = ready && total ? (counts[s] / total) * C : 0; const off = -acc; acc += len;
          return <circle key={s} cx="88" cy="88" r={R} fill="none" stroke={COUNTRY_SERVICE_STATE_META[s].colour} strokeWidth="22" strokeDasharray={`${grown ? len : 0} ${C}`} strokeDashoffset={off}
            className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-[900ms] motion-safe:ease-[cubic-bezier(.2,.8,.2,1)]" style={{ transitionDelay: `${i * 80}ms` }} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {ready ? <><span className="font-mono text-[34px] font-semibold tracking-[-0.02em] text-cw-text">{total}</span><span className="text-[12.5px] text-cw-text-muted">countries</span></> : <Skeleton w={56} h={22} round={6} />}
      </div>
    </div>
  );
}

export default function ServiceStatusPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [q, setQ] = useState("");
  const [states, setStates] = useState<string[]>([]);

  const load = useCallback(async (first: boolean) => {
    const res = await fetch("/api/country-service-status", { cache: "no-store" }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    if (data && Array.isArray(data.countries)) { setRows(data.countries); setLoadError(""); return; }
    // A failed poll keeps the table it has; only the first load shows the error.
    if (first) setLoadError(errorDetail(res?.status ?? "network", "GET", "/api/country-service-status"));
  }, []);
  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(false), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const all = useMemo(() => rows ?? [], [rows]);
  const counts = useMemo(() => {
    const m = Object.fromEntries(COUNTRY_SERVICE_STATES.map((s) => [s, 0])) as Record<CountryServiceState, number>;
    for (const r of all) if (m[r.state] !== undefined) m[r.state] += 1;
    return m;
  }, [all]);
  const total = all.length;
  const recent = useMemo(() => all.filter((r) => r.updatedAt).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 5), [all]);
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => all.filter((r) => (!states.length || states.includes(r.state)) && (!query || r.country.toLowerCase().includes(query) || (r.note ?? "").toLowerCase().includes(query))), [all, states, query]);
  const filtered = states.length > 0 || Boolean(query);
  const clearAll = () => { setQ(""); setStates([]); };
  const ready = rows !== null;
  const state = ready ? "ready" : loadError ? "error" : "loading";
  const pick = (s: CountryServiceState) => setStates((cur) => (cur.length === 1 && cur[0] === s ? [] : [s]));
  const anyDebug = all.some((r) => r.runningDebug);
  const onlyState = states.length === 1 ? (states[0] as CountryServiceState) : null;

  const columns: Column<Row>[] = [
    { id: "country", header: "Country", sortValue: (r) => r.country, cell: (r) => <span className="font-medium">{r.country}</span> },
    { id: "status", header: "Status", width: "230px", sortValue: (r) => COUNTRY_SERVICE_STATES.indexOf(r.state), cell: (r) => (
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone={TONE[r.state] ?? "neutral"}>{labelOf(r.state)}</Badge>
        {r.runningDebug && <span className="text-[12px] text-cw-warning-text">debug running</span>}
      </span>
    ) },
    { id: "note", header: "Note", cell: (r) => (r.note ? <span className="line-clamp-2 text-[13px] text-cw-text-body" title={r.note}>{r.note}</span> : <span className="text-cw-text-muted">—</span>) },
    { id: "updated", header: "Updated", width: "120px", sortValue: (r) => (r.updatedAt ? -new Date(r.updatedAt).getTime() : null), cell: (r) => <span className="font-mono text-[12.5px] text-cw-text-muted" title={r.updatedAt ?? "Never set"}>{day(r.updatedAt) ?? "—"}</span> },
  ];

  return (
    <PortalShell title="Service status" crumb="/aip/service-status" subtitle="Where AIP retrieval currently works, by country. States are set by the Clearway team as services are verified.">
      <div className="flex flex-col gap-5" style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        {anyDebug && <Callout tone="warning" icon="terminal" title="A debug script is running">Some countries may briefly report errors while it works.</Callout>}

        <section aria-label="Summary" className="grid rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex flex-wrap items-center gap-7 border-b border-cw-divider p-6 lg:border-b-0 lg:border-r">
            <Donut counts={counts} total={total} ready={ready} />
            <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
              <div role="group" aria-label="Filter the table by state" className="flex flex-col gap-0.5">
                {COUNTRY_SERVICE_STATES.map((s) => {
                  const on = states.length === 1 && states[0] === s;
                  return (
                    <button key={s} type="button" aria-pressed={on} onClick={() => pick(s)} title={COUNTRY_SERVICE_STATE_META[s].description}
                      className={`grid h-9 cursor-pointer grid-cols-[12px_minmax(0,1fr)_48px_44px] items-center gap-2.5 rounded-[8px] border px-2.5 text-left font-sans text-[14px] font-medium text-cw-text outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)] ${on ? "border-cw-primary-tint-border bg-cw-bg-selected" : "border-transparent bg-transparent hover:bg-cw-bg-hover"}`}>
                      <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COUNTRY_SERVICE_STATE_META[s].colour }} />
                      <span>{COUNTRY_SERVICE_STATE_META[s].label}</span>
                      <span className="text-right font-mono text-[13px] font-semibold">{ready ? counts[s] : "—"}</span>
                      <span className="text-right font-mono text-[12px] text-cw-text-muted">{ready && total ? `${Math.round((counts[s] / total) * 100)}%` : ""}</span>
                    </button>
                  );
                })}
              </div>
              <span className="px-2.5 pt-1.5 text-[12px] text-cw-text-muted">{onlyState ? "Click it again to show every state." : "Click a state to filter the table."}</span>
            </div>
          </div>
          <div className="flex flex-col px-6 py-5">
            <h2 className="m-0 mb-1.5 text-[15px] font-bold text-cw-text">Recently changed</h2>
            {!ready ? (
              <div className="flex flex-col gap-3 pt-2">{[140, 120, 150, 110, 130].map((w, i) => <Skeleton key={i} w={w} />)}</div>
            ) : recent.length === 0 ? (
              <p className="m-0 text-[13.5px] text-cw-text-muted">No country has been set yet. Changes made in the Service status editor appear here.</p>
            ) : (
              <ol aria-label="Recently changed" className="m-0 list-none p-0">
                {recent.map((r) => (
                  <li key={r.country} className="grid min-h-[38px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-b border-cw-divider text-[13.5px] last:border-b-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-cw-text">{r.country}</span>
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-cw-text-muted">
                        <span aria-hidden className="h-[7px] w-[7px] rounded-[2px]" style={{ background: COUNTRY_SERVICE_STATE_META[r.state]?.colour }} />{labelOf(r.state)}
                      </span>
                    </span>
                    <span className="font-mono text-[12px] text-cw-text-muted" title={r.updatedAt ?? undefined}>{day(r.updatedAt)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <TableCard>
          <DataTable
            label="Country service statuses"
            columns={columns}
            rows={shown}
            rowKey={(r) => r.country}
            state={state}
            error={{ title: "Couldn't load country statuses", detail: loadError, onRetry: () => { setLoadError(""); void load(true); } }}
            defaultSort={{ id: "country", dir: "asc" }}
            filtered={filtered}
            onClearFilters={clearAll}
            noMatchTitle={onlyState && !query ? <>No country is “{labelOf(onlyState)}” right now</> : query ? <>No country matches “{q.trim()}”</> : "No country matches these filters"}
            noMatchBody={onlyState && !query ? <>That&apos;s 0 of {total} countries.</> : "Search looks at country names and notes."}
            empty={{ icon: "globe", title: "No countries yet", body: "Countries appear here once airports are loaded or a state is set in the editor." }}
            toolbar={<>
              <FilterBar search={q} onSearch={setQ} searchPlaceholder="Filter countries"
                filters={[{ id: "status", label: "Status", icon: "circle-dot", options: COUNTRY_SERVICE_STATES.map((s) => ({ value: s, label: labelOf(s) })), values: states, onChange: setStates, counts }]} />
              {filtered && ready && <FilteredStrip shown={shown.length} total={total} reasons={filterReasons(states.length ? 1 : 0, Boolean(query))} onClear={clearAll} noun={total - shown.length === 1 ? "country" : "countries"} />}
            </>}
          />
        </TableCard>
      </div>
    </PortalShell>
  );
}
