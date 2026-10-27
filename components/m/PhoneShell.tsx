"use client";

// The portal on a phone (mobile-portal-spec.md, "Mobile Screen.dc.html"): a 56 px app bar (back, title, subtitle,
// up to two 44 px actions), the page, and a 58 px tab bar plus the safe area — Wall, Flights, Intake (with the
// needs-you count), Agent, More. More is a sheet listing every other page by section; Tier 3 pages carry a Desk tag.
// Deep screens hide the tab bar. The theme and motion are the portal's (app/layout.tsx); the tokens are the portal's
// plus the --mx-* additions. Hosted by the portal (/m) and talking to the wall's API on the same origin — the ops-room
// display is the authority for every fact the Wall and Flights tabs show (shared/wall-facts.mjs).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import MaskIcon from "@/components/portal/Icon";
import { topicsForRole } from "@/components/portal/nav";
import { useIdentity } from "@/components/portal/Shell";
import { AGENT_BASE } from "@/components/agent/types";
import { PhoneChromeProvider, usePhoneChrome, type PhoneTab } from "./chrome";
import { hmUtc } from "./ui";

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");

// Tier 1 pages live under /m; everything else opens its desktop page until Stage 3 gives it a phone pattern.
const M_ROUTES: Record<string, string> = {
  "wall-flights": "/m/flights", "aip-search": "/m/airport", "agent-chat": "/m/agent", "agent-intake": "/m/intake",
  // Tier 2 (mobile Stage 3)
  dashboard: "/m/dashboard", "aip-status": "/m/service-status", "aip-hidden": "/m/hidden-airports",
  "wall-notam": "/m/notam-check", "wall-operators": "/m/operators", "wall-aircraft": "/m/aircraft", "wall-limitations": "/m/limitations", "wall-important": "/m/important", "wall-caa": "/m/caa", "wall-webhooks": "/m/webhooks", "wall-reports": "/m/reports", "wall-settings": "/m/wall-settings",
  "agent-history": "/m/history", "agent-knowledge": "/m/knowledge", "agent-activity": "/m/activity", "agent-settings": "/m/agent-settings", "agent-mailbox": "/m/mailbox",
  "adm-users": "/m/users", "adm-maint": "/m/maintenance", "adm-agent-sites": "/m/agent-sites", "dev-inbox": "/m/inbox", "acc-profile": "/m/profile", settings: "/m/settings",
  // Tier 3: the honest screen
  "adm-perms": "/m/desk/permissions",
};
// Tier 3 (mobile-portal-spec.md › tiers): a grid or a runner that needs a wide screen — marked Desk here and given one
// honest screen (/m/desk/[id]). The debug runner and the component sheet are not in the nav at all.
const DESK = new Set(["adm-perms"]);

function TabBar({ tab, hasAgent, intakeNeeds, onMore }: { tab?: PhoneTab; hasAgent: boolean; intakeNeeds: number; onMore: () => void }) {
  const tabs: Array<{ k: PhoneTab; t: string; icon: string; href?: string; badge?: number }> = [
    { k: "wall", t: "Wall", icon: "monitor", href: "/m/wall" },
    { k: "flights", t: "Flights", icon: "plane", href: "/m/flights" },
    ...(hasAgent ? [{ k: "intake" as const, t: "Intake", icon: "plane-landing", href: "/m/intake", badge: intakeNeeds }, { k: "agent" as const, t: "Agent", icon: "bot", href: "/m/agent" }] : []),
    { k: "more", t: "More", icon: "menu" },
  ];
  return (
    <nav aria-label="Sections" className="grid flex-none border-t border-cw-border bg-mx-tabbar px-1 pb-[max(8px,env(safe-area-inset-bottom))]" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map((t) => {
        const on = t.k === tab;
        const inner = (
          <>
            <span className={cx("absolute left-[22%] right-[22%] top-0 h-[2.5px] rounded-b-[2px]", on ? "bg-mx-tab-indicator" : "bg-transparent")} />
            <span className="relative"><MaskIcon name={t.icon} size={22} color="currentColor" />
              {t.badge ? <span className="absolute -right-2.5 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-[9px] border-2 border-mx-tabbar bg-cw-danger-solid px-1 font-mono text-[10.5px] font-bold text-cw-text-on-primary">{t.badge}</span> : null}
            </span>
            {t.t}
          </>
        );
        const cls = cx("relative flex h-[58px] flex-col items-center justify-center gap-[3px] text-[11.5px]", on ? "font-bold text-mx-tab-active" : "font-medium text-mx-tab-idle");
        return t.href ? <Link key={t.k} href={t.href} className={cls} aria-current={on ? "page" : undefined}>{inner}</Link>
          : <button key={t.k} type="button" className={cls} onClick={onMore}>{inner}</button>;
      })}
    </nav>
  );
}

