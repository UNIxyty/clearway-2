"use client";

// The Clearway platform shell (redesign Phase 1, from Clearway Platform.dc):
// persistent left sidebar with expandable topics, a 68px collapsed rail
// (icon for every topic AND sub-item, tooltips via title), the user badge at
// the BOTTOM with the reduced account menu (identity + five account items —
// there is no top-right user menu anywhere any more), deep-context mode
// (context nav + back arrow to "All services"), role gating from the
// existing /api/admin/status check, and a small-screen top bar + drawer.
// Icons are CSS masks (vendored lucide SVGs) — the prototype crashed when an
// icon library mutated React-owned DOM on deep-context swaps; masks can't.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { clsx } from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import MaskIcon from "@/components/portal/Icon";
import ClientNavProgress from "@/components/portal/ClientNavProgress";
import { topicsForRole, type Role } from "@/components/portal/nav";
import AgentPanel, { useAgentPanel } from "@/components/agent/panel/AgentPanel";
import { useAgentContext } from "@/components/agent/panel/useAgentContext";
import { installFailedRequestTracker, subscribeHelpStream } from "@/components/help/helpApi";
import { Keycap, RingMark } from "@/components/agent/ui/primitives";
import AskAboutButton from "@/components/agent/ui/AskAboutButton";
import { useKeybinds } from "@/components/agent/ui/keybinds";
import { useViewer } from "@/components/agent/viewer/ViewerContext";
import DocumentViewer from "@/components/agent/viewer/DocumentViewer";

const AGENT_BASE = process.env.NEXT_PUBLIC_AGENT_BASE_URL || "/agent";

const COLLAPSE_KEY = "cw-shell-collapsed";
const OPEN_TOPICS_KEY = "cw-shell-open-topics";

export type DeepContext = {
  icon: string;
  code: string;
  sub?: string;
  backHref: string;
  items: Array<{ id: string; label: string; icon: string; href: string; active?: boolean }>;
};

export function useIdentity() {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("user");
  const [isDeveloper, setIsDeveloper] = useState(false);
  // Agent availability is a runtime allowlist check, not a role. It starts
  // false and only ever becomes true on an explicit yes, so a failed probe
  // leaves the agent invisible rather than flashing an entry point.
  const [hasAgent, setHasAgent] = useState(false);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((d) => d.preferences?.display_name && setName(d.preferences.display_name))
      .catch(() => {});
    // Existing admin check — never reimplemented (audit rule). A failed probe
    // means NOT admin and NOT developer (fail closed) — the Developer nav
    // group only ever appears on a confirmed developer flag.
    fetch("/api/admin/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { isAdmin: false, isDeveloper: false }))
      .then((d) => {
        setRole(d?.isAdmin ? "admin" : "user");
        setIsDeveloper(Boolean(d?.isDeveloper));
      })
      .catch(() => {
        setRole("user");
        setIsDeveloper(false);
      });
    fetch("/api/assistant/availability", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => setHasAgent(Boolean(d?.available)))
      .catch(() => setHasAgent(false));
  }, []);
  const display = name || email || "Signed in";
  const initials =
    display
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "??";
  return { email, display, initials, role, isDeveloper, hasAgent };
}

