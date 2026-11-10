"use client";

// The AIP library (bug report 8 item 3; design "AIP Library", 2026-11-10): every country that publishes an AIP, with
// three actions — the official AIP page, GEN, ENR — each a link straight to the part when the site allows one, and the
// state of the last link check beside them. Staff only (the client allow-list has no page here, and nothing of this
// page reaches a client's bundle). Links come from the table the aip-sync worker keeps (scripts/aip-library.mjs); the
// page never guesses one. Search by country name, ICAO prefix or airport ICAO; Recent is this person's, on this device.
import { useEffect, useMemo, useRef, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import MaskIcon from "@/components/portal/Icon";
import { Button, Callout, Skeleton } from "@/components/kit";

type Link = { url: string | null; state: "ok" | "failed" | "login" | "nodeep" | "none" | "unchecked"; why: string; source: string | null };
type Country = { name: string; iso: string; prefixes: string[]; region: string; provider: string; links: { official: Link; gen: Link; enr: Link }; checkedAt: string | null; airac: string | null; lastResult: string | null };
type Table = { ok: boolean; running?: boolean; airac: { cycle: string; effectiveFrom: string; nextCycle: string; nextEffectiveFrom: string }; checkedAt: string | null; countries: Country[] };

const REGIONS = ["Europe", "CIS", "Middle East", "Asia-Pacific", "Africa", "Americas"];
const RECENT_KEY = "cw-aip-library-recent";
const ago = (iso: string | null) => { if (!iso) return "never"; const m = Math.round((Date.now() - Date.parse(iso)) / 60_000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const dayWord = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`; };

function readRecent(): string[] { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.slice(0, 6) : []; } catch { return []; } }
function pushRecent(iso: string) { try { const next = [iso, ...readRecent().filter((x) => x !== iso)].slice(0, 6); localStorage.setItem(RECENT_KEY, JSON.stringify(next)); return next; } catch { return readRecent(); } }

/** Search: an airport ICAO (4 letters, by prefix), an ICAO prefix (1–2 letters), or a country name. */
function search(all: Country[], q: string) {
  const Q = q.trim().toUpperCase(); const ql = q.trim().toLowerCase();
  if (!Q) return [] as { c: Country; match: string }[];
  const out: { c: Country; match: string; rank: number }[] = [];
  for (const c of all) {
    let rank = 0; let match = "";
    const prefixHit = (p: string) => c.prefixes.includes(p);
    if (/^[A-Z0-9]{4}$/.test(Q) && (prefixHit(Q.slice(0, 2)) || prefixHit(Q.slice(0, 1)))) { rank = 5; match = `Airport ${Q}`; }
    else if (/^[A-Z]{1,2}$/.test(Q) && prefixHit(Q)) { rank = 4; match = `Prefix ${Q}`; }
    else if (c.name.toLowerCase().startsWith(ql)) rank = 2;
    else if (ql.length > 1 && c.name.toLowerCase().includes(ql)) rank = 1;
    if (rank) out.push({ c, match, rank });
  }
  return out.sort((a, b) => b.rank - a.rank || a.c.name.localeCompare(b.c.name));
}

function Action({ k, link, name, onOpen, phone }: { k: "official" | "gen" | "enr"; link: Link; name: string; onOpen: () => void; phone: boolean }) {
  const label = k === "official" ? "Official AIP" : k.toUpperCase();
  const off = link.state === "login" || link.state === "nodeep" || link.state === "none" || !link.url;
  const failed = link.state === "failed";
  const cls = `inline-flex items-center gap-2 rounded-[8px] border px-3 text-[13px] font-semibold no-underline ${phone ? "h-12 w-full" : "h-9"} ${failed ? "border-cw-danger-border bg-cw-danger-tint text-cw-danger-text" : "border-cw-border-control bg-cw-bg-surface text-cw-text"}`;
  if (off) {
    return <span className={`${cls} cursor-default text-cw-text-muted`} title={link.why} data-aip-link={k} data-state={link.state}><MaskIcon name={link.state === "login" ? "lock" : "link-2-off"} size={14} /><span className={k === "official" ? "" : "font-mono"}>{label}</span><span className="ml-auto truncate text-[11.5px] font-medium">{link.state === "login" ? "Login needed" : link.state === "none" ? "None" : "No direct link"}</span></span>;
  }
  return <a href={link.url!} target="_blank" rel="noopener noreferrer" onClick={onOpen} className={cls} title={failed ? `Last check failed: ${link.why}. The link may still open.` : `${name} · opens in a new tab`} data-aip-link={k} data-state={link.state}><span className={k === "official" ? "" : "font-mono"}>{label}</span><MaskIcon name={failed ? "triangle-alert" : "arrow-up-right"} size={14} className="ml-auto" /></a>;
}

export default function AipLibraryPage() {
  const [table, setTable] = useState<Table | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("All");
  const [recent, setRecent] = useState<string[]>([]);
  const [checking, setChecking] = useState("");
  const [phone, setPhone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = async () => {
    try { const r = await fetch("/api/aip/library", { cache: "no-store" }); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `The library answered ${r.status}.`); setTable(d); setError(""); }
    catch (e) { console.error("[aip-library]", e); setError("The AIP library could not be read. Try again in a minute."); }
  };
  useEffect(() => { void load(); setRecent(readRecent()); const on = () => setPhone(window.innerWidth < 700); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement !== input.current && !/input|textarea/i.test((document.activeElement as HTMLElement)?.tagName || "")) { e.preventDefault(); input.current?.focus(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const all = useMemo(() => table?.countries ?? [], [table]);
  const results = useMemo(() => search(all, q), [all, q]);
  const hasQ = Boolean(q.trim());
  const groups = useMemo(() => {
    if (hasQ) return [{ name: "", rows: results.map((r) => ({ c: r.c, match: r.match })) }];
    const regs = region === "All" ? REGIONS : [region];
    return regs.map((r) => ({ name: r, rows: all.filter((c) => c.region === r).map((c) => ({ c, match: "" })) })).filter((g) => g.rows.length);
  }, [all, hasQ, results, region]);
  const top = results[0]?.c;
  const touch = (c: Country) => setRecent(pushRecent(c.iso));
  const checkOne = async (c: Country) => {
    setChecking(c.iso);
    try { await fetch(`/api/aip/library/check?country=${encodeURIComponent(c.name)}`, { method: "POST" }); await load(); } finally { setChecking(""); }
  };
  const checkAll = async () => { setChecking("all"); try { await fetch("/api/aip/library/check", { method: "POST" }); } finally { setChecking(""); } };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") setQ("");
    if (e.key === "Enter" && top) { e.preventDefault(); const k = e.shiftKey ? "gen" : e.altKey ? "enr" : "official"; const l = top.links[k]; if (l?.url && l.state !== "login" && l.state !== "nodeep") { touch(top); window.open(l.url, "_blank", "noopener"); } }
  };
  const counts = useMemo(() => { const n = { ok: 0, failed: 0, off: 0 }; for (const c of all) for (const k of ["official", "gen", "enr"] as const) { const s = c.links[k].state; if (s === "ok") n.ok += 1; else if (s === "failed") n.failed += 1; else n.off += 1; } return n; }, [all]);

  const row = (c: Country, match: string, first: boolean) => {
    const fail = (["official", "gen", "enr"] as const).find((k) => c.links[k].state === "failed");
    const none = c.links.official.state === "none";
    const stale = !none && table && c.airac && c.airac !== table.airac.cycle;
    const dot = none ? "var(--cw-neutral)" : fail ? "var(--cw-danger)" : stale ? "var(--cw-warning)" : c.checkedAt ? "var(--cw-success)" : "var(--cw-border-strong)";
    const offs = (["gen", "enr"] as const).filter((k) => c.links[k].state === "login" || c.links[k].state === "nodeep");
    return (
      <div key={c.iso} data-country={c.iso} className={`grid gap-3 border-b border-cw-divider px-4 py-3 ${phone ? "grid-cols-1" : "grid-cols-[minmax(220px,1.2fr)_minmax(0,2fr)_minmax(180px,1fr)] items-center"} ${first && hasQ ? "bg-cw-bg-selected" : ""}`}>
        <div className="flex min-w-0 items-center gap-3">
          <img src={`https://flagcdn.com/w80/${c.iso}.png`} alt="" width={24} height={17} className="rounded-[2px] shadow-[0_0_0_1px_var(--cw-border)]" />
          <span className="flex min-w-0 flex-col gap-0.5"><span className="flex items-baseline gap-2"><b className="text-[14.5px] font-bold">{c.name}</b>{match && <span className="rounded-[5px] bg-cw-primary-tint px-1.5 text-[11px] font-semibold text-cw-text-link">{match}</span>}</span><span className="truncate font-mono text-[12px] text-cw-text-muted">{c.prefixes.join(" ")}{c.provider ? ` · ${c.provider}` : ""}</span></span>
        </div>
        {none ? (
          <div className="flex items-center gap-2 text-[13.5px] text-cw-text-body"><MaskIcon name="circle-slash" size={15} color="var(--cw-text-muted)" /><span><b className="font-semibold">No public AIP on file.</b> {c.links.official.why}</span></div>
        ) : (
          <div className={`flex gap-2 ${phone ? "flex-col" : "flex-wrap"}`}>
            {(["official", "gen", "enr"] as const).map((k) => <Action key={k} k={k} link={c.links[k]} name={c.name} onOpen={() => touch(c)} phone={phone} />)}
          </div>
        )}
        <div className="flex flex-col gap-1 text-[12px]">
          <span className="flex items-center gap-2 font-mono text-cw-text-body"><span className="h-2 w-2 rounded-full" style={{ background: dot }} />{none ? `checked ${ago(c.checkedAt)}` : c.checkedAt ? `AIRAC ${c.airac ?? "—"} · checked ${ago(c.checkedAt)}` : "not checked yet"}</span>
          {fail && <span className="text-cw-danger-text">{fail === "official" ? "Official" : fail.toUpperCase()} link failed · {c.links[fail].why}</span>}
          {!fail && stale && <span className="text-cw-warning-text">Site still on AIRAC {c.airac}</span>}
          {offs.length > 0 && <span className="text-cw-text-muted">{offs.map((k) => c.links[k].why).join(" · ")}</span>}
          <button type="button" onClick={() => void checkOne(c)} disabled={Boolean(checking)} className="self-start text-[12px] font-semibold text-cw-text-link disabled:opacity-50" data-check-country={c.iso}>{checking === c.iso ? "Checking…" : "Check now"}</button>
        </div>
      </div>
    );
  };

  return (
    <PortalShell title="AIP library" crumb="/aip/library" subtitle="Every country's AIP: the official page, GEN and ENR straight to the part. Links are checked every day and on each AIRAC cycle; a link that fails is marked, never hidden.">
      <div className="flex flex-col gap-4" style={{ padding: "0 var(--cw-page-pad) 40px" }} data-aip-library="">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-11 min-w-[280px] flex-1 items-center gap-2 rounded-[10px] border border-cw-border-control bg-cw-bg-surface px-3 focus-within:border-cw-focus focus-within:shadow-[0_0_0_3px_var(--cw-focus-halo)]">
            <MaskIcon name="search" size={17} color="var(--cw-text-muted)" />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={phone ? "Country, prefix or airport" : "Country, ICAO prefix or airport ICAO: Latvia, EV, EVRA"} spellCheck={false} autoComplete="off" className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-cw-text outline-none placeholder:text-cw-text-placeholder" data-library-search="" />
            {hasQ ? <button type="button" onClick={() => setQ("")} className="text-cw-text-muted" aria-label="Clear"><MaskIcon name="x" size={15} /></button> : !phone && <kbd className="rounded border border-cw-border-control px-1.5 font-mono text-[11px] text-cw-text-muted">/</kbd>}
          </label>
          {table && <span className="font-mono text-[12.5px] text-cw-text-muted">AIRAC {table.airac.cycle} since {dayWord(table.airac.effectiveFrom)} · next {table.airac.nextCycle} on {dayWord(table.airac.nextEffectiveFrom)}</span>}
          <Button variant="secondary" size="sm" onClick={() => void checkAll()} disabled={Boolean(checking) || Boolean(table?.running)} icon="rotate-cw">{table?.running || checking === "all" ? "Checking every link…" : "Check every link now"}</Button>
        </div>
        {hasQ && top && !phone && <span className="text-[12.5px] text-cw-text-muted">↵ opens the official AIP of {top.name} · ⇧↵ GEN · ⌥↵ ENR</span>}
        {!hasQ && (
          <div className="flex flex-wrap gap-2">
            {["All", ...REGIONS].map((t) => <button key={t} type="button" onClick={() => setRegion(t)} className={`h-9 rounded-[9px] border px-3 text-[13px] font-semibold ${region === t ? "border-cw-ink bg-cw-ink text-cw-on-ink" : "border-cw-border-control bg-cw-bg-surface text-cw-text-body"}`} data-region={t}>{t}<span className="ml-1.5 font-mono text-[12px] opacity-70">{t === "All" ? all.length : all.filter((c) => c.region === t).length}</span></button>)}
          </div>
        )}
        {!hasQ && recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" data-recent=""><span className="text-[11px] font-bold tracking-[.08em] text-cw-text-muted">RECENT</span>{recent.map((iso) => all.find((c) => c.iso === iso)).filter(Boolean).map((c) => <button key={c!.iso} type="button" onClick={() => setQ(c!.name)} className="inline-flex h-11 items-center gap-2 rounded-full border border-cw-border-control bg-cw-bg-surface px-3 text-[13px] font-semibold"><img src={`https://flagcdn.com/w80/${c!.iso}.png`} alt="" width={20} height={14} className="rounded-[2px]" />{c!.name}</button>)}</div>
        )}
        {error && <Callout tone="danger" title="The library could not be read">{error}</Callout>}
        {!table && !error && <Skeleton w="100%" h={160} />}
        {table && (
          <section className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-cw-border bg-cw-bg-sunken px-4 py-2 text-[12px] text-cw-text-muted"><span>{all.length} countries</span><span className="font-mono">{counts.ok} links open · {counts.failed} failed · {counts.off} no direct link</span><span>last full check {ago(table.checkedAt)}</span></div>
            {groups.map((g) => (
              <div key={g.name || "search"}>
                {g.name && <div className="flex items-center gap-2 bg-cw-bg-sunken px-4 py-1.5 text-[11px] font-bold tracking-[.08em] text-cw-text-body">{g.name.toUpperCase()}<span className="font-mono font-medium text-cw-text-muted">{g.rows.length}</span></div>}
                {g.rows.map((r, i) => row(r.c, r.match, i === 0))}
              </div>
            ))}
            {hasQ && !results.length && <div className="flex flex-col items-center gap-1 px-4 py-10 text-center"><b className="text-[15px]">No country matches “{q}”</b><span className="text-[13px] text-cw-text-muted">Try a country name, an ICAO prefix like EV, or an airport like EVRA.</span></div>}
          </section>
        )}
      </div>
    </PortalShell>
  );
}