function MoreSheet({ open, onClose, hasAgent }: { open: boolean; onClose: () => void; hasAgent: boolean }) {
  const { display, initials, role, isDeveloper } = useIdentity();
  const topics = topicsForRole(role, isDeveloper, hasAgent);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40">
      <div className="absolute inset-0 bg-cw-bg-scrim" onClick={onClose} />
      <div role="dialog" aria-label="Every page" className="absolute inset-x-0 bottom-0 top-[72px] flex flex-col rounded-t-[20px] bg-mx-sheet shadow-cw-pop">
        <div className="flex justify-center pt-2"><span className="h-[5px] w-[38px] rounded-[3px] bg-mx-handle" /></div>
        <div className="flex h-14 flex-none items-center gap-3 border-b border-cw-border pl-5 pr-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cw-primary text-[13px] font-bold text-cw-text-on-primary">{initials || "?"}</span>
          <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[15px] font-bold text-cw-text">{display || "Signed in"}</span><span className="text-[12.5px] text-cw-text-muted">{role === "admin" ? "Admin" : "User"}</span></span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-[12px] text-cw-text-muted"><MaskIcon name="x" size={20} color="currentColor" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-[max(34px,env(safe-area-inset-bottom))] pt-1">
          {topics.map((t) => {
            const pages = (t.items ?? (t.href ? [{ id: t.id, label: t.label, icon: t.icon, href: t.href }] : [])).filter((p) => !["wall-flights", "agent-intake", "agent-chat", "wall-open"].includes(p.id));
            if (!pages.length) return null;
            return (
              <div key={t.id}>
                <div className="px-2 pb-1 pt-4 text-[11.5px] font-bold tracking-[.08em] text-cw-text-muted">{t.label.toUpperCase()}</div>
                {pages.map((p) => {
                  const desk = DESK.has(p.id);
                  const href = M_ROUTES[p.id] ?? p.href;
                  return (
                    <Link key={p.id} href={href} onClick={onClose} className={cx("flex min-h-12 items-center gap-3 rounded-[10px] px-2", desk ? "text-cw-text-muted" : "text-cw-text")}>
                      <MaskIcon name={p.icon} size={19} color="var(--cw-text-muted)" className="flex-none" />
                      <span className="flex-1 text-[15.5px] font-medium">{p.label}</span>
                      {desk ? <span className="inline-flex h-[22px] items-center gap-1 rounded-[6px] border border-cw-border-control px-1.5 text-[11.5px] font-semibold text-cw-text-muted"><MaskIcon name="monitor" size={11} color="currentColor" />Desk</span>
                        : <MaskIcon name="chevron-right" size={16} color="var(--cw-text-muted)" />}
                    </Link>
                  );
                })}
              </div>
            );
          })}
          <div className="px-2 pb-1 pt-4 text-[11.5px] font-bold tracking-[.08em] text-cw-text-muted">HELP</div>
          <Link href="/m/help" onClick={onClose} className="flex min-h-12 items-center gap-3 rounded-[10px] px-2 text-cw-text"><MaskIcon name="life-buoy" size={19} color="var(--cw-text-muted)" className="flex-none" /><span className="flex-1 text-[15.5px] font-medium">Help &amp; support</span><MaskIcon name="chevron-right" size={16} color="var(--cw-text-muted)" /></Link>
        </div>
      </div>
    </div>
  );
}

