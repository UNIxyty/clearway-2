"use client";

// The client's shell (design "Client View v2" and "Phone Views", 2026-11-10): on a desk, the portal's sidebar with
// three items — Timeline, Flights, Account — the Clearway ops address under them and the person at the bottom; a
// header with the crumb and the theme. On a phone, the three as a tab bar above the home indicator and nothing else
// around the page. Its menu is exactly what lib/clients/allow.mjs lets this client reach, built on the server and
// handed in as `menu`. This file imports nothing of the portal's staff shell or its navigation, so neither the page
// source nor the scripts a client loads carry the staff menu; rig/client-allow-check.mjs reads both to prove it.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import MaskIcon from "@/components/portal/Icon";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { readChoice, setChoice, useTheme } from "@/components/portal/theme";
import { ClearwayLogo } from "@/components/portal/ClearwayLogo";

export type ClientMenuItem = { path: string; label: string; icon: string };

export default function ClientShell({ menu, company, person, initials, contact, children }: { menu: ClientMenuItem[]; company: string; person: string; initials: string; contact: string; children: ReactNode }) {
  const pathname = usePathname() ?? "/client";
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = (p: string) => (p === "/client" ? pathname === "/client" : pathname === p || pathname.startsWith(`${p}/`));
  const current = menu.find((m) => active(m.path));
  const watch = pathname === "/client" || pathname.startsWith("/client/flights") || pathname.startsWith("/client/settings");
  const cycleTheme = () => { const c = readChoice(); setChoice(c === "dark" ? "light" : c === "light" ? "system" : "dark"); };
  return (
    <div className={`clw${watch ? " is-watch" : ""}`} data-client-shell="" data-menu={menu.map((m) => m.path).join(" ")}>
      <aside className="clw-side" aria-label="Client navigation">
        <div className="clw-side-brand"><span className="clw-brand" data-client-logo=""><ClearwayLogo height={22} title="Clearway" /></span></div>
        <nav className="clw-side-nav" aria-label="Areas">
          {menu.map((m) => <Link key={m.path} href={m.path} className={active(m.path) ? "on" : ""} aria-current={active(m.path) ? "page" : undefined}><MaskIcon name={m.icon} size={17} />{m.label}</Link>)}
        </nav>
        {contact && <div className="clw-side-help" data-client-contact=""><small>QUESTIONS ABOUT A FLIGHT</small><span>Clearway ops</span><a href={`mailto:${contact}`}>{contact}</a></div>}
        <div className="clw-side-user"><span className="clw-avatar" aria-hidden>{initials || "·"}</span><span className="clw-side-who"><b>{person || company}</b><small>{company ? `${company.toUpperCase()} · CLIENT` : "CLIENT"}</small></span></div>
      </aside>
      <div className="clw-main">
        <header className="clw-head">
          <span className="clw-crumb"><span>{company}</span><MaskIcon name="chevron-right" size={13} /><b>{current?.label ?? (pathname.startsWith("/client/settings") ? "Display settings" : "Account")}</b></span>
          <span className="clw-grow" />
          <button type="button" className="clw-theme" onClick={cycleTheme} aria-label="Theme" title="Theme" data-theme-button="">{mounted ? <MaskIcon name={theme === "dark" ? "moon" : "sun"} size={17} /> : null}</button>
          <button type="button" className="clw-signout" onClick={async () => { await createSupabaseBrowserClient().auth.signOut(); window.location.href = "/login"; }}>Sign out</button>
        </header>
        {children}
      </div>
      {/* the phone's tab bar: the three items, above the home indicator (design "Phone Views") */}
      <nav className="clw-bottomnav" aria-label="Areas">{menu.map((m) => <Link key={m.path} href={m.path} className={active(m.path) ? "on" : ""} aria-current={active(m.path) ? "page" : undefined}><MaskIcon name={m.icon} size={22} />{m.label}</Link>)}</nav>
    </div>
  );
}
