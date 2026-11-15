"use client";

// The client's shell (design "Client Portal v3", 2026-11-13; "Desktop Screen v3", 2026-11-15): on a desk, a 232 px
// sidebar — the logo, the menu (Timeline, Flights, Account, Settings), "Help & support" (to the Account page's help
// card), the fleet in three lines (operators, aircraft shown, next departure), the address for questions (the
// support-address setting; nothing when it is empty) and the person with the collapse button — and a 48 px top bar
// with the crumb, whether the flight data is live, the UTC clock and the theme. The fleet and the live line are read
// by the shell itself (FleetBlock, LiveIndicator below: small fetches of the same answers the frame reads, nothing of
// the wall app imported), every 60 s. Neither claims more than a read said: "Live" only after an answer said live,
// a failed read says "Not live", a fleet that could not be read shows no numbers at all. Collapsed (components/client/rail.ts) the sidebar is a 72 px rail: the "CW" mark, each
// item an icon over a short word with its full name as the title; the choice is kept in this browser. On a phone the desk pages are not drawn at
// all: Timeline, Flights, Account and the start page go to the phone app (components/client/phone.ts); Settings stays,
// under a bar with a link back to the phone app. The menu is exactly what lib/clients/allow.mjs lets this client
// reach, built on the server and handed in as `menu`. This file imports nothing of the portal's staff shell or its
// navigation, so neither the page source nor the scripts a client loads carry the staff menu;
// rig/client-allow-check.mjs reads both to prove it.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import MaskIcon from "@/components/portal/Icon";
import { readChoice, setChoice, useTheme } from "@/components/portal/theme";
import { ClearwayLogo } from "@/components/portal/ClearwayLogo";
import { goPhone, PHONE_APP, PHONE_MAX } from "@/components/client/phone";
import { readRail, writeRail } from "@/components/client/rail";

export type ClientMenuItem = { path: string; label: string; icon: string };

const POLL_MS = 60_000;
const READ: RequestInit = { credentials: "same-origin", cache: "no-store" };
/** One quiet read: the answer's body, or null for anything else (no answer, not 2xx, not JSON, `ok: false`). */
async function readJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, READ);
    if (!r.ok) return null;
    const d = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return d && typeof d === "object" && d.ok !== false ? d : null;
  } catch { return null; }
}
const msOf = (v: unknown): number => { if (v == null || v === "") return NaN; return new Date(v as string).getTime(); };
const hmZ = (ms: number) => { const d = new Date(ms); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };

/** Whether the flight data is live (GET sync-status, the client's cut: ok, lastSyncTimestamp, healthy, live, updatedAt). */
function LiveIndicator() {
  const [st, setSt] = useState<{ state: "unknown" | "live" | "behind"; at: number | null }>({ state: "unknown", at: null });
  useEffect(() => {
    let stop = false;
    const read = () => readJson("/digital-wall/api/timeline/sync-status").then((d) => {
      if (stop) return;
      if (!d) { setSt({ state: "behind", at: null }); return; }   // no answer is not live
      const at = [d.updatedAt, d.lastSyncTimestamp].map(msOf).find(Number.isFinite) ?? null;
      const live = (d.live === true || d.live === "working") && d.healthy !== false;
      setSt({ state: live ? "live" : "behind", at });
    });
    read();
    const id = window.setInterval(read, POLL_MS);
    return () => { stop = true; window.clearInterval(id); };
  }, []);
  const words = st.state === "unknown" ? "CHECKING" : st.state === "live" ? "LIVE" : st.at != null ? `NOT LIVE · ${hmZ(st.at)}Z` : "NOT LIVE";
  const title = st.state === "unknown" ? "Checking whether the flight data is live" : st.state === "live" ? "The flight data is live" : st.at != null ? `The flight data is not live. Last updated ${hmZ(st.at)} UTC.` : "The flight data is not live right now.";
  return <span className="clw-live" data-live-indicator={st.state} role="status" title={title}><i className="clw-live-dot" aria-hidden />{words}</span>;
}

/** The time in UTC, HH:MM, kept to the minute; drawn only after the page is in the browser (no server time to mismatch). */
function UtcClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let id = 0;
    const tick = () => { setNow(Date.now()); id = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50); };
    tick();
    return () => window.clearTimeout(id);
  }, []);
  return <span className="clw-utc" data-utc-clock="" aria-label={now == null ? "UTC time" : `${hmZ(now)} UTC`}>{now == null ? "--:--" : hmZ(now)}<small> UTC</small></span>;
}

type FeedFlight = Record<string, unknown>;
type FeedAircraft = { oprId?: unknown; registration?: unknown; flights?: FeedFlight[] };
type Fleet = { operators: number; shown: number; granted: number; next: string };
/** The departure time the wall shows (shared/wall-facts.mjs flightTimes, the departure half): T/O; else the later of
 *  CTOT and ETD (an ETD over 30 min before the schedule is a leftover and ignored); else STD. Times over 48 h from the
 *  schedule are not used. */