function AppBar() {
  const c = usePhoneChrome();
  const router = useRouter();
  const back = () => { if (typeof c.back === "function") c.back(); else if (typeof c.back === "string") router.push(c.back); };
  const subtitle = c.subtitle === "utc" ? `${hmUtc()} UTC` : c.subtitle;
  return (
    <header className={cx("flex h-14 flex-none items-center gap-1 border-b border-cw-border bg-mx-appbar pr-1.5", c.back ? "pl-0.5" : "pl-[18px]")}>
      {c.back && <button type="button" onClick={back} aria-label="Back" className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] text-cw-text"><MaskIcon name="chevron-left" size={24} color="currentColor" /></button>}
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <h1 className={cx("m-0 truncate font-extrabold tracking-[-.015em] text-cw-text", c.mono ? "font-mono text-[19px]" : "text-[20px]")}>{c.title}</h1>
        {subtitle && <span className={cx("truncate text-[12.5px] text-cw-text-muted", c.monoSubtitle && "font-mono")}>{subtitle}</span>}
      </div>
      {(c.actions ?? []).slice(0, 2).map((a) => {
        const inner = <><MaskIcon name={a.icon} size={20} color="currentColor" />{a.dot && <span className="absolute right-[11px] top-[11px] h-2 w-2 rounded-full border-2 border-mx-appbar bg-cw-danger" />}</>;
        const cls = "relative flex h-11 w-11 flex-none items-center justify-center rounded-[12px] text-cw-text-body";
        return a.href ? <Link key={a.label} href={a.href} aria-label={a.label} className={cls}>{inner}</Link> : <button key={a.label} type="button" aria-label={a.label} onClick={a.onClick} className={cls}>{inner}</button>;
      })}
    </header>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const c = usePhoneChrome();
  const { hasAgent } = useIdentity();
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const [intakeNeeds, setIntakeNeeds] = useState(0);
  useEffect(() => { setMore(false); }, [pathname]);
  useEffect(() => {
    if (!hasAgent) return;
    let stop = false;
    const load = () => fetch(`${AGENT_BASE}/api/intake/requests?tab=needs`, { credentials: "same-origin", cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).then((r) => { if (!stop && r?.counts) setIntakeNeeds(Number(r.counts.needs ?? 0)); }).catch(() => {});
    void load(); const t = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [hasAgent, pathname]);
  const showTabs = c.tabs !== false;
  return (
    // A phone takes the whole screen; a wider screen gets the phone column, centred, so /m stays usable on a laptop.
    <div className="min-h-[100dvh] bg-cw-bg-sunken">
      <div data-phone-shell className="relative mx-auto flex h-[100dvh] max-w-[430px] flex-col overflow-hidden bg-cw-bg-page text-cw-text">
        {c.bar !== false && <AppBar />}
        <main className={cx("relative flex min-h-0 flex-1 flex-col overflow-x-hidden", c.bar === false ? "overflow-hidden" : "overflow-y-auto")}>{children}</main>
        {showTabs && <TabBar tab={c.tab} hasAgent={hasAgent} intakeNeeds={intakeNeeds} onMore={() => setMore(true)} />}
        <MoreSheet open={more} onClose={() => setMore(false)} hasAgent={hasAgent} />
      </div>
    </div>
  );
}

export default function PhoneShell({ children }: { children: ReactNode }) {
  return <PhoneChromeProvider><Frame>{children}</Frame></PhoneChromeProvider>;
}
