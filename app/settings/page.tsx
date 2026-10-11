"use client";

// Settings (portal redesign, stage 4 — "Page Settings", §3.11): how the portal looks and behaves for this person,
// saved to their account as they change it. Appearance (the theme cards draw the real tokens; the Digital Wall is set
// separately and says so), Customisation (pinned tabs beside search; the dashboard's blocks) and Preferences (table
// density, start page, motion). Not here, because nothing in the portal would follow them yet: a local-time column,
// a date format, and where AIP documents open.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import PortalShell, { useIdentity } from "@/components/portal/Shell";
import MaskIcon from "@/components/portal/Icon";
import { Button, Callout, IconButton, Popover, SearchInput, Segmented, Select, Skeleton } from "@/components/kit";
import { useTheme, type ThemeChoice } from "@/components/portal/theme";
import { saveSetting, useLocalSettings, adoptAccountSettings, startPageOf, type SettingKey } from "@/components/portal/user-settings";
import { pagesSource } from "@/components/portal/TopSearch";
import { topicsForRole } from "@/components/portal/nav";
import { BLOCK_IDS, DEFAULT_LAYOUT, sanitizeLayout, type BlockId } from "@/lib/dashboard-layout";
import { MAX_PINS, START_PAGES, type Density, type Motion, type Pin } from "@/lib/user-settings";

const SECTIONS = [{ id: "appearance", label: "Appearance", icon: "sun-moon" }, { id: "customisation", label: "Customisation", icon: "layout-dashboard" }, { id: "preferences", label: "Preferences", icon: "sliders-horizontal" }];
const THEMES: Array<{ value: ThemeChoice; label: string; sub: string; halves: Array<"light" | "dark"> }> = [
  { value: "system", label: "Match this device", sub: "Follows your system setting", halves: ["light", "dark"] },
  { value: "light", label: "Light", sub: "", halves: ["light"] },
  { value: "dark", label: "Dark", sub: "For the ops room at night", halves: ["dark"] },
];
const BLOCK_META: Record<BlockId, { label: string; icon: string; adminOnly?: boolean }> = {
  today: { label: "Today", icon: "gauge" }, recent: { label: "Recently used", icon: "history" }, monitors: { label: "Service monitors", icon: "activity" },
  health: { label: "Server health", icon: "server", adminOnly: true }, links: { label: "Quick links", icon: "link" }, changelog: { label: "Changelog", icon: "scroll-text" },
};
const LABEL: Record<SettingKey | "theme", string> = { density: "Table density", motion: "Motion", pins: "Pinned tabs", startPage: "Start page", theme: "Appearance" };
const clockZ = (d: Date) => `${d.toISOString().slice(11, 16)}Z`;