function depMs(f: FeedFlight): number {
  const std = msOf(f.startTimeUTC);
  const sane = (v: unknown) => { const ms = msOf(v); return Number.isFinite(ms) && Math.abs(ms - std) <= 48 * 3600_000 ? ms : null; };
  const to = sane(f.takeOffUTC); if (to != null) return to;
  const etd0 = sane(f.etd) ?? std; const etd = etd0 < std - 30 * 60_000 ? std : etd0;
  const ctot = sane(f.ctotUTC);
  return ctot != null || etd !== std ? Math.max(ctot ?? -Infinity, etd) : std;
}
/** The three fleet lines, from the client's own feed and their saved hidden list (the frame's applyHidden rule). */
function fleetOf(aircraft: FeedAircraft[], hidden: { operators: string[]; registrations: string[] }, nowMs: number): Fleet {
  const usable = aircraft.map((a) => ({ opr: String(a.oprId ?? "").toLowerCase(), reg: String(a.registration || "UNKNOWN").toUpperCase(), flights: (a.flights ?? []).filter((f) => Number.isFinite(msOf(f.startTimeUTC)) && Number.isFinite(msOf(f.endTimeUTC))) })).filter((a) => a.flights.length > 0);
  const ops = new Set(hidden.operators), regs = new Set(hidden.registrations);
  const visible = usable.filter((a) => !ops.has(a.opr) && !regs.has(a.reg));
  let next: { ms: number; no: string } | null = null;
  for (const a of visible) for (const f of a.flights) {
    const st = String(f.movementState ?? "");
    if (f.isCnl || f.atd || f.ata || f.takeOffUTC || f.isAirborne || f.hasArrived || ["airborne", "arrived", "cancelled"].includes(st)) continue;
    const ms = depMs(f);
    if (!Number.isFinite(ms) || ms < nowMs - 60 * 60_000) continue;   // a departure over an hour gone with no ATD is an old row, not the next one
    if (!next || ms < next.ms) next = { ms, no: String(f.flightNo || f.tripNo || "").trim() };
  }
  return { operators: new Set(usable.map((a) => a.opr)).size, shown: visible.length, granted: usable.length, next: next ? `${next.no ? `${next.no} ` : ""}${hmZ(next.ms)}Z` : "—" };
}
const listOf = (v: unknown, up: boolean) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).map((x) => (up ? x.toUpperCase() : x.toLowerCase())) : []);

/** "Your fleet": read every 60 s, and at once when the frame says the hidden list changed ({ type: "prefs" }). */
function FleetBlock() {
  const [fleet, setFleet] = useState<Fleet | null | "failed">(null);   // null while reading; "failed" shows no numbers
  useEffect(() => {
    let stop = false;
    const read = async () => {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)), to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4));
      const q = new URLSearchParams({ allOperators: "true", refresh: "false", from: from.toISOString(), to: to.toISOString() });
      const [feed, prefs] = await Promise.all([readJson(`/digital-wall/api/timeline/flights?${q.toString()}`), readJson("/api/client/prefs")]);
      if (stop) return;
      if (!feed || !Array.isArray(feed.aircraft) || !prefs) { setFleet("failed"); return; }   // the hidden list unread: "x of y" would be a guess
      const h = ((prefs.prefs as Record<string, unknown> | undefined)?.hidden ?? {}) as Record<string, unknown>;
      setFleet(fleetOf(feed.aircraft as FeedAircraft[], { operators: listOf(h.operators, false), registrations: listOf(h.registrations, true) }, Date.now()));
    };
    read();
    const id = window.setInterval(read, POLL_MS);
    const onMsg = (e: MessageEvent) => { const d = e.data as { source?: string; type?: string } | null; if (e.origin === window.location.origin && d?.source === "cw-client-frame" && d.type === "prefs") read(); };
    window.addEventListener("message", onMsg);
    return () => { stop = true; window.clearInterval(id); window.removeEventListener("message", onMsg); };
  }, []);
  const rows: [string, string, string][] = fleet && fleet !== "failed" ? [["operators", "Operators", String(fleet.operators)], ["aircraft", "Aircraft shown", `${fleet.shown} of ${fleet.granted}`], ["next", "Next dep.", fleet.next]] : [];
  return (
    <div className="clw-side-fleet" data-fleet-summary={fleet === null ? "reading" : fleet === "failed" ? "failed" : "read"}>
      <small>YOUR FLEET</small>
      {fleet === null && <span className="clw-fleet-note">Reading…</span>}
      {fleet === "failed" && <span className="clw-fleet-note" role="status">Could not be read just now.</span>}
      {rows.map(([k, t, v]) => <span key={k} className="clw-fleet-row" data-fleet-row={k}><span>{t}</span><b title={v}>{v}</b></span>)}
    </div>
  );
}

