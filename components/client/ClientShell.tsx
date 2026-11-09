"use client";

// The client's shell (2026-11-04): the plumbing for a client inside the portal, ahead of the screens' design. Its menu
// is exactly what lib/clients/allow.mjs lets this client reach, built on the server from their switches and handed in
// as `menu` — never a definition of the staff menu cut down. This file imports nothing of the portal's shell or its
// navigation (components/portal/Shell.tsx, components/portal/nav.ts), so neither the page source nor the scripts a
// client loads carry the staff menu; rig/client-allow-check.mjs reads both to prove it. A client who can reach nothing
// gets an empty menu, which is correct and honest.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import MaskIcon from "@/components/portal/Icon";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type ClientMenuItem = { path: string; label: string; icon: string };

export default function ClientShell({ menu, account, company, initials, children }: { menu: ClientMenuItem[]; account: ClientMenuItem; company: string; initials: string; children: ReactNode }) {
  const pathname = usePathname() ?? "/client";
  const [utc, setUtc] = useState("");
  useEffect(() => { const tick = () => setUtc(new Date().toISOString().slice(11, 16)); tick(); const t = setInterval(tick, 1000); return () => clearInterval(t); }, []);
  const active = (p: string) => (p === "/client" ? pathname === "/client" : pathname === p || pathname.startsWith(`${p}/`));
  return (
    <div className={`clw ${menu.length > 1 ? "clw-tabs" : ""}`} data-client-shell="" data-menu={menu.map((m) => m.path).join(" ")}>
      <header className="clw-head">
        <span className="clw-brand">Clearway</span><span className="clw-sep" />
        <span className="clw-name">{company}</span>
        {menu.length > 1 && <nav className="clw-topnav" aria-label="Areas">{menu.map((m) => <Link key={m.path} href={m.path} className={active(m.path) ? "on" : ""} aria-current={active(m.path) ? "page" : undefined}><MaskIcon name={m.icon} size={15} />{m.label}</Link>)}</nav>}
        <span className="clw-grow" />
        <span className="clw-clock"><span className="clw-utc" suppressHydrationWarning>{utc}<small>UTC</small></span></span>
        {/* the account page, apart from the areas (2026-11-09): the avatar on a desk, the last tab on a phone */}
        <Link href={account.path} className={`clw-avatar ${active(account.path) ? "on" : ""}`} aria-label={account.label} title={account.label} aria-current={active(account.path) ? "page" : undefined} data-account-link="">{initials || "·"}</Link>
        <button type="button" className="clw-signout" onClick={async () => { await createSupabaseBrowserClient().auth.signOut(); window.location.href = "/login"; }}>Sign out</button>
      </header>
      {children}
      {/* the note above the phone's tab bar: a tab bar is the last thing on the screen (2026-11-09) */}
      <footer className="clw-foot"><span>Times in UTC. Data from Clearway handling, updated live.</span></footer>
      <nav className="clw-bottomnav" aria-label="Areas and account">{[...menu, account].map((m) => <Link key={m.path} href={m.path} className={active(m.path) ? "on" : ""} aria-current={active(m.path) ? "page" : undefined}><MaskIcon name={m.icon} size={22} />{m.label}</Link>)}</nav>
    </div>
  );
}