/** A miniature of the portal in one theme, drawn with that theme's own tokens (data-theme on the preview). */
function Preview({ theme }: { theme: "light" | "dark" }) {
  return (
    <div data-theme={theme} className="grid grid-cols-[28px_1fr] bg-cw-bg-page">
      <div className="flex flex-col gap-[5px] border-r border-cw-border bg-cw-bg-sidebar px-1.5 py-2"><span className="h-1 rounded-sm bg-cw-text-muted" /><span className="h-1 rounded-sm bg-cw-border-strong" /><span className="h-1 rounded-sm bg-cw-border-strong" /></div>
      <div className="flex flex-col gap-1.5 p-2">
        <span className="h-1.5 w-1/2 rounded-sm bg-cw-text" />
        <span className="flex flex-1 flex-col gap-1 rounded border border-cw-border bg-cw-bg-surface p-[5px]"><span className="h-[3px] w-4/5 bg-cw-border-strong" /><span className="h-[3px] w-3/5 bg-cw-border-strong" /><span className="mt-auto h-2 w-[34px] rounded-sm bg-cw-primary" /></span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { role, isDeveloper, hasAgent } = useIdentity();
  const { choice, setChoice } = useTheme();
  const local = useLocalSettings();
  const [loaded, setLoaded] = useState(false);
  const [startPage, setStartPage] = useState("/dashboard");
  const [layout, setLayout] = useState<ReturnType<typeof sanitizeLayout>>(null);
  const [saved, setSaved] = useState<{ at: Date; local: boolean } | null>(null);
  // A save that did not reach the account: what it was, and how to try again.
  const [failed, setFailed] = useState<{ label: string; retry: () => void; local: boolean } | null>(null);
  const [section, setSection] = useState("appearance");

  useEffect(() => {
    fetch("/api/user/preferences", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const prefs = d?.preferences ?? null;
      adoptAccountSettings(prefs);
      setStartPage(startPageOf(prefs));
      if (prefs && "dashboard_layout" in prefs) setLayout(sanitizeLayout(prefs.dashboard_layout));
      else { try { setLayout(sanitizeLayout(JSON.parse(localStorage.getItem("cw-dashboard-layout") || "null"))); } catch { /* none */ } }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  // Which section is on screen (the left list follows the scroll).
  useEffect(() => {
    if (!loaded) return;
    const io = new IntersectionObserver((entries) => { const v = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setSection(v.target.id); }, { rootMargin: "-80px 0px -55% 0px" });
    for (const s of SECTIONS) { const el = document.getElementById(s.id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [loaded]);

  const save = useCallback(async (key: SettingKey, value: Density | Motion | Pin[] | string) => {
    setFailed(null);
    const r = await saveSetting(key, value);
    if (r === "failed") { setFailed({ label: LABEL[key], retry: () => void save(key, value), local: key !== "startPage" }); return; }
    setSaved({ at: new Date(), local: r === "local" });
  }, []);
  const pickTheme = useCallback(async (c: ThemeChoice) => {
    setFailed(null);
    setChoice(c, { save: false });
    const r = await fetch("/api/user/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: c }) }).catch(() => null);
    if (!r?.ok) { setFailed({ label: LABEL.theme, retry: () => void pickTheme(c), local: true }); return; }
    const b = await r.json().catch(() => ({}));
    setSaved({ at: new Date(), local: b?.themeSaved === false });
  }, [setChoice]);

  const starts = START_PAGES.filter((p) => !p.needs || (p.needs === "agent" ? hasAgent : isDeveloper));
  const shownBlocks = (layout ?? DEFAULT_LAYOUT).map((b) => b.id).filter((id) => !BLOCK_META[id].adminOnly || role === "admin" || isDeveloper);
  const allBlocks = BLOCK_IDS.filter((id) => !BLOCK_META[id].adminOnly || role === "admin" || isDeveloper);

  return (
    <PortalShell title="Settings" crumb="/settings" subtitle="How the portal looks and behaves for you. Saved to your account as you change them."
      headerRight={saved ? (
        <span role="status" className="flex items-center gap-1.5 text-[12.5px] text-cw-text-muted">
          <MaskIcon name={saved.local ? "monitor" : "circle-check"} size={14} color={saved.local ? "var(--cw-text-muted)" : "var(--cw-success)"} />
          {saved.local ? "Saved on this device" : <>Saved · <span className="font-mono">{clockZ(saved.at)}</span></>}
        </span>
      ) : undefined}>
      <div className="grid items-start gap-6 min-[900px]:grid-cols-[200px_minmax(0,1fr)]" style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        <nav aria-label="Settings sections" className="flex flex-wrap gap-0.5 min-[900px]:sticky min-[900px]:top-[calc(var(--cw-topbar)+28px)] min-[900px]:flex-col">
          {SECTIONS.map((s) => {
            const on = section === s.id;
            return (
              <a key={s.id} href={`#${s.id}`} aria-current={on ? "true" : undefined} onClick={() => setSection(s.id)}
                className={`flex h-9 items-center gap-2.5 whitespace-nowrap rounded-[8px] px-3 text-[14px] no-underline outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)] ${on ? "bg-cw-bg-active font-bold text-cw-text" : "font-medium text-cw-text-body hover:bg-cw-bg-hover"}`}>
                <MaskIcon name={s.icon} size={16} color={on ? "var(--cw-text-link)" : "var(--cw-text-muted)"} />{s.label}
              </a>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          {failed && (
            <Callout tone="warning" title={`Couldn't save “${failed.label}” to your account.`} action={<Button size="sm" onClick={failed.retry}>Retry now</Button>}>
              {failed.local ? "It's applied on this device and will follow you once it saves." : "The start page is read from your account, so it takes effect once it saves."}
            </Callout>
          )}

          {/* Appearance */}
          <section id="appearance" aria-label="Appearance" className="scroll-mt-[calc(var(--cw-topbar)+24px)] rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1">
            <header className="border-b border-cw-divider px-5 py-[18px]"><h2 className="m-0 text-[16px] font-bold text-cw-text">Appearance</h2><p className="m-0 mt-0.5 text-[13px] text-cw-text-muted">Applies to the portal on every device you sign in on.</p></header>
            {!loaded ? (
              <div className="p-5">
                <div className="grid gap-3.5 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} w="100%" h={150} round={12} />)}</div>
                <p className="m-0 mt-3 text-[13px] text-cw-text-muted">The theme you see now comes from this device until your saved settings arrive.</p>
              </div>
            ) : (
              <div role="radiogroup" aria-label="Theme" className="grid gap-3.5 p-5 sm:grid-cols-3">
                {THEMES.map((t, i) => {
                  const on = choice === t.value;
                  return (
                    <button key={t.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => void pickTheme(t.value)}
                      onKeyDown={(e: KeyboardEvent) => { const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0; if (!d) return; e.preventDefault(); const n = THEMES[(i + d + THEMES.length) % THEMES.length]; void pickTheme(n.value); (e.currentTarget.parentElement?.children[(i + d + THEMES.length) % THEMES.length] as HTMLElement | undefined)?.focus(); }}
                      className={`flex cursor-pointer flex-col gap-2.5 rounded-[12px] bg-cw-bg-surface p-2.5 text-left font-sans outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)] ${on ? "border-[1.5px] border-cw-primary shadow-[0_0_0_3px_var(--cw-focus-halo)]" : "border border-cw-border hover:border-cw-border-strong"}`}>
                      <span className={`grid h-24 overflow-hidden rounded-[8px] border border-cw-border ${t.halves.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>{t.halves.map((h) => <Preview key={h} theme={h} />)}</span>
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden className={`h-4 w-4 flex-none rounded-full bg-cw-bg-surface ${on ? "border-[5px] border-cw-primary" : "border-[1.5px] border-cw-border-strong"}`} />
                        <span><span className="block text-[14px] font-semibold text-cw-text">{t.label}</span>{t.sub && <span className="block text-[12px] text-cw-text-muted">{t.sub}</span>}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mx-5 mb-5 flex flex-wrap items-start gap-3 rounded-[10px] border border-cw-border bg-cw-bg-sunken px-3.5 py-3">
              <MaskIcon name="monitor" size={17} color="var(--cw-text-muted)" className="mt-px" />
              <p className="m-0 min-w-[220px] flex-1 text-[13px] leading-[1.55] text-cw-text-body"><strong className="font-semibold text-cw-text">The Digital Wall keeps its own colours and fonts.</strong> They belong to each wall account and are set in the wall&apos;s own settings. This theme does not change what the ops-room screen shows.</p>
              <a href="/digital-wall/console/settings" className="whitespace-nowrap text-[13px] font-semibold text-cw-text-link no-underline hover:text-cw-primary-hover">Wall display settings</a>
            </div>
          </section>

          {/* Customisation */}
          <section id="customisation" aria-label="Customisation" className="scroll-mt-[calc(var(--cw-topbar)+24px)] rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1">
            <header className="border-b border-cw-divider px-5 py-[18px]"><h2 className="m-0 text-[16px] font-bold text-cw-text">Customisation</h2><p className="m-0 mt-0.5 text-[13px] text-cw-text-muted">Only affects you.</p></header>
            <div className="grid gap-x-6 gap-y-4 border-b border-cw-divider p-5 min-[900px]:grid-cols-[240px_minmax(0,1fr)]">
              <div><div className="text-[14px] font-semibold text-cw-text">Pinned to the search bar</div><div className="mt-0.5 text-[12.5px] leading-normal text-cw-text-muted">Up to {MAX_PINS} pages or airports, shown beside search in the top bar on wide screens. Drag to reorder, or use the arrow keys on the handle.</div></div>
              <Pins pins={local.pins} topics={topicsForRole(role, isDeveloper, hasAgent)} onChange={(p) => void save("pins", p)} />
            </div>
            <div className="grid items-center gap-x-6 gap-y-4 p-5 min-[900px]:grid-cols-[240px_minmax(0,1fr)]">
              <div><div className="text-[14px] font-semibold text-cw-text">Dashboard blocks</div><div className="mt-0.5 text-[12.5px] leading-normal text-cw-text-muted">{shownBlocks.length} of {allBlocks.length} shown. Arrange them on the dashboard itself.</div></div>
              <div className="flex flex-wrap items-center gap-2">
                {allBlocks.map((id) => {
                  const on = shownBlocks.includes(id);
                  return <span key={id} className={`inline-flex h-7 items-center gap-1.5 rounded-[7px] border px-2.5 text-[12.5px] font-semibold ${on ? "border-cw-primary-tint-border bg-cw-bg-selected text-cw-text-link" : "border-cw-border text-cw-text-muted"}`}><MaskIcon name={BLOCK_META[id].icon} size={13} />{BLOCK_META[id].label}{!on && <span className="sr-only"> (hidden)</span>}</span>;
                })}
                <Link href="/dashboard?customise=1" className="inline-flex h-[30px] items-center gap-1.5 rounded-[8px] border border-cw-border-control bg-cw-bg-surface px-2.5 text-[13px] font-semibold text-cw-text no-underline outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">Customise dashboard<MaskIcon name="arrow-right" size={14} /></Link>
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section id="preferences" aria-label="Preferences" className="scroll-mt-[calc(var(--cw-topbar)+24px)] rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1">
            <header className="border-b border-cw-divider px-5 py-[18px]"><h2 className="m-0 text-[16px] font-bold text-cw-text">Preferences</h2></header>
            <div className="grid items-center gap-x-5 gap-y-3 border-b border-cw-divider px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <div><div className="text-[14px] font-semibold text-cw-text">Table density</div><div className="mt-0.5 text-[12.5px] leading-normal text-cw-text-muted">Comfortable rows are 52px; compact rows are 32px. Applies to the portal&apos;s tables.</div></div>
              <Segmented label="Table density" size="sm" value={local.density} onChange={(v) => void save("density", v)} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
            </div>
            <div className="grid items-center gap-x-5 gap-y-3 border-b border-cw-divider px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <div><div className="text-[14px] font-semibold text-cw-text">Start page</div><div className="mt-0.5 text-[12.5px] leading-normal text-cw-text-muted">Where you land after signing in, unless a link asked for another page.</div></div>
              <span className="w-[220px]"><Select label="Start page" value={startPage} onChange={(v) => { setStartPage(v); void save("startPage", v); }} options={(starts.some((p) => p.value === startPage) ? starts : [...starts, START_PAGES.find((p) => p.value === startPage)!].filter(Boolean)).map((p) => ({ value: p.value, label: p.label }))} /></span>
            </div>
            <div className="grid items-center gap-x-5 gap-y-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <div><div className="text-[14px] font-semibold text-cw-text">Motion</div><div className="mt-0.5 text-[12.5px] leading-normal text-cw-text-muted">Reduce turns off animation — loading shimmer, panel slides, chart fills — whatever your device is set to.</div></div>
              <Segmented label="Motion" size="sm" value={local.motion} onChange={(v) => void save("motion", v)} options={[{ value: "system", label: "Match device" }, { value: "reduce", label: "Reduce" }]} />
            </div>
          </section>
        </div>
      </div>
    </PortalShell>
  );
}

/** The pinned list: a preview of the top bar, the list (reorder, unpin) and "Pin a page or airport". */
function Pins({ pins, topics, onChange }: { pins: Pin[]; topics: ReturnType<typeof topicsForRole>; onChange: (p: Pin[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [airports, setAirports] = useState<Array<{ icao: string; name: string }>>([]);
  const [said, setSaid] = useState("");
  const addBtn = useRef<HTMLButtonElement>(null);
  const dragging = useRef<number | null>(null);
  const pages = useMemo(() => pagesSource(topics), [topics]);
  const full = pins.length >= MAX_PINS;
  const pinned = new Set(pins.map((p) => p.href));

  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) { setAirports([]); return; }
    const t = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(s)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { results: [] })).then((d) => {
        setAirports(((d.results ?? []) as Array<{ icao?: string; name?: string }>).filter((a) => /^[A-Z0-9]{4}$/.test(String(a.icao ?? ""))).slice(0, 5).map((a) => ({ icao: String(a.icao), name: String(a.name ?? "") })));
      }).catch(() => setAirports([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const pageResults = pages.search(q).filter((p) => !pinned.has(p.href)).slice(0, 6);
  const add = (p: Pin) => { if (full || pinned.has(p.href)) return; onChange([...pins, p]); setOpen(false); setQ(""); setSaid(`${p.label} pinned`); };
  const remove = (i: number) => { const p = pins[i]; onChange(pins.filter((_, n) => n !== i)); setSaid(`${p.label} unpinned`); };
  const move = (i: number, by: number) => { const j = i + by; if (j < 0 || j >= pins.length) return; const next = [...pins]; const [it] = next.splice(i, 1); next.splice(j, 0, it); onChange(next); setSaid(`${it.label} moved to position ${j + 1} of ${next.length}`); };

  return (
    <div className="flex flex-col gap-2.5">
      <div aria-hidden className="flex h-10 items-center gap-1.5 overflow-hidden rounded-[10px] border border-cw-border bg-cw-bg-sunken px-1.5">
        <span className="flex h-7 w-full max-w-[220px] items-center gap-1.5 rounded-[7px] border border-cw-border-control bg-cw-bg-surface px-2 text-[12.5px] text-cw-text-placeholder"><MaskIcon name="search" size={13} color="var(--cw-text-muted)" />Search</span>
        {pins.map((p) => <span key={p.href} className={`inline-flex h-[26px] flex-none items-center gap-1 rounded-[7px] border border-cw-border bg-cw-bg-surface px-2 text-[12px] font-semibold text-cw-text ${p.kind === "airport" ? "font-mono" : ""}`}><MaskIcon name={p.icon} size={12} color="var(--cw-text-muted)" />{p.label}</span>)}
      </div>
      <ul aria-label="Pinned" className="m-0 list-none overflow-hidden rounded-[10px] border border-cw-border p-0">
        {pins.map((p, i) => (
          <li key={p.href} draggable onDragStart={(e) => { dragging.current = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.href); }}
            onDragOver={(e) => { if (dragging.current === null) return; e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); const from = dragging.current; dragging.current = null; if (from === null || from === i) return; move(from, i - from); }}
            onDragEnd={() => { dragging.current = null; }}
            className="flex h-11 items-center gap-2.5 border-b border-cw-divider px-2.5 text-[14px]">
            <button type="button" aria-label={`Move ${p.label} (position ${i + 1} of ${pins.length}; arrow keys move it)`} onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(i, -1); } if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(i, 1); } }}
              className="flex h-7 w-6 cursor-grab items-center justify-center rounded-[6px] border-none bg-transparent text-cw-text-muted outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]"><MaskIcon name="grip-vertical" size={15} /></button>
            <MaskIcon name={p.icon} size={15} color="var(--cw-text-muted)" />
            <span className={`min-w-0 flex-1 truncate text-cw-text ${p.kind === "airport" ? "font-mono" : ""}`}>{p.label}</span>
            <span className="hidden truncate font-mono text-[12px] text-cw-text-muted sm:inline">{p.href}</span>
            <IconButton icon="x" label={`Unpin ${p.label}`} size="sm" onClick={() => remove(i)} />
          </li>
        ))}
        <li className="flex h-11 items-center gap-2.5 px-2.5">
          {full ? <span className="text-[13px] text-cw-text-muted">That&apos;s the most — unpin one to add another.</span> : (
            <button ref={addBtn} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center gap-2 rounded-[6px] border-none bg-transparent p-0 font-sans text-[14px] font-semibold text-cw-text-link outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">
              <MaskIcon name="plus" size={15} />Pin a page or airport
            </button>
          )}
          <span className="ml-auto font-mono text-[12px] text-cw-text-muted">{pins.length} of {MAX_PINS}</span>
        </li>
      </ul>
      <Popover anchor={addBtn as React.RefObject<HTMLElement>} open={open} onClose={() => { setOpen(false); setQ(""); }} role="dialog" label="Pin a page or airport" minWidth={340}>
        <div className="flex flex-col gap-1 p-1">
          <SearchInput size="sm" autoFocus value={q} onValueChange={setQ} placeholder="A page, or an ICAO like EVRA" aria-label="Find a page or airport to pin" />
          {airports.length > 0 && <div className="px-2 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-cw-text-muted">Airports</div>}
          {airports.filter((a) => !pinned.has(`/aip/${a.icao}`)).map((a) => (
            <button key={a.icao} type="button" onClick={() => add({ kind: "airport", label: a.icao, href: `/aip/${a.icao}`, icon: "plane" })} className="flex h-8 cursor-pointer items-center gap-2.5 rounded-[6px] border-none bg-transparent px-2 text-left font-sans text-[13.5px] text-cw-text hover:bg-cw-bg-hover focus-visible:bg-cw-bg-hover focus-visible:outline-none">
              <MaskIcon name="plane" size={14} color="var(--cw-text-muted)" /><span className="font-mono font-semibold">{a.icao}</span><span className="min-w-0 truncate text-cw-text-muted">{a.name}</span>
            </button>
          ))}
          {pageResults.length > 0 && <div className="px-2 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-cw-text-muted">Pages</div>}
          {pageResults.map((p) => (
            <button key={`${p.href}-${p.label}`} type="button" onClick={() => add({ kind: "page", label: p.label, href: p.href, icon: p.icon })} className="flex h-8 cursor-pointer items-center gap-2.5 rounded-[6px] border-none bg-transparent px-2 text-left font-sans text-[13.5px] text-cw-text hover:bg-cw-bg-hover focus-visible:bg-cw-bg-hover focus-visible:outline-none">
              <MaskIcon name={p.icon} size={14} color="var(--cw-text-muted)" /><span className="min-w-0 flex-1 truncate">{p.label}</span><span className="text-[12px] text-cw-text-muted">{p.group}</span>
            </button>
          ))}
          {q.trim() && !pageResults.length && !airports.length && <div className="px-2 py-3 text-[13px] text-cw-text-muted">Nothing matches “{q.trim()}”.</div>}
        </div>
      </Popover>
      <div aria-live="polite" className="sr-only">{said}</div>
    </div>
  );
}
