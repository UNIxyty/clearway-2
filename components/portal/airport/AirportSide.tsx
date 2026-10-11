"use client";

// The airport page's right column (portal redesign, stage 3 — "Page Airport", §3.9): NOTAMs and weather. Each card
// loads and fails on its own — a NOTAM source that is down leaves the document and the weather usable (§3.9 error).
//
// NOTAMs are coloured by the Digital Wall's five categories: the wall's own keyword groups and matcher
// (digital-wall/lib/notam-rules.mjs), read live from the wall so an edit there applies here too, and the first group
// that matches wins, as on the wall. The colours are the portal's tokens, by position: closure, restriction,
// availability, runway / infra, info. The wall keeps its own colours on the wall.

import { useEffect, useMemo, useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { Button, IconButton, Skeleton, Spinner } from "@/components/kit";
import { DEFAULT_NOTAM_GROUPS, compileNotamGroups, formatNotamTime, matchNotamText, parseNotamTime } from "@/digital-wall/lib/notam-rules.mjs";

export type Notam = { location: string; number: string; class: string; startDateUtc: string; endDateUtc: string; condition: string };
type Group = { group: string; color: string; terms: string[]; patterns: string[] };

const LOOK = [
  { dot: "var(--cw-danger)", bg: "var(--cw-danger-tint)", fg: "var(--cw-danger-text)" },
  { dot: "var(--cw-orange)", bg: "var(--cw-orange-tint)", fg: "var(--cw-orange-text)" },
  { dot: "var(--cw-success)", bg: "var(--cw-success-tint)", fg: "var(--cw-success-text)" },
  { dot: "var(--cw-primary)", bg: "var(--cw-primary-tint)", fg: "var(--cw-text-link)" },
  { dot: "var(--cw-neutral)", bg: "var(--cw-neutral-tint)", fg: "var(--cw-neutral-text)" },
];
const lookAt = (i: number) => LOOK[Math.min(i, LOOK.length - 1)];
const SHORT: Record<string, string> = { "Closure / prohibition": "Closure", "Restriction / conditional": "Restriction", "Runway / taxiway / infra": "Runway / infra", "Other / info": "Info" };

/** The wall's keyword groups: live from the wall when it answers, its built-in defaults when it does not. */
function useWallGroups(): Group[] {
  const [groups, setGroups] = useState<Group[]>(DEFAULT_NOTAM_GROUPS as Group[]);
  useEffect(() => {
    fetch("/digital-wall/api/alerts/rules", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const g = d?.rules?.notamGroups; if (Array.isArray(g) && g.length) setGroups(g); })
      .catch(() => { /* keep the defaults */ });
  }, []);
  return groups;
}

