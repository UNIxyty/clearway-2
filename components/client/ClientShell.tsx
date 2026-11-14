"use client";

// The client's shell (design "Client Portal v3", 2026-11-13): on a desk, a 248 px sidebar — the logo, the menu
// (Timeline, Flights, Account, Settings), "Help & support" (to the Account page's help card), the address for questions
// (the support-address setting; nothing when it is empty) and the person with the collapse button — and a 56 px header
// with the crumb and the theme. Collapsed (components/client/rail.ts) the sidebar is a 72 px rail: the "CW" mark, each
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
  // instant, which sent a desk to the phone app, 2026-11-13) is looked at again a moment later and left alone
  useEffect(() => {
    goPhone(pathname);
    const mq = window.matchMedia(`(max-width: ${PHONE_MAX}px)`);
    let timer = 0;
    const onChange = () => { window.clearTimeout(timer); if (mq.matches) timer = window.setTimeout(() => { if (mq.matches) goPhone(pathname); }, 250); };
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
        <div className="clw-side-brand"><span className="clw-brand" data-client-logo=""><ClearwayLogo height={28} title="Clearway" /></span><span className="clw-mark" title="Clearway" data-client-mark="">CW</span></div>
        <nav className="clw-side-nav" aria-label="Areas">
          {menu.map((m) => <Link key={m.path} href={m.path} className={active(m.path) ? "on" : ""} aria-current={active(m.path) ? "page" : undefined} title={rail ? m.label : undefined} data-menu-item={m.path}><MaskIcon name={m.icon} size={16} className="clw-nav-icon" /><span>{m.label}</span></Link>)}
        </nav>
        <div className="clw-side-foot"><Link href="/client/account#help" title={rail ? "Help & support" : undefined} aria-label="Help & support" data-help-link=""><MaskIcon name="life-buoy" size={16} className="clw-nav-icon" /><span className="clw-long">Help &amp; support</span><span className="clw-short" aria-hidden>Help</span></Link></div>
        {contact && <div className="clw-side-help" data-client-contact=""><small>QUESTIONS ABOUT A FLIGHT</small><span>Clearway ops</span><a href={`mailto:${contact}`}>{contact}</a></div>}
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
          <button type="button" className="clw-theme" onClick={cycleTheme} aria-label="Theme" title="Theme" data-theme-button="">{mounted ? <MaskIcon name={theme === "dark" ? "moon" : "sun"} size={16} /> : null}</button>
        </header>
        {children}
      </div>
    </div>
  );
}
