"use client";

// The Clearway portal shell (portal redesign, stage 1 — "Portal Screen" in the design project): a 248px sidebar (a
// 64px icon rail between 900 and 1199px, or when collapsed; a 280px drawer below 900), a 56px top bar (breadcrumb,
// page search ⌘K, theme, Ops Agent ⌘J), a 48px footer and the 400px agent panel. Mounted ONCE in the root layout and
// kept across navigation (portal foundations 3.1): only the page changes. Widths and the rail are CSS (globals.css,
// "Portal shell"), so the server's markup is right at every width and nothing re-lays-out after load. Icons are CSS
// masks (vendored lucide SVGs) — the prototype crashed when an icon library mutated React-owned DOM on deep-context
// swaps; masks can't.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { clsx } from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import MaskIcon from "@/components/portal/Icon";
import ClientNavProgress from "@/components/portal/ClientNavProgress";
import { NAV_TOPICS, topicsForRole, type Role } from "@/components/portal/nav";
import { ClearwayLogo, ClearwayMark } from "@/components/portal/ClearwayLogo";
import TopSearch, { pagesSource } from "@/components/portal/TopSearch";
import ThemeMenu from "@/components/portal/ThemeMenu";
import { adoptAccountChoice } from "@/components/portal/theme";
import { adoptAccountSettings, useLocalSettings } from "@/components/portal/user-settings";
import AgentPanel, { useAgentPanel } from "@/components/agent/panel/AgentPanel";
import { SearchWatcher, useAgentContext } from "@/components/agent/panel/useAgentContext";
import { installFailedRequestTracker, subscribeHelpStream } from "@/components/help/helpApi";
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

// Portal foundations 3.1 — one shell. The frame (sidebar, mobile bar, identity, badges, the agent panel and the
// document viewer) is mounted ONCE, by <PortalFrame> in the root layout, and survives every navigation: only the
// content changes, the way the wall console keeps its shell and swaps the page (opsboard-react/src/router.js).
// Pages keep rendering <PortalShell title=… crumb=…>; inside the frame that renders only the page's header, content
// and footer, and tells the frame its title and deep-context nav.
type PageMeta = { title?: string; deepContext?: DeepContext | null };
type FrameApi = {
  setPage: (meta: PageMeta | null) => void;
  hasAgent: boolean;
  agentContext: ReturnType<typeof useAgentContext>;
  agentOpen: boolean;
};
const FrameContext = createContext<FrameApi | null>(null);
// Layout effect in the browser (the sidebar switches to a page's deep nav before paint); plain effect on the server.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const ROLE_LABEL: Record<"developer" | "admin" | "user", string> = { developer: "DEVELOPER", admin: "ADMIN", user: "USER" };
const IDENTITY_CACHE = "cw-shell-identity";
type IdentityState = { email: string | null; name: string | null; role: Role | null; isDeveloper: boolean | null; hasAgent: boolean | null };

/**
 * Who is signed in, their role, and whether they have the agent. Each starts UNKNOWN (null) — the shell shows skeleton
 * slots, never a placeholder role (§4.1) — and resolves from the existing checks. Within a browser tab the last answer
 * is remembered (sessionStorage) and applied before the first paint after hydration, so later pages do not flash
 * skeletons; the live checks still run and correct it.
 */