const cleanText = (c: string) => c.split("\n").filter((l) => !/^\|#\d+\|[-\s]+/.test(l) && !/^[A-Z]\d+\/\d+\s+NOTAM[A-Z]?\s/.test(l)).join("\n").trim();
const when = (raw: string) => { const p = parseNotamTime(raw); return p == null ? (raw || "—") : formatNotamTime(p); };
const clock = (iso?: string | null) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`; };

function CardHead({ icon, title, meta, onRefresh, busy, label }: { icon: string; title: string; meta?: string | null; onRefresh: () => void; busy: boolean; label: string }) {
  return (
    <header className="flex h-[52px] items-center gap-2.5 border-b border-cw-divider pl-[18px] pr-3">
      <MaskIcon name={icon} size={16} color="var(--cw-text-muted)" />
      <h2 className="m-0 text-[15px] font-bold text-cw-text">{title}</h2>
      {meta && <span className="font-mono text-[12.5px] text-cw-text-muted">{meta}</span>}
      <span className="flex-1" />
      <IconButton icon="refresh-cw" label={label} size="sm" loading={busy} onClick={onRefresh} />
    </header>
  );
}

function Progress({ text }: { text: string }) {
  return (
    <div role="status">
      <div className="flex items-center gap-2.5 border-b border-cw-divider px-[18px] py-3.5 text-[13.5px] text-cw-text"><Spinner size={14} /><span className="min-w-0 flex-1">{text}</span></div>
      {["90%", "80%", "85%"].map((w, i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-cw-divider px-[18px] py-3 last:border-b-0"><Skeleton w="40%" /><Skeleton w={w} h={8} shimmer={false} /><Skeleton w="60%" h={8} shimmer={false} /></div>
      ))}
    </div>
  );
}

function Problem({ title, detail, onRetry }: { title: string; detail: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2.5 px-[18px] py-5">
      <div className="flex items-start gap-2.5">
        <MaskIcon name="circle-x" size={17} color="var(--cw-danger)" className="mt-px" />
        <div className="min-w-0"><div className="text-[14px] font-bold text-cw-text">{title}</div><div className="mt-0.5 break-words text-[13px] leading-normal text-cw-text-body">{detail}</div></div>
      </div>
      <div className="pl-[27px]"><Button size="sm" variant="primary" icon="rotate-cw" onClick={onRetry}>Try again</Button></div>
    </div>
  );
}

const FIRST = 6;

export function NotamsCard({ icao, notams, loading, steps, error, updatedAt, onRefresh }: {
  icao: string; notams: Notam[] | null; loading: boolean; steps: string[]; error: string | null; updatedAt: string | null; onRefresh: () => void;
}) {
  const groups = useWallGroups();
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [icao]);
  const sorted = useMemo(() => {
    const compiled = compileNotamGroups(groups);
    const fallback = groups.length - 1;
    return (notams ?? []).map((n, i) => {
      const hit = matchNotamText(`${n.number ?? ""} ${n.condition ?? ""}`, compiled)[0];
      const cat = hit ? Math.max(0, groups.findIndex((g) => g.group === hit.group)) : fallback;
      return { n, i, cat };
    }).sort((a, b) => a.cat - b.cat || a.i - b.i);
  }, [notams, groups]);
  const counts = useMemo(() => groups.map((_, gi) => sorted.filter((s) => s.cat === gi).length), [groups, sorted]);
  const ready = !loading && !error && notams !== null;
  const shown = all ? sorted : sorted.slice(0, FIRST);

  return (
    <section aria-label="NOTAMs" className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1">
      <CardHead icon="scroll-text" title="NOTAMs" meta={ready ? `${sorted.length} ${sorted.length === 1 ? "NOTAM" : "NOTAMs"}` : null} onRefresh={onRefresh} busy={loading} label="Get NOTAMs again" />
      {loading ? <Progress text={steps[steps.length - 1] ?? `Getting NOTAMs for ${icao}…`} />
        : error ? <Problem title="Couldn't get NOTAMs" detail={error} onRetry={onRefresh} />
        : notams === null ? <Progress text={`Getting NOTAMs for ${icao}…`} />
        : sorted.length === 0 ? (
          <div className="px-[18px] py-6 text-[13.5px] text-cw-text-muted">The source returned no NOTAMs for {icao}.{clock(updatedAt) && <> Checked <span className="font-mono">{clock(updatedAt)}</span>.</>}</div>
        ) : (
          <>
            <ul aria-label="Categories" className="m-0 flex list-none flex-wrap gap-1.5 border-b border-cw-divider px-3.5 py-2.5">
              {groups.map((g, gi) => (
                <li key={g.group} className="inline-flex h-[26px] items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-semibold" style={{ background: lookAt(gi).bg, color: lookAt(gi).fg }}>
                  <span aria-hidden className="h-[7px] w-[7px] rounded-[2px]" style={{ background: lookAt(gi).dot }} />{SHORT[g.group] ?? g.group}<span className="font-mono font-medium">{counts[gi]}</span>
                </li>
              ))}
            </ul>
            <ul aria-label={`NOTAMs for ${icao}`} className="m-0 list-none p-0">
              {shown.map(({ n, i, cat }) => {
                const look = lookAt(cat); const name = SHORT[groups[cat]?.group] ?? groups[cat]?.group ?? "Info";
                return (
                  <li key={`${n.number}-${i}`} className="grid grid-cols-[8px_minmax(0,1fr)] gap-3 border-b border-cw-divider px-[18px] py-3">
                    <span aria-hidden className="mt-[5px] h-2 w-2 rounded-[2px]" style={{ background: look.dot }} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[12.5px] font-semibold text-cw-text">{n.number}</span>
                        <span className="inline-flex h-[18px] items-center rounded-[4px] px-1.5 text-[11px] font-semibold" style={{ background: look.bg, color: look.fg }}>{name}</span>
                        {(n.startDateUtc || n.endDateUtc) && <span className="ml-auto font-mono text-[11.5px] text-cw-text-muted">{when(n.startDateUtc)} → {when(n.endDateUtc)}</span>}
                      </div>
                      <p className="m-0 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-normal text-cw-text-body">{cleanText(n.condition)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex min-h-11 items-center px-[18px] text-[13px]">
              {sorted.length > FIRST && <button type="button" onClick={() => setAll((a) => !a)} className="cursor-pointer rounded-[4px] border-none bg-transparent p-0 font-sans text-[13px] font-semibold text-cw-text-link outline-none hover:text-cw-primary-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">{all ? "Show the first 6" : `All ${sorted.length} NOTAMs`}</button>}
              {clock(updatedAt) && <span className="ml-auto text-[12px] text-cw-text-muted">updated <span className="font-mono">{clock(updatedAt)}</span></span>}
            </div>
          </>
        )}
    </section>
  );
}

export function WeatherCard({ icao, loading, steps, error, updatedAt, airportLine, bullets, plain, onRefresh }: {
  icao: string; loading: boolean; steps: string[]; error: string | null; updatedAt: string | null;
  airportLine: string | null; bullets: Array<{ kind: string; id: string; body: string }>; plain: string; onRefresh: () => void;
}) {
  return (
    <section aria-label="Weather" className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1">
      <CardHead icon="cloud-sun" title="Weather" meta={!loading && clock(updatedAt) ? clock(updatedAt) : null} onRefresh={onRefresh} busy={loading} label="Get weather again" />
      {loading ? (
        <div role="status" className="flex flex-col gap-2.5 px-[18px] py-3.5">
          <div className="flex items-center gap-2.5 text-[13.5px] text-cw-text"><Spinner size={14} />{steps[steps.length - 1] ?? `Getting weather for ${icao}…`}</div>
          <Skeleton w="90%" /><Skeleton w="75%" shimmer={false} />
        </div>
      ) : error ? <Problem title="Couldn't get the weather" detail={error} onRetry={onRefresh} />
        : bullets.length > 0 ? (
          <div className="flex flex-col gap-3 px-[18px] py-3">
            {airportLine && <p className="m-0 whitespace-pre-wrap break-words text-[12px] text-cw-text-muted">{airportLine}</p>}
            {bullets.map((b, i) => (
              <div key={`${b.kind}-${b.id}-${i}`}>
                <div className="mb-1 text-[10.5px] font-bold tracking-[0.1em] text-cw-text-muted">{b.kind}{b.id ? ` · ${b.id}` : ""}</div>
                <div className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.55] text-cw-text">{b.body}</div>
              </div>
            ))}
          </div>
        ) : plain.trim() ? <pre className="m-0 whitespace-pre-wrap break-words px-[18px] py-3 font-mono text-[12px] leading-5 text-cw-text-body">{plain}</pre>
        : <div className="px-[18px] py-6 text-[13.5px] text-cw-text-muted">No weather returned for {icao} yet.</div>}
    </section>
  );
}