function NavButton({
  icon,
  label,
  active,
  showLabel,
  onClick,
  trailing,
  sub = false,
  panelOpen = false,
  dot = false,
}: {
  icon: string;
  label: string;
  active?: boolean;
  showLabel: boolean;
  onClick: () => void;
  trailing?: ReactNode;
  sub?: boolean;
  /** Ops Agent row while the panel is open on another page (design spec §5). */
  panelOpen?: boolean;
  /** Rail: a 7px amber dot instead of the count badge (§5). */
  dot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={clsx(
        "relative flex w-full cursor-pointer items-center gap-2.5 border-none text-left font-sans",
        sub ? "rounded-[7px] px-[9px] py-1.5 text-[13px]" : "rounded-[9px] px-[9px] py-2 text-[13.5px]",
        !showLabel && "justify-center",
        active ? "bg-cw-navActive font-bold text-cw-ink" : panelOpen ? "bg-cw-primaryTint font-semibold text-cw-primaryDeep" : "bg-transparent font-medium text-cw-body hover:bg-cw-hover"
      )}
    >
      <MaskIcon name={icon} size={sub ? 15 : 17} color={active || panelOpen ? "#1d4ed8" : "#6c7079"} />
      {showLabel && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {showLabel && trailing}
      {!showLabel && dot && <span className="absolute right-1.5 top-1 h-[7px] w-[7px] rounded-full bg-cw-amber" />}
    </button>
  );
}

function PortalShellInner({
  children,
  deepContext = null,
  crumb,
  title,
  subtitle,
  headerRight,
  wide = true,
  footer = true,
}: {
  children: ReactNode;
  deepContext?: DeepContext | null;
  crumb?: string;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  wide?: boolean;
  /** Full-viewport pages (developer inbox) suppress the site footer so their
      panes own the scroll instead of the page. */
  footer?: boolean;
}) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { email, display, initials, role, isDeveloper, hasAgent } = useIdentity();
  // The document viewer covers this page between the sidebar and the panel (§V2). Its breadcrumb names the page.
  const viewer = useViewer();
  useEffect(() => { viewer.setFrom(title ?? (pathname.startsWith("/agent") ? "Chat" : "Back")); }, [title, pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.body.style.overflow = viewer.open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [viewer.open]);
  // Persisted UI state is read in lazy initializers (typeof window guard for
  // SSR) so the sidebar renders its persisted collapsed/open state on the
  // FIRST client paint — no expand-flicker from a post-mount useEffect. The
  // shell still mounts per-page, so this is what keeps route changes visually
  // continuous.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [openTopics, setOpenTopics] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(["aip"]);
    try {
      const raw = JSON.parse(localStorage.getItem(OPEN_TOPICS_KEY) || "null");
      if (Array.isArray(raw)) return new Set(raw);
    } catch {
      /* first visit */
    }
    return new Set(["aip"]);
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navPending, startNavTransition] = useTransition();
  const [helpUnread, setHelpUnread] = useState(0);

  // Help centre plumbing: the unread badge, the last-failed-request tracker,
  // and the global shortcuts — ? opens help, ⇧? opens it pre-filled as a bug
  // report for the current page. Never while typing in a field.
  useEffect(() => {
    installFailedRequestTracker();
    let alive = true;
    const refresh = () =>
      fetch("/api/help/threads", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { threads: [] }))
        .then((d) => alive && setHelpUnread(
          (d.threads || []).reduce((n: number, t: { unread?: number }) => n + (t.unread ? 1 : 0), 0),
        ))
        .catch(() => {});
    refresh();
    const unsub = subscribeHelpStream(() => refresh());
    return () => { alive = false; unsub(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      // The design says ⇧? for the pre-filled bug report, but ? already needs
      // Shift on standard layouts, so the modifier that distinguishes the two
      // here is ⌘/Ctrl (documented in the guide strip and the docs).
      if (e.metaKey || e.ctrlKey) {
        router.push(`/help/new?type=bug&page=${encodeURIComponent(window.location.pathname)}`);
      } else {
        router.push(`/help?page=${encodeURIComponent(window.location.pathname)}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  const persistCollapsed = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {}
  };
  const toggleTopic = (id: string) =>
    setOpenTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(OPEN_TOPICS_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });

  const topics = useMemo(() => topicsForRole(role, isDeveloper, hasAgent), [role, isDeveloper, hasAgent]);
  const { open: agentOpenRaw, setOpen: setAgentOpen } = useAgentPanel();
  const kb = useKeybinds();
  // Knowledge base badge (§5): documents awaiting approval, approvers only.
  const [kbAwaiting, setKbAwaiting] = useState(0);
  useEffect(() => {
    if (!hasAgent || !isDeveloper) return;
    fetch(`${AGENT_BASE}/api/knowledge/stats`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setKbAwaiting(Number(d?.stats?.awaiting ?? 0)))
      .catch(() => {});
  }, [hasAgent, isDeveloper]);
  // "Open as side panel" from the full page (§7.2, ⌘⇧J) hands the thread over
  // through sessionStorage so the panel opens on the console page with it.
  const [agentOpenWith, setAgentOpenWith] = useState<string | null>(null);
  useEffect(() => {
    try {
      const id = sessionStorage.getItem("cw-agent-open-with");
      if (id !== null) { sessionStorage.removeItem("cw-agent-open-with"); setAgentOpenWith(id || null); setAgentOpen(true); }
    } catch { /* private mode */ }
  }, [setAgentOpen, pathname]);
  // ⌘J is inert without a grant: the shortcut must not reveal a capability the
  // user does not have.
  const agentOpen = hasAgent && agentOpenRaw;
  const agentContext = useAgentContext();

  // Internal navigations go through startTransition so navPending drives the
  // slim top progress bar (Next 14 App Router has no router events; the
  // transition's pending flag is the reliable signal). External (cross-app)
  // targets stay full navigations on purpose — no fake SPA bridge.
  const go = (href: string, external?: boolean) => {
    setDrawerOpen(false);
    if (external) window.location.assign(href);
    else startNavTransition(() => router.push(href));
  };
  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const showLabels = !collapsed;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const sidebarBody = (labels: boolean) => (
    <>
      {/* brand / context head */}
      {deepContext ? (
        <div className="flex-none border-b border-cw-border px-3 pb-3 pt-3.5">
          <button
            onClick={() => go(deepContext.backHref)}
            className={clsx(
              "flex w-full cursor-pointer items-center gap-2 rounded-lg border-none bg-transparent px-2 py-[7px] text-left font-sans text-[13px] font-semibold text-cw-muted hover:bg-cw-hover hover:text-cw-ink",
              !labels && "justify-center"
            )}
            title="All services"
          >
            <MaskIcon name="arrow-left" size={16} />
            {labels && <span>All services</span>}
          </button>
          {labels && (
            <div className="flex items-center gap-2.5 px-2 pt-2.5">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[#dbeafe]">
                <MaskIcon name={deepContext.icon} size={17} color="#1d4ed8" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold tracking-[0.02em]">{deepContext.code}</div>
                {deepContext.sub && <div className="truncate text-xs text-cw-muted">{deepContext.sub}</div>}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-[60px] flex-none items-center border-b border-cw-border px-3.5">
          {/* The real Clearway logo (shared brand asset) — full logo when
              expanded, the round mark alone on the 68px rail. */}
          {labels ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/clearway-logo.svg" alt="Clearway — Handling & Operations" className="h-[30px] w-auto select-none" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/clearway-mark.svg" alt="Clearway" className="mx-auto h-[26px] w-auto select-none" />
          )}
        </div>
      )}

      {/* nav — the ONLY zone that scrolls inside the pinned sidebar */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3.5 pt-2.5">
        {deepContext
          ? deepContext.items.map((item) => (
              <NavButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={item.active ?? isActive(item.href)}
                showLabel={labels}
                onClick={() => go(item.href)}
              />
            ))
          : topics.map((topic) => {
              const isAgentTopic = topic.id === "agent";
              const onAgentPage = isAgentTopic && pathname.startsWith("/agent");
              // Sub-items show while on an agent page (§5); elsewhere the topic folds like any other.
              const open = openTopics.has(topic.id) || onAgentPage;
              const items = (topic.items ?? []).filter((i) => (!i.adminOnly || role === "admin" || isDeveloper) && (!i.approverOnly || isDeveloper));
              const anyChildActive = items.some((i) => !i.external && isActive(i.href));
              return (
                <div key={topic.id} className="mb-0.5">
                  <NavButton
                    icon={topic.icon}
                    label={topic.label}
                    active={topic.href ? isActive(topic.href) : isAgentTopic ? onAgentPage : !open && anyChildActive}
                    panelOpen={isAgentTopic && agentOpen && !onAgentPage}
                    dot={isAgentTopic && isDeveloper && kbAwaiting > 0}
                    showLabel={labels}
                    onClick={() => (topic.href ? go(topic.href) : isAgentTopic && !onAgentPage ? setAgentOpen(!agentOpen) : toggleTopic(topic.id))}
                    trailing={
                      <>
                        {topic.keycap && <Keycap color={isAgentTopic && agentOpen && !onAgentPage ? "#1d4ed8" : undefined}>{isAgentTopic ? kb.label("open") : topic.keycap}</Keycap>}
                        {topic.items && !isAgentTopic ? (
                          <MaskIcon name={open ? "chevron-up" : "chevron-down"} size={14} color="#9aa0a8" />
                        ) : null}
                      </>
                    }
                  />
                  {topic.items && open && (
                    <div
                      className={clsx(
                        "mb-2 mt-0.5 flex flex-col gap-px",
                        labels ? "ml-[13px] border-l border-cw-border pl-[9px]" : ""
                      )}
                    >
                      {items.map((item) => (
                        <NavButton
                          key={item.id}
                          sub
                          icon={item.icon}
                          label={item.label}
                          active={!item.external && (item.href === "/agent" ? pathname === "/agent" || pathname.startsWith("/agent/t/") : isActive(item.href))}
                          showLabel={labels}
                          dot={item.badge === "kb-approvals" && isDeveloper && kbAwaiting > 0}
                          onClick={() => (item.id === "acc-signout" ? void signOut() : go(item.href, item.external))}
                          trailing={
                            item.badge === "kb-approvals" && isDeveloper && kbAwaiting > 0 ? (
                              <span className="rounded-[5px] bg-cw-amberTint px-1.5 py-px text-[11px] font-bold text-cw-amberDeep">{kbAwaiting}</span>
                            ) : item.external ? (
                              <MaskIcon name="arrow-up-right" size={13} color="#9aa0a8" />
                            ) : item.deep ? (
                              <MaskIcon name="chevron-right" size={13} color="#9aa0a8" />
                            ) : undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      {/* Ops Agent in a deep context (§5): a pinned block at the bottom of the nav. */}
      {deepContext && hasAgent && (
        <div className="flex-none px-2.5 pb-3">
          <button
            onClick={() => setAgentOpen(!agentOpen)}
            title={`Ops Agent · ${kb.label("open")}`}
            className={clsx("flex w-full cursor-pointer items-center gap-2 rounded-[9px] border-none bg-cw-primaryTint px-2.5 py-2 text-left font-sans text-[13px] font-semibold text-cw-primaryDeep", !labels && "justify-center")}
          >
            <RingMark size={14} color="#1d4ed8" dot={5} />
            {labels && <span className="min-w-0 flex-1 truncate">Ops Agent</span>}
            {labels && <Keycap>{kb.label("open")}</Keycap>}
          </button>
        </div>
      )}

      {/* Help & support — pinned in the sidebar FOOTER above the user badge,
          never in the main list and never a floating button (a FAB would sit
          on the wall console's controls and the AIP viewer's page controls).
          Present in every sidebar state: expanded, 68px rail, deep contexts,
          and the mobile drawer, because this block lives in sidebarBody. */}
      <div className="flex-none border-t border-cw-border px-2 pb-1 pt-2">
        <button
          onClick={() => go(`/help?page=${encodeURIComponent(pathname)}`)}
          title="Help & support"
          className={clsx(
            "relative flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] border border-cw-border bg-white px-[9px] py-2 text-left font-sans text-[13.5px] font-bold text-cw-ink hover:bg-cw-page",
            !labels && "justify-center"
          )}
        >
          <MaskIcon name="life-buoy" size={17} color="#2563eb" />
          {labels && <span className="min-w-0 flex-1 truncate">Help &amp; support</span>}
          {labels && helpUnread > 0 && (
            <span className="rounded-[8px] bg-cw-primary px-1.5 py-px font-mono text-[10px] font-bold text-white">{helpUnread}</span>
          )}
          {!labels && helpUnread > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full border-[1.5px] border-cw-sidebar bg-cw-primary" />
          )}
        </button>
        {labels && (
          <div className="flex items-center gap-[7px] px-2.5 pb-1 pt-1.5">
            <span className="rounded-[5px] border border-cw-border bg-white px-[5px] py-px font-mono text-[10px] font-bold text-cw-muted">?</span>
            <span className="text-[11.5px] text-cw-faint">anywhere opens help</span>
          </div>
        )}
      </div>

      {/* user badge (bottom, pinned): a plain IDENTITY display — no dropdown.
          Profile / Notifications / Stats / Guide / Sign out all live under
          the Account topic in the nav above; duplicating them here was
          confusing. Email shows via the title tooltip. */}
      <div className="flex-none border-t border-cw-border px-2 py-2">
        <div
          title={email || display}
          className={clsx(
            "flex w-full items-center gap-2 rounded-[9px] px-2 py-[7px] font-sans",
            !labels && "justify-center"
          )}
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-cw-primary text-[11.5px] font-bold text-white">
            {initials}
          </span>
          {labels && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{display}</span>
              <span
                className={clsx(
                  "block text-[11px] font-bold tracking-[0.05em]",
                  role === "admin" ? "text-cw-primaryDeep" : "text-cw-faint"
                )}
              >
                {role === "admin" ? "ADMIN" : "OPERATIONS"}
              </span>
            </span>
          )}
        </div>
        <button
          onClick={() => persistCollapsed(!collapsed)}
          className={clsx(
            "mt-1 hidden w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-none bg-transparent px-1.5 py-1.5 font-sans text-xs font-semibold text-cw-faint hover:bg-cw-hover hover:text-cw-ink lg:flex"
          )}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <MaskIcon name={collapsed ? "panel-left-open" : "panel-left-close"} size={15} />
          {labels && <span>Collapse</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-cw-page font-sans text-cw-ink">
      <ClientNavProgress pending={navPending} />
      {/* Panel animations, and the hover states its buttons borrow. */}
      <style>{`
        @keyframes cwcaret{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes cwpulse{0%,100%{opacity:.35}50%{opacity:1}}
        @keyframes cwfadein{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
        .cw-fade{animation:cwfadein .18s ease}
        .cw-hover-surface:hover{background:#f5f6f7 !important}
        @media (prefers-reduced-motion: reduce){.cw-fade{animation:none}}
      `}</style>
      {/* desktop sidebar — pinned to the viewport (sticky + h-screen inside
          the min-h-screen flex row): head and user badge stay put, only the
          nav list scrolls internally, only the content column scrolls the
          page. Holds in expanded, 68px rail and deep-context modes. */}
      <div
        data-cw-sidebar
        className={clsx(
          "sticky top-0 hidden h-screen flex-none flex-col border-r border-cw-border bg-cw-sidebar transition-[width] duration-150 lg:flex",
          collapsed ? "w-[68px]" : "w-[248px]"
        )}
      >
        {sidebarBody(showLabels)}
      </div>

      {/* mobile drawer + scrim */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-[rgba(23,24,28,.42)] lg:hidden" onClick={() => setDrawerOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-cw-border bg-cw-sidebar shadow-[0_18px_50px_rgba(16,18,22,.25)] lg:hidden">
            {sidebarBody(true)}
          </div>
        </>
      )}

      {/* main */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* small-screen top bar */}
        <div className="sticky top-0 z-10 flex h-[54px] flex-none items-center gap-3 border-b border-cw-border bg-white px-3.5 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border border-cw-border bg-white"
            aria-label="Open navigation"
          >
            <MaskIcon name="menu" size={18} color="#3a3d44" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/clearway-logo.svg" alt="Clearway" className="h-6 w-auto select-none" />
          <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-cw-primary text-[11px] font-bold text-white">
            {initials}
          </span>
        </div>

        {/* page header */}
        {title && (
          <div className="sticky top-0 z-[5] hidden items-end justify-between gap-6 border-b border-cw-border bg-[rgba(251,251,252,.92)] px-8 pb-[15px] pt-4 backdrop-blur-[6px] lg:flex">
            <div className="min-w-0">
              {crumb && <div className="mb-[5px] font-mono text-xs text-cw-faint">{crumb}</div>}
              <h1 className="m-0 text-[25px] font-extrabold tracking-[-0.02em]">{title}</h1>
              {subtitle && <p className="m-0 mt-[5px] max-w-[720px] text-sm leading-normal text-cw-muted">{subtitle}</p>}
            </div>
            {(headerRight || (hasAgent && agentContext && !agentOpen)) && (
              <div className="flex flex-none items-center gap-2">
                {hasAgent && agentContext && !agentOpen && <AskAboutButton label={agentContext.label} />}
                {headerRight}
              </div>
            )}
          </div>
        )}

        <div className={clsx("min-h-0 flex-1", !wide && "mx-auto w-full max-w-[1100px]")}>{children}</div>

        {footer && (
        <div className="flex items-center gap-3.5 border-t border-cw-border bg-white px-8 py-[18px]">
          <span className="flex-1 text-[12.5px] text-cw-faint">
            Data sourced from official AIP publications. For operational use only.
          </span>
          <span className="text-[11.5px] text-cw-faint">Built by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/verxyl-footer.png"
            srcSet="/brand/verxyl-footer.png 1x, /brand/verxyl-footer@2x.png 2x, /brand/verxyl-footer@3x.png 3x"
            alt="Verxyl"
            className="h-[22px] w-auto opacity-85"
          />
        </div>
        )}
      </div>
      {/* The agent panel. Rendered only for allowlisted users — hasAgent is the
          same runtime probe that gates the nav entry, so a user without a grant
          gets no panel, no shortcut and no trace of it. */}
      {hasAgent && (
        <AgentPanel open={agentOpen && !viewer.panelClosed} onClose={() => setAgentOpen(false)} context={agentContext} initials={initials} initialConversationId={agentOpenWith} />
      )}
      {hasAgent && <DocumentViewer onAskAbout={() => setAgentOpen(true)} />}
    </div>
  );
}

// The ViewerProvider lives in the root layout (app/layout.tsx) so page
// components that render this shell — and call useOpenDocument above it —
// share one viewer with the shell and the panel.
export default function PortalShell(props: Parameters<typeof PortalShellInner>[0]) {
  return <PortalShellInner {...props} />;
}