export function useIdentity() {
  const [s, setS] = useState<IdentityState>({ email: null, name: null, role: null, isDeveloper: null, hasAgent: null });
  useIsoLayoutEffect(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(IDENTITY_CACHE) || "null") as Partial<IdentityState> | null;
      if (cached) setS((prev) => ({ ...prev, ...cached }));
    } catch { /* first page in this tab */ }
  }, []);
  useEffect(() => {
    const merge = (part: Partial<IdentityState>) => setS((prev) => {
      const next = { ...prev, ...part };
      try { if (next.role !== null && next.hasAgent !== null) sessionStorage.setItem(IDENTITY_CACHE, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => merge({ email: data.user?.email ?? null })).catch(() => {});
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((d) => {
        if (d.preferences?.display_name) merge({ name: d.preferences.display_name });
        // The account's appearance choice follows the person between devices (portal redesign §1.3), and so do their
        // settings: table density, motion, pinned tabs (stage 4).
        adoptAccountChoice(d.preferences?.theme);
        adoptAccountSettings(d.preferences);
      })
      .catch(() => {});
    // Existing admin check — never reimplemented (audit rule). A failed probe means NOT admin and NOT developer
    // (fail closed): the Admin and Developer groups only appear on a confirmed answer.
    fetch("/api/admin/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { isAdmin: false, isDeveloper: false }))
      .then((d) => merge({ role: d?.isAdmin ? "admin" : "user", isDeveloper: Boolean(d?.isDeveloper) }))
      .catch(() => merge({ role: "user", isDeveloper: false }));
    // Agent availability is a runtime allowlist check, not a role; a failed probe leaves the agent invisible.
    fetch("/api/assistant/availability", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => merge({ hasAgent: Boolean(d?.available) }))
      .catch(() => merge({ hasAgent: false }));
  }, []);
  const display = s.name || s.email || "";
  const initials = display.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return {
    email: s.email,
    display,
    initials,
    role: s.role ?? ("user" as Role),
    roleKnown: s.role !== null,
    isDeveloper: Boolean(s.isDeveloper),
    hasAgent: Boolean(s.hasAgent),
    agentKnown: s.hasAgent !== null,
  };
}

const railNow = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(min-width: 900px) and (max-width: 1199px)").matches ||
    (window.matchMedia("(min-width: 1200px)").matches && document.documentElement.getAttribute("data-sidebar") === "rail"));
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const on = () => setNarrow(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

function Shimmer({ w, h = 10, round = 4 }: { w: number | string; h?: number; round?: number }) {
  return <span aria-hidden className="cw-shimmer inline-block flex-none" style={{ width: w, height: h, borderRadius: round }} />;
}

/** One sidebar row (§4: 36px group rows, 32px child rows indented 22px). In the rail only the icon shows. */
function NavRow({
  icon, label, active, emphasis, child = false, onClick, trailing, railDot = false, panelOpen = false, title,
}: {
  icon: string; label: string; active?: boolean; emphasis?: boolean; child?: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  trailing?: ReactNode; railDot?: boolean; panelOpen?: boolean; title?: string;
}) {
  const on = active || emphasis || panelOpen;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-current={active ? "page" : undefined}
      data-emph={emphasis && !active ? "1" : undefined}
      className={clsx(
        "cw-item relative flex min-w-0 flex-none cursor-pointer items-center gap-2.5 rounded-[8px] border-none text-left font-sans outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]",
        child ? "ml-[22px] h-8 w-[calc(100%-22px)] px-2.5 text-[13.5px]" : "h-9 w-full px-2.5 text-[14px]",
        active ? "bg-cw-bg-active" : panelOpen ? "bg-cw-primary-tint" : "bg-transparent hover:bg-cw-bg-hover",
        on ? "font-bold text-cw-text" : "font-medium text-cw-text-body hover:text-cw-text",
      )}
    >
      <MaskIcon name={icon} size={child ? 15 : 17} color={on ? "var(--cw-text-link)" : "var(--cw-text-muted)"} />
      <span className="cw-full-only min-w-0 flex-1 truncate">{label}</span>
      {trailing && <span className="cw-full-only flex flex-none items-center gap-1.5">{trailing}</span>}
      {railDot && <span className="cw-rail-only absolute right-2 top-1.5 h-[7px] w-[7px] rounded-full bg-cw-warning" />}
    </button>
  );
}

/** Rail flyout: a group's pages next to its icon (the rail shows groups only, §4.4). */
function RailFlyout({ anchor, title, items, onGo, onClose }: { anchor: DOMRect; title: string; items: Array<{ id: string; label: string; icon: string; active: boolean; external?: boolean; onClick: () => void }>; onGo: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" aria-label={title} data-shell-chrome className="fixed z-[45] w-[232px] rounded-[12px] border border-cw-border bg-cw-bg-raised p-1.5 shadow-cw-pop" style={{ left: anchor.right + 8, top: Math.min(anchor.top, window.innerHeight - 48 - items.length * 34) }}>
      <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-cw-text-muted">{title}</div>
      {items.map((i) => (
        <button key={i.id} type="button" role="menuitem" onClick={() => { onGo(); i.onClick(); }}
          className={clsx("flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-[8px] border-none px-2.5 text-left font-sans text-[13.5px] outline-none hover:bg-cw-bg-hover focus-visible:bg-cw-bg-hover", i.active ? "bg-cw-bg-active font-bold text-cw-text" : "bg-transparent font-medium text-cw-text-body")}>
          <MaskIcon name={i.icon} size={15} color={i.active ? "var(--cw-text-link)" : "var(--cw-text-muted)"} />
          <span className="min-w-0 flex-1 truncate">{i.label}</span>
          {i.external && <MaskIcon name="arrow-up-right" size={13} color="var(--cw-text-muted)" />}
        </button>
      ))}
    </div>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  // What the current page tells the frame (its title, and a deep-context nav if it has one). Set by <PortalShell>.
  const [page, setPage] = useState<PageMeta | null>(null);
  const deepContext = page?.deepContext ?? null;
  const title = page?.title;
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { email, display, initials, role, roleKnown, isDeveloper, hasAgent, agentKnown } = useIdentity();
  const narrow = useNarrow();
  // The document viewer covers this page between the sidebar and the panel (§V2). Its breadcrumb names the page.
  const viewer = useViewer();
  useEffect(() => { viewer.setFrom(title ?? (pathname.startsWith("/agent") ? "Chat" : "Back")); }, [title, pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.body.style.overflow = viewer.open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [viewer.open]);
  // Collapsed (user choice, ≥1200px only): data-sidebar on <html>, set before first paint by the head script and read
  // by the CSS; this state only drives the button's own label.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(document.documentElement.getAttribute("data-sidebar") === "rail"); }, []);
  const [openTopics, setOpenTopics] = useState<Set<string>>(() => new Set(["aip"]));
  useEffect(() => {
    try { const raw = JSON.parse(localStorage.getItem(OPEN_TOPICS_KEY) || "null"); if (Array.isArray(raw)) setOpenTopics(new Set(raw)); } catch { /* first visit */ }
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flyout, setFlyout] = useState<{ topic: string; rect: DOMRect } | null>(null);
  const [navPending, startNavTransition] = useTransition();
  const [helpUnread, setHelpUnread] = useState(0);

  // Help centre plumbing: the unread badge, the last-failed-request tracker, and the global shortcuts — ? opens help,
  // ⌘/Ctrl+? opens it pre-filled as a bug report for the current page. Never while typing in a field.
  useEffect(() => {
    installFailedRequestTracker();
    let alive = true;
    const refresh = () =>
      fetch("/api/help/threads", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { threads: [] }))
        .then((d) => alive && setHelpUnread((d.threads || []).reduce((n: number, t: { unread?: number }) => n + (t.unread ? 1 : 0), 0)))
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
      if (e.metaKey || e.ctrlKey) router.push(`/help/new?type=bug&page=${encodeURIComponent(window.location.pathname)}`);
      else router.push(`/help?page=${encodeURIComponent(window.location.pathname)}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.setAttribute("data-sidebar", "rail"); else document.documentElement.removeAttribute("data-sidebar");
    try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* private mode */ }
  };
  const toggleTopic = (id: string) =>
    setOpenTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(OPEN_TOPICS_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });

  // Until the role is known the role-gated groups are skeleton slots, so nothing jumps when it arrives (§4.1).
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
  // Flight intake / Agent mailbox (§I3, §M1): Needs attention counts, and whether the mailbox row shows at all.
  const [intakeNeeds, setIntakeNeeds] = useState(0);
  const [mailbox, setMailbox] = useState<{ allowed: boolean; needs: number }>({ allowed: false, needs: 0 });
  useEffect(() => {
    if (!hasAgent) return;
    let stop = false;
    const load = async () => {
      const r = await fetch(`${AGENT_BASE}/api/intake/requests?tab=needs`, { credentials: "same-origin", cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!stop && r?.counts) setIntakeNeeds(Number(r.counts.needs ?? 0));
      const a = await fetch(`${AGENT_BASE}/api/mailbox/access`, { credentials: "same-origin", cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (stop || !a?.allowed) { if (!stop) setMailbox({ allowed: false, needs: 0 }); return; }
      const o = await fetch(`${AGENT_BASE}/api/mailbox/overview`, { credentials: "same-origin", cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!stop) setMailbox({ allowed: true, needs: Number(o?.counts?.needs ?? 0) });
    };
    void load(); const t = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [hasAgent, pathname]);
  // "Open as side panel" from the full page (§7.2, ⌘⇧J) hands the thread over through sessionStorage.
  const [agentOpenWith, setAgentOpenWith] = useState<string | null>(null);
  useEffect(() => {
    try {
      const id = sessionStorage.getItem("cw-agent-open-with");
      if (id !== null) { sessionStorage.removeItem("cw-agent-open-with"); setAgentOpenWith(id || null); setAgentOpen(true); }
    } catch { /* private mode */ }
  }, [setAgentOpen, pathname]);
  // ⌘J is inert without a grant: the shortcut must not reveal a capability the user does not have.
  const agentOpen = hasAgent && agentOpenRaw;
  const [search, setSearch] = useState("");
  const agentContext = useAgentContext(search);
  const { pins } = useLocalSettings();

  // Internal navigations go through startTransition so navPending drives the slim top progress bar. External
  // (cross-app) targets stay full navigations on purpose.
  const go = (href: string, external?: boolean) => {
    setDrawerOpen(false);
    setFlyout(null);
    if (external) window.location.assign(href);
    else startNavTransition(() => router.push(href));
  };
  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    try { sessionStorage.removeItem(IDENTITY_CACHE); } catch { /* private mode */ }
    window.location.href = "/login";
  }

  // Only the most specific item is active: on /aip/service-status that is "Service status", not "Airport search".
  const navHrefs = useMemo(
    () => [...topics.flatMap((t) => [t.href, ...(t.items ?? []).map((i) => i.href)]), ...(deepContext?.items ?? []).map((i) => i.href)]
      .filter((h): h is string => typeof h === "string" && h.startsWith("/")).map((h) => h.split("?")[0]),
    [topics, deepContext],
  );
  const covers = (href: string) => href !== "/" && (pathname === href || pathname.startsWith(`${href}/`));
  const activeHref = useMemo(() => navHrefs.filter(covers).sort((a, b) => b.length - a.length)[0] ?? null, [navHrefs, pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const isActive = (href: string) => (href === "/" ? pathname === "/" : href.split("?")[0] === activeHref);
  const itemActive = (item: { href: string; external?: boolean }) => !item.external && (item.href === "/agent" ? pathname === "/agent" || pathname.startsWith("/agent/t/") : isActive(item.href));
  const visibleItems = (topic: (typeof topics)[number]) => (topic.items ?? []).filter((i) => (!i.adminOnly || role === "admin" || isDeveloper) && (!i.approverOnly || isDeveloper) && (!i.mailboxOnly || mailbox.allowed));

  // The group holding the current page is open (§4); the person can still fold it.
  const currentTopic = topics.find((t) => (t.href && isActive(t.href)) || visibleItems(t).some(itemActive)) ?? null;
  useEffect(() => {
    if (currentTopic?.items && !openTopics.has(currentTopic.id)) setOpenTopics((prev) => new Set(prev).add(currentTopic.id));
  }, [currentTopic?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Breadcrumb (§4 top bar): group › page.
  const crumbItem = currentTopic ? visibleItems(currentTopic).find(itemActive) : null;
  const crumbA = deepContext ? "All services" : currentTopic ? (currentTopic.href ? "Portal" : currentTopic.label) : pathname.startsWith("/help") ? "Help & support" : "Portal";
  const crumbB = title || crumbItem?.label || currentTopic?.label || "";

  const searchSources = useMemo(() => [pagesSource(topics)], [topics]);

  const badge = (n: number, tone: "warn" | "danger" | "primary") => (
    <span className={clsx("inline-flex h-[18px] min-w-5 items-center justify-center rounded-[9px] px-[5px] font-mono text-[11px] font-semibold",
      tone === "warn" ? "bg-cw-warning-tint text-cw-warning-text" : tone === "danger" ? "bg-cw-danger-solid text-cw-text-on-primary" : "bg-cw-primary text-cw-text-on-primary")}>{n}</span>
  );

  const sidebarBody = (inDrawer: boolean) => (
    <>
      {/* brand / context head — 56px, level with the top bar */}
      {deepContext ? (
        <div className="flex-none border-b border-cw-border px-3 pb-3 pt-3">
          <button
            type="button"
            onClick={() => go(deepContext.backHref)}
            className="cw-item flex h-9 w-full cursor-pointer items-center gap-2 rounded-[8px] border-none bg-transparent px-2.5 text-left font-sans text-[13px] font-semibold text-cw-text-muted hover:bg-cw-bg-hover hover:text-cw-text"
            title="All services"
          >
            <MaskIcon name="arrow-left" size={16} />
            <span className="cw-full-only">All services</span>
          </button>
          <div className="cw-full-only items-center gap-2.5 px-2 pt-2.5" style={{ display: "flex" }}>
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-cw-primary-wash">
              <MaskIcon name={deepContext.icon} size={17} color="var(--cw-text-link)" />
            </div>
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold tracking-[0.02em]">{deepContext.code}</div>
              {deepContext.sub && <div className="truncate text-xs text-cw-text-muted">{deepContext.sub}</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-14 flex-none items-center gap-2.5 border-b border-cw-border px-4 text-cw-text">
          <Link href="/dashboard" className="cw-full-only items-center text-cw-text" style={{ display: "flex" }} onClick={() => setDrawerOpen(false)} aria-label="Clearway — Dashboard">
            <ClearwayLogo height={28} />
          </Link>
          {!inDrawer && <Link href="/dashboard" className="cw-rail-only mx-auto items-center text-cw-text" aria-label="Clearway — Dashboard"><ClearwayMark size={30} /></Link>}
          {inDrawer && (
            <button type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} className="ml-auto flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[8px] border-none bg-transparent text-cw-text-muted hover:bg-cw-bg-hover">
              <MaskIcon name="x" size={17} />
            </button>
          )}
        </div>
      )}

      {/* nav — the ONLY zone that scrolls inside the pinned sidebar */}
      <nav aria-label="Portal" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-2.5">
        {deepContext
          ? deepContext.items.map((item) => (
              <NavRow key={item.id} icon={item.icon} label={item.label} active={item.active ?? isActive(item.href)} onClick={() => go(item.href)} />
            ))
          : NAV_TOPICS.map((topic) => {
              // A role-gated group whose answer is not in yet holds a skeleton slot (§4.1); once known it is either
              // there or absent — never a gap.
              const gated = topic.roles.length < 3 && !topic.roles.includes("user") ? "role" : topic.developerOnly ? "role" : topic.agentOnly ? "agent" : null;
              if ((gated === "role" && !roleKnown) || (gated === "agent" && !agentKnown)) {
                return (
                  <div key={topic.id} aria-hidden className="cw-item flex h-9 flex-none items-center gap-2.5 px-2.5">
                    <Shimmer w={18} h={18} round={5} />
                    <span className="cw-full-only"><Shimmer w={topic.id === "admin" ? 64 : 84} /></span>
                  </div>
                );
              }
              if (!topics.includes(topic)) return null;
              const isAgentTopic = topic.id === "agent";
              const onAgentPage = isAgentTopic && pathname.startsWith("/agent");
              // Every agent page is reachable at all times: the agent group's pages always show; its row opens/closes
              // the panel (⌘J) instead of folding the list.
              const open = isAgentTopic || openTopics.has(topic.id);
              const items = visibleItems(topic);
              const childActive = items.some(itemActive);
              const selfActive = topic.href ? isActive(topic.href) : false;
              const dot = (isAgentTopic && isDeveloper && kbAwaiting > 0) || items.some((i) => (i.badge === "intake-attention" && intakeNeeds > 0) || (i.badge === "mailbox-attention" && mailbox.needs > 0));
              const onTopic = (e: React.MouseEvent<HTMLButtonElement>) => {
                if (topic.href) return go(topic.href);
                if (!inDrawer && railNow()) { const rect = e.currentTarget.getBoundingClientRect(); return setFlyout((f) => (f?.topic === topic.id ? null : { topic: topic.id, rect })); }
                if (isAgentTopic && !onAgentPage) return setAgentOpen(!agentOpen);
                toggleTopic(topic.id);
              };
              return (
                <div key={topic.id} className="flex flex-col gap-0.5">
                  <NavRow
                    icon={topic.icon === "ring-mark" ? "bot" : topic.icon}
                    label={topic.label}
                    active={selfActive}
                    emphasis={childActive}
                    panelOpen={isAgentTopic && agentOpen && !onAgentPage}
                    railDot={dot}
                    onClick={onTopic}
                    trailing={
                      <>
                        {isAgentTopic && <span className="font-mono text-[11px] font-medium text-cw-text-muted">{kb.label("open")}</span>}
                        {topic.items && !isAgentTopic && <MaskIcon name={open ? "chevron-up" : "chevron-down"} size={14} color="var(--cw-text-muted)" />}
                      </>
                    }
                  />
                  {topic.items && open && (
                    <div className={clsx("flex flex-col gap-0.5", !inDrawer && "cw-full-only")} style={{ display: "flex" }}>
                      {items.map((item) => {
                        const count = item.badge === "kb-approvals" && isDeveloper ? kbAwaiting : item.badge === "intake-attention" ? intakeNeeds : item.badge === "mailbox-attention" ? mailbox.needs : 0;
                        return (
                          <NavRow
                            key={item.id}
                            child
                            icon={item.icon}
                            label={item.label}
                            active={itemActive(item)}
                            onClick={() => (item.id === "acc-signout" ? void signOut() : go(item.href, item.external))}
                            trailing={
                              count > 0 ? badge(count, item.badge === "kb-approvals" ? "warn" : "danger")
                              : item.mailboxOnly ? <MaskIcon name="lock" size={12} color="var(--cw-text-muted)" />
                              : item.external ? <MaskIcon name="arrow-up-right" size={13} color="var(--cw-text-muted)" />
                              : item.deep ? <MaskIcon name="chevron-right" size={13} color="var(--cw-text-muted)" />
                              : undefined
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
      </nav>

      {/* Ops Agent in a deep context (§5): a pinned block at the bottom of the nav. */}
      {deepContext && hasAgent && (
        <div className="flex-none px-2.5 pb-3">
          <NavRow icon="bot" label="Ops Agent" panelOpen title={`Ops Agent · ${kb.label("open")}`} onClick={() => setAgentOpen(!agentOpen)}
            trailing={<span className="font-mono text-[11px] font-medium text-cw-text-link">{kb.label("open")}</span>} />
        </div>
      )}

      {/* Help & support — pinned at the foot of the sidebar, in every state (never a floating button). */}
      <div className="flex flex-none flex-col gap-0.5 border-t border-cw-border px-2.5 py-2.5">
        <NavRow
          icon="life-buoy"
          label="Help & support"
          active={pathname.startsWith("/help")}
          railDot={helpUnread > 0}
          onClick={() => go(`/help?page=${encodeURIComponent(pathname)}`)}
          trailing={helpUnread > 0 ? badge(helpUnread, "primary") : <kbd className="rounded-[4px] border border-cw-border-control px-[5px] font-mono text-[11px] font-medium text-cw-text-muted">?</kbd>}
        />
      </div>

      {/* The account line: who is signed in and their role. A skeleton until both are known — never a placeholder
          role (§4.1). Profile and sign-out live under Account above. */}
      <div className="flex flex-none items-center gap-2.5 border-t border-cw-border px-4 py-3" title={email || display}>
        {roleKnown && display ? (
          <>
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-cw-primary text-[12px] font-bold text-cw-text-on-primary">{initials}</span>
            <span className="cw-full-only min-w-0 flex-1 flex-col gap-0.5" style={{ display: "flex" }}>
              <span className="truncate text-[13.5px] font-semibold text-cw-text">{display}</span>
              <span className="text-[10.5px] font-bold tracking-[0.08em] text-cw-text-link">{ROLE_LABEL[isDeveloper ? "developer" : role === "admin" ? "admin" : "user"]}</span>
            </span>
          </>
        ) : (
          <>
            <span aria-hidden className="h-8 w-8 flex-none rounded-full bg-cw-skeleton" />
            <span aria-hidden className="cw-full-only flex-1 flex-col gap-1.5" style={{ display: "flex" }}>
              <Shimmer w={110} />
              <span className="block h-2 w-[54px] rounded-[4px] bg-cw-skeleton" />
            </span>
          </>
        )}
        {!inDrawer && (
          <button type="button" onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="cw-xl-only flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-[8px] border-none bg-transparent text-cw-text-muted hover:bg-cw-bg-hover hover:text-cw-text">
            <MaskIcon name={collapsed ? "panel-left-open" : "panel-left-close"} size={16} />
          </button>
        )}
      </div>
    </>
  );

  const flyoutTopic = flyout ? topics.find((t) => t.id === flyout.topic) : null;
  const frameApi = useMemo<FrameApi>(() => ({ setPage, hasAgent, agentContext, agentOpen }), [hasAgent, agentContext, agentOpen]);
  return (
    <FrameContext.Provider value={frameApi}>
      <SearchWatcher onChange={setSearch} />
    <div className="flex min-h-screen bg-cw-bg-page font-sans text-cw-text">
      <ClientNavProgress pending={navPending} />
      {/* Panel animations, and the hover states its buttons borrow. */}
      <style>{`
        @keyframes cwcaret{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes cwpulse{0%,100%{opacity:.35}50%{opacity:1}}
        @keyframes cwfadein{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
        .cw-fade{animation:cwfadein .18s ease}
        .cw-hover-surface:hover{background:var(--cw-bg-sunken) !important}
        @media (prefers-reduced-motion: reduce){.cw-fade{animation:none}}
      `}</style>
      {/* Desktop sidebar — pinned to the viewport: head and account line stay put, only the nav list scrolls. */}
      <aside data-cw-sidebar data-shell-chrome className="cw-side sticky top-0 flex h-screen flex-none flex-col border-r border-cw-border bg-cw-bg-sidebar">
        {sidebarBody(false)}
      </aside>
      {flyout && flyoutTopic && (
        <RailFlyout
          anchor={flyout.rect}
          title={flyoutTopic.label}
          onClose={() => setFlyout(null)}
          onGo={() => setFlyout(null)}
          items={[
            ...(flyoutTopic.id === "agent" && hasAgent ? [{ id: "agent-panel", label: agentOpen ? "Close the panel" : "Open the panel", icon: "bot", active: false, onClick: () => setAgentOpen(!agentOpen) }] : []),
            ...visibleItems(flyoutTopic).map((i) => ({ id: i.id, label: i.label, icon: i.icon, active: itemActive(i), external: i.external, onClick: () => (i.id === "acc-signout" ? void signOut() : go(i.href, i.external)) })),
          ]}
        />
      )}

      {/* Narrow screens (<900px): the sidebar is a 280px drawer over a scrim. */}
      {drawerOpen && (
        <>
          <div className="cw-narrow-only fixed inset-0 z-40 bg-cw-bg-scrim" onClick={() => setDrawerOpen(false)} />
          <div data-shell-chrome className="cw-narrow-only fixed inset-y-0 left-0 z-50 w-[280px] flex-col border-r border-cw-border bg-cw-bg-sidebar shadow-cw-pop" style={{ display: "flex" }}>
            {sidebarBody(true)}
          </div>
        </>
      )}

      {/* main */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Top bar (§4): 56px, sticky — breadcrumb, page search, theme, Ops Agent. */}
        <header data-shell-chrome className="sticky top-0 z-20 flex h-14 flex-none items-center gap-3 border-b border-cw-border bg-cw-bg-page" style={{ padding: "0 var(--cw-page-pad)" }}>
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"
            className="cw-narrow-only flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[10px] border border-cw-border-control bg-transparent text-cw-text">
            <MaskIcon name="menu" size={18} />
          </button>
          <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-cw-text-muted">
            <span className="cw-wide-only">{crumbA}</span>
            {crumbB && <><span className="cw-wide-only" style={{ display: "inline-flex" }}><MaskIcon name="chevron-right" size={13} /></span><span className="truncate font-semibold text-cw-text">{crumbB}</span></>}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            {!narrow && <TopSearch sources={searchSources} narrow={false} onGo={(r) => go(r.href, r.external)} />}
            {/* Pinned tabs (Settings → Customisation): beside search at full width; they hide on the rail and below (§4.4). */}
            {pins.length > 0 && (
              <nav aria-label="Pinned" className="hidden flex-none items-center gap-1 min-[1200px]:flex">
                {pins.map((p) => {
                  const on = pathname === p.href || pathname.startsWith(`${p.href}/`);
                  const external = p.href.startsWith("/digital-wall");
                  return (
                    <a key={p.href} href={p.href} aria-current={on ? "page" : undefined} title={p.label}
                      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); go(p.href, external); }}
                      className={clsx("flex h-[30px] max-w-[150px] items-center gap-1.5 rounded-[8px] border px-2.5 text-[12.5px] font-semibold no-underline outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]",
                        on ? "border-cw-primary-tint-border bg-cw-bg-selected text-cw-text-link" : "border-cw-border bg-cw-bg-surface text-cw-text hover:bg-cw-bg-hover")}>
                      <MaskIcon name={p.icon} size={13} color={on ? "var(--cw-text-link)" : "var(--cw-text-muted)"} />
                      <span className={clsx("truncate", p.kind === "airport" && "font-mono")}>{p.label}</span>
                    </a>
                  );
                })}
              </nav>
            )}
          </div>
          {narrow && <TopSearch sources={searchSources} narrow onGo={(r) => go(r.href, r.external)} />}
          <ThemeMenu />
          {!agentKnown ? (
            <span aria-hidden className="cw-shimmer h-9 w-9 flex-none rounded-[10px] min-[900px]:w-[132px]" />
          ) : hasAgent ? (
            <button
              type="button"
              onClick={() => setAgentOpen(!agentOpen)}
              aria-pressed={agentOpen}
              title={`Ops Agent · ${kb.label("open")}`}
              className={clsx(
                "flex h-9 flex-none cursor-pointer items-center gap-2 whitespace-nowrap rounded-[10px] border px-2.5 font-sans text-[13.5px] font-semibold min-[900px]:px-3",
                agentOpen ? "border-cw-primary-tint-border bg-cw-primary-tint text-cw-text-link" : "border-cw-border-control bg-cw-bg-surface text-cw-text hover:bg-cw-bg-hover",
              )}
            >
              <MaskIcon name="bot" size={16} />
              <span className="cw-wide-only items-center gap-2" style={{ display: "inline-flex" }}>Ops Agent<span className="font-mono text-[11px] font-medium opacity-80">{kb.label("open")}</span></span>
            </button>
          ) : null}
        </header>

        {children}
      </div>
      {/* The agent panel. Rendered only for allowlisted users — hasAgent is the same runtime probe that gates the nav
          entry, so a user without a grant gets no panel, no shortcut and no trace of it. */}
      {hasAgent && (
        <AgentPanel open={agentOpen && !viewer.panelClosed} onClose={() => setAgentOpen(false)} context={agentContext} initials={initials} initialConversationId={agentOpenWith} />
      )}
      {hasAgent && <DocumentViewer onAskAbout={() => setAgentOpen(true)} />}
      {hasAgent && <ComposeOpensPanel onOpen={() => setAgentOpen(true)} />}
    </div>
    </FrameContext.Provider>
  );
}

type PageProps = {
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
};

/** A page's own part of the shell: its title, its content, its footer. The frame around it stays put. */
function PageBody({ children, title, subtitle, headerRight, wide = true, footer = true }: PageProps) {
  const frame = useContext(FrameContext)!;
  const { hasAgent, agentContext, agentOpen } = frame;
  const askAbout = hasAgent && agentContext && !agentOpen;
  return (
    <>
        {/* Page title (§1.5: 26/800). The breadcrumb is in the top bar. */}
        {title && (
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-[15px] pt-7" style={{ paddingLeft: "var(--cw-page-pad)", paddingRight: "var(--cw-page-pad)" }}>
            <div className="min-w-0">
              <h1 className="m-0 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-cw-text">{title}</h1>
              {subtitle && <p className="m-0 mt-[5px] max-w-[720px] text-sm leading-normal text-cw-text-muted">{subtitle}</p>}
            </div>
            {(headerRight || askAbout) && (
              <div className="flex flex-none items-center gap-2">
                {askAbout && <AskAboutButton label={agentContext.label} />}
                {headerRight}
              </div>
            )}
          </div>
        )}

        <div className={clsx("min-h-0 flex-1", !wide && "mx-auto w-full max-w-[1100px]")}>{children}</div>

        {/* Footer (§4): 48px. The Verxyl logo has a light and a dark version, switched by the theme's show tokens. */}
        {footer && (
        <footer className="flex h-12 flex-none items-center justify-between gap-4 border-t border-cw-border text-[12px] text-cw-text-muted" style={{ padding: "0 var(--cw-page-pad)" }}>
          <span className="min-w-0 truncate">Data sourced from official AIP publications. For operational use only.</span>
          <span className="flex flex-none items-center gap-2.5">
            Built by
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/verxyl-footer.png" srcSet="/brand/verxyl-footer.png 1x, /brand/verxyl-footer@2x.png 2x, /brand/verxyl-footer@3x.png 3x" alt="Verxyl" className="h-3 w-auto" style={{ display: "var(--cw-show-light)" }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/verxyl-footer-white.png" srcSet="/brand/verxyl-footer-white.png 1x, /brand/verxyl-footer-white@2x.png 2x, /brand/verxyl-footer-white@3x.png 3x" alt="Verxyl" className="h-3 w-auto" style={{ display: "var(--cw-show-dark)" }} />
          </span>
        </footer>
        )}
    </>
  );
}

function RegisteredPage(props: PageProps) {
  const frame = useContext(FrameContext)!;
  const deepKey = props.deepContext ? JSON.stringify(props.deepContext) : "";
  useIsoLayoutEffect(() => {
    frame.setPage({ title: props.title, deepContext: props.deepContext ?? null });
    return () => frame.setPage(null);
  }, [props.title, deepKey]); // eslint-disable-line react-hooks/exhaustive-deps -- deepKey stands for deepContext
  return <PageBody {...props} />;
}

// The ViewerProvider lives in the root layout (app/layout.tsx) so page
// components that render this shell — and call useOpenDocument above it —
// share one viewer with the shell and the panel.
export default function PortalShell(props: PageProps) {
  // Inside the persistent frame: just the page. Anywhere else (a page under a bare route): the whole shell, as before.
  if (useContext(FrameContext)) return <RegisteredPage {...props} />;
  return (
    <ShellFrame>
      <RegisteredPage {...props} />
    </ShellFrame>
  );
}

// Routes that are whole screens of their own, with no portal chrome: sign-in and its flows, the maintenance and
// access screens, the one-tap intake answer, the Telegram mini app, the agent panel framed by the wall console, and
// the captcha (HITL) viewer popups. Everything else gets the frame.
const BARE = /^\/(login|signup|auth|maintenance|pending-approval|access-blocked|forbidden|intake\/answer|telegram|agent\/panel|[a-z]+-hitl-auto-test)(\/|$)/;
export function isBareRoute(pathname: string) {
  return BARE.test(pathname);
}

/** In the root layout: the one persistent frame around every portal page. */
export function PortalFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  if (isBareRoute(pathname)) return <>{children}</>;
  return <ShellFrame>{children}</ShellFrame>;
}

function ComposeOpensPanel({ onOpen }: { onOpen: () => void }) {
  useEffect(() => { const f = () => { if (!document.querySelector("[data-cw-thread-column]")) onOpen(); }; window.addEventListener("cw-agent-compose", f); return () => window.removeEventListener("cw-agent-compose", f); }, [onOpen]);
  return null;
}
