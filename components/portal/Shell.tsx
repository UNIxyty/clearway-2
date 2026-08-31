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
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { clsx } from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import MaskIcon from "@/components/portal/Icon";
import ClientNavProgress from "@/components/portal/ClientNavProgress";
import { NAV_TOPICS, ACCOUNT_MENU_IDS, topicsForRole, type NavTopic, type Role } from "@/components/portal/nav";

const COLLAPSE_KEY = "cw-shell-collapsed";
const OPEN_TOPICS_KEY = "cw-shell-open-topics";

export type DeepContext = {
  icon: string;
  code: string;
  sub?: string;
  backHref: string;
  items: Array<{ id: string; label: string; icon: string; href: string; active?: boolean }>;
};

function useIdentity() {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("user");
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((d) => d.preferences?.display_name && setName(d.preferences.display_name))
      .catch(() => {});
    // Existing admin check — never reimplemented (audit rule). A failed
    // probe means NOT admin (fail closed).
    fetch("/api/admin/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { isAdmin: false }))
      .then((d) => setRole(d?.isAdmin ? "admin" : "user"))
      .catch(() => setRole("user"));
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
  return { email, display, initials, role };
}

function NavButton({
  icon,
  label,
  active,
  showLabel,
  onClick,
  trailing,
  sub = false,
}: {
  icon: string;
  label: string;
  active?: boolean;
  showLabel: boolean;
  onClick: () => void;
  trailing?: ReactNode;
  sub?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={clsx(
        "flex w-full cursor-pointer items-center gap-2.5 border-none text-left font-sans",
        sub ? "rounded-[7px] px-[9px] py-1.5 text-[13px]" : "rounded-[9px] px-[9px] py-2 text-[13.5px]",
        !showLabel && "justify-center",
        active ? "bg-cw-primaryTint font-bold text-cw-primaryDeep" : "bg-transparent font-medium text-cw-body hover:bg-cw-hover"
      )}
    >
      <MaskIcon name={icon} size={sub ? 15 : 17} color={active ? "#1d4ed8" : "#6c7079"} />
      {showLabel && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {showLabel && trailing}
    </button>
  );
}

export default function PortalShell({
  children,
  deepContext = null,
  crumb,
  title,
  subtitle,
  headerRight,
  wide = true,
}: {
  children: ReactNode;
  deepContext?: DeepContext | null;
  crumb?: string;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  wide?: boolean;
}) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { email, display, initials, role } = useIdentity();
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navPending, startNavTransition] = useTransition();
  const accountRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!accountOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [accountOpen]);

  const topics = useMemo(() => topicsForRole(role), [role]);
  const accountItems = useMemo(() => {
    const acc = NAV_TOPICS.find((t) => t.id === "account");
    return (acc?.items ?? []).filter((i) => ACCOUNT_MENU_IDS.includes(i.id));
  }, []);

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
              const open = openTopics.has(topic.id);
              const anyChildActive = (topic.items ?? []).some((i) => !i.external && isActive(i.href));
              return (
                <div key={topic.id} className="mb-0.5">
                  <NavButton
                    icon={topic.icon}
                    label={topic.label}
                    active={topic.href ? isActive(topic.href) : !open && anyChildActive}
                    showLabel={labels}
                    onClick={() => (topic.href ? go(topic.href) : labels ? toggleTopic(topic.id) : toggleTopic(topic.id))}
                    trailing={
                      topic.items ? (
                        <MaskIcon name={open ? "chevron-up" : "chevron-down"} size={14} color="#9aa0a8" />
                      ) : undefined
                    }
                  />
                  {topic.items && open && (
                    <div
                      className={clsx(
                        "mb-2 mt-0.5 flex flex-col gap-px",
                        labels ? "ml-[13px] border-l border-cw-border pl-[9px]" : ""
                      )}
                    >
                      {topic.items.map((item) => (
                        <NavButton
                          key={item.id}
                          sub
                          icon={item.icon}
                          label={item.label}
                          active={!item.external && isActive(item.href)}
                          showLabel={labels}
                          onClick={() => go(item.href, item.external)}
                          trailing={
                            item.external ? (
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

      {/* user badge (bottom, pinned) + reduced account menu. The menu opens
          upward IN FLOW inside this flex-none zone: overflow-y-auto lives on
          the nav zone only, no ancestor between here and the viewport clips,
          so no createPortal is needed (verified against the pinned h-screen
          sidebar; worst-case menu+badge+head ≈ 370px, well under any
          viewport — the nav zone shrinks via min-h-0 to make room). */}
      <div className="flex-none border-t border-cw-border px-2 py-2" ref={accountRef}>
        {accountOpen && labels && (
          <div className="mb-1.5 rounded-[11px] border border-cw-border bg-white p-1.5 shadow-[0_1px_2px_rgba(16,18,22,.04),0_12px_28px_rgba(16,18,22,.10)]">
            <div className="mb-1 border-b border-cw-borderInner px-2.5 pb-2 pt-1.5">
              <div className="text-[13px] font-semibold">{display}</div>
              {email && <div className="font-mono text-[11px] text-cw-faint">{email}</div>}
            </div>
            {accountItems.map((item) =>
              item.id === "acc-signout" ? (
                <button
                  key={item.id}
                  onClick={signOut}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-[7px] border-none bg-transparent px-2.5 py-[7px] text-left font-sans text-[13px] font-medium text-cw-body hover:bg-cw-sidebar"
                >
                  <MaskIcon name={item.icon} size={15} color="#9aa0a8" />
                  {item.label}
                </button>
              ) : (
                <button
                  key={item.id}
                  onClick={() => {
                    setAccountOpen(false);
                    go(item.href, item.external);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-[7px] border-none bg-transparent px-2.5 py-[7px] text-left font-sans text-[13px] font-medium text-cw-body hover:bg-cw-sidebar"
                >
                  <MaskIcon name={item.icon} size={15} color="#9aa0a8" />
                  {item.label}
                </button>
              )
            )}
          </div>
        )}
        <button
          onClick={() => setAccountOpen((v) => !v)}
          title={display}
          className={clsx(
            "flex w-full cursor-pointer items-center gap-2 rounded-[9px] border-none bg-transparent px-2 py-[7px] text-left font-sans hover:bg-cw-hover",
            !labels && "justify-center"
          )}
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-cw-primary text-[11.5px] font-bold text-white">
            {initials}
          </span>
          {labels && (
            <>
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
              <MaskIcon name={accountOpen ? "chevron-down" : "chevron-up"} size={14} color="#9aa0a8" />
            </>
          )}
        </button>
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
      {/* desktop sidebar — pinned to the viewport (sticky + h-screen inside
          the min-h-screen flex row): head and user badge stay put, only the
          nav list scrolls internally, only the content column scrolls the
          page. Holds in expanded, 68px rail and deep-context modes. */}
      <div
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
            {headerRight && <div className="flex flex-none items-center gap-2">{headerRight}</div>}
          </div>
        )}

        <div className={clsx("min-h-0 flex-1", !wide && "mx-auto w-full max-w-[1100px]")}>{children}</div>

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
      </div>
    </div>
  );
}