export default function ClientShell({ menu, company, person, initials, contact, children }: { menu: ClientMenuItem[]; company: string; person: string; initials: string; contact: string; children: ReactNode }) {
  const pathname = usePathname() ?? "/client";
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // the sidebar's collapse: the class on <html> draws it (set before the first paint by the layout's inline script);
  // this state follows it for the button's name and icon and the items' titles
  const [rail, setRail] = useState(false);
  useEffect(() => { const on = readRail(); setRail(on); writeRail(on); }, []);
  const toggleRail = () => { const on = !rail; setRail(on); writeRail(on); };
  // a phone: off to the phone app, on arriving here and when the window becomes a phone's width — and stays it: a
  // window that is narrow for a moment only (a browser taking a picture of the whole page makes it 1 px wide for an
  // instant, which sent a desk to the phone app, 2026-11-13) is looked at again a moment later and left alone.
  // Two more looks, not one (2026-11-14: on a busy machine the picture held the window narrow past a single 250 ms
  // look), and a width no phone has (under 240 px) is never a phone at any look.
  useEffect(() => {
    goPhone(pathname);
    const mq = window.matchMedia(`(max-width: ${PHONE_MAX}px)`);
    const narrow = () => mq.matches && window.innerWidth >= 240;
    let timer = 0;
    const onChange = () => {
      window.clearTimeout(timer);
      if (!narrow()) return;
      timer = window.setTimeout(() => { if (narrow()) timer = window.setTimeout(() => { if (narrow()) goPhone(pathname); }, 500); }, 250);
    };
    mq.addEventListener("change", onChange);
    return () => { window.clearTimeout(timer); mq.removeEventListener("change", onChange); };
  }, [pathname]);
  const active = (p: string) => (p === "/client" ? pathname === "/client" : pathname === p || pathname.startsWith(`${p}/`));
  const current = menu.find((m) => active(m.path));
  const here = current?.label ?? (pathname.startsWith("/client/start") ? "Start page" : pathname.startsWith("/client/settings") ? "Settings" : "Your flights");
  const cycleTheme = () => { const c = readChoice(); setChoice(c === "dark" ? "light" : c === "light" ? "system" : "dark"); };
  return (
    <div className="clw" data-client-shell="" data-menu={menu.map((m) => m.path).join(" ")}>
      <aside className="clw-side" aria-label="Client navigation">
        <div className="clw-side-brand"><span className="clw-brand" data-client-logo=""><ClearwayLogo height={20} title="Clearway" /></span><span className="clw-mark" title="Clearway" data-client-mark="">CW</span></div>
        <nav className="clw-side-nav" aria-label="Areas">
          {menu.map((m) => <Link key={m.path} href={m.path} className={active(m.path) ? "on" : ""} aria-current={active(m.path) ? "page" : undefined} title={rail ? m.label : undefined} data-menu-item={m.path}><MaskIcon name={m.icon} size={16} className="clw-nav-icon" /><span>{m.label}</span></Link>)}
        </nav>
        <div className="clw-side-foot"><Link href="/client/account#help" title={rail ? "Help & support" : undefined} aria-label="Help & support" data-help-link=""><MaskIcon name="life-buoy" size={16} className="clw-nav-icon" /><span className="clw-long">Help &amp; support</span><span className="clw-short" aria-hidden>Help</span></Link></div>
        <FleetBlock />
        {contact && <div className="clw-side-help" data-client-contact=""><small>QUESTIONS ABOUT A FLIGHT</small><a href={`mailto:${contact}`}>{contact}</a></div>}
        <div className="clw-side-user" data-client-user="">
          <span className="clw-avatar" aria-hidden title={rail ? (person || company || undefined) : undefined}>{initials || "·"}</span>
          <span className="clw-side-who"><b>{person || company || "Signed in"}</b><small>{company ? `${company.toUpperCase()} · CLIENT` : "CLIENT"}</small></span>
          <button type="button" className="clw-rail-btn" onClick={toggleRail} aria-label={rail ? "Expand sidebar" : "Collapse sidebar"} title={rail ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!rail} data-rail-button=""><MaskIcon name={rail ? "panel-left-open" : "panel-left-close"} size={16} /></button>
        </div>
      </aside>
      <div className="clw-main">
        {/* a phone's bar (Settings is the one desk page a phone keeps): the logo and the way back to the phone app */}
        <div className="clw-phonebar" data-phone-bar="">
          <span className="clw-brand"><ClearwayLogo height={20} title="Clearway" /></span>
          <span className="clw-grow" />
          <a href={PHONE_APP} className="clw-back" data-back-to-phone=""><MaskIcon name="arrow-left" size={16} /><span>Back to your flights</span></a>
        </div>
        <header className="clw-head">
          <span className="clw-crumb" data-client-crumb=""><span>{company || "Clearway"}</span><MaskIcon name="chevron-right" size={16} /><b>{here}</b></span>
          <span className="clw-grow" />
          <LiveIndicator />
          <UtcClock />
          <button type="button" className="clw-theme" onClick={cycleTheme} aria-label="Theme" title="Theme" data-theme-button="">{mounted ? <MaskIcon name={theme === "dark" ? "moon" : "sun"} size={16} /> : null}</button>
        </header>
        {children}
      </div>
    </div>
  );
}
