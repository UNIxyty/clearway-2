"use client";

// Portal app shell — console-style slim top bar, left nav, footer. Wraps the
// main portal page and the light secondary pages (Profile, Stats, Deleted
// airports, admin lists). Pickem/Playoffs intentionally do NOT use it.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GlobeIcon, SearchIcon, ActivityIcon, Trash2Icon } from "lucide-react";
import { clsx } from "clsx";
import UserBadge from "@/components/UserBadge";
import {
  COUNTRY_SERVICE_STATE_META,
  type CountryServiceState,
} from "@/lib/country-service-status-shared";

type StatusRow = { country: string; state: CountryServiceState };

/**
 * The former floating "Portal Service Status" banner, re-homed as a compact
 * health pill in the top bar. Same endpoint, same 10s poll; clicking goes to
 * the dedicated /status page.
 */
function HealthPill() {
  const [rows, setRows] = useState<StatusRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/country-service-status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive && Array.isArray(data.countries)) setRows(data.countries);
      } catch {
        /* transient — keep the last reading */
      }
    };
    load();
    const timer = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const summary = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const operational = rows.filter((r) => r.state === "operational").length;
    const issues = rows.filter((r) => r.state === "issues").length;
    const tone = issues > 0 ? "issues" : operational > 0 ? "operational" : "not_checked";
    return { operational, total: rows.length, tone } as const;
  }, [rows]);

  if (!summary) return null;
  const meta = COUNTRY_SERVICE_STATE_META[summary.tone as CountryServiceState];
  const good = summary.tone === "operational";
  return (
    <Link
      href="/status"
      className={clsx(
        "hidden items-center gap-2 rounded-full border px-3 py-1.5 no-underline md:inline-flex",
        good
          ? "border-[#c7ead2] bg-[#e7f6ec] hover:bg-[#dcf0e4]"
          : "border-[#f0d4d4] bg-[#fdf2f2] hover:bg-[#fbe8e8]"
      )}
      title="Country service statuses"
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: meta?.hex ?? "#9ca3af", boxShadow: `0 0 0 4px ${good ? "rgba(22,163,74,.15)" : "rgba(229,72,77,.12)"}` }}
      />
      <span className={clsx("text-[12.5px] font-semibold", good ? "text-[#15803d]" : "text-[#a12a2e]")}>
        {summary.operational} of {summary.total} countries operational
      </span>
    </Link>
  );
}

const NAV = [
  { href: "/", label: "Search", icon: SearchIcon },
  { href: "/status", label: "Service status", icon: ActivityIcon },
  { href: "/admin/airports/deleted", label: "Deleted airports", icon: Trash2Icon },
] as const;

export default function PortalShell({
  children,
  wide = true,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f6f7] font-sans text-[#17181c]">
      {/* TOP BAR */}
      <div className="flex h-[60px] flex-none items-center justify-between border-b border-[#e6e7ea] bg-white px-5">
        <button
          onClick={() => router.push("/")}
          className="flex cursor-pointer items-center gap-3 border-none bg-transparent p-0"
        >
          <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-[#17181c]">
            <span className="h-[9px] w-[9px] rounded-full bg-[#17181c]" />
          </span>
          <span className="text-base font-extrabold tracking-[-0.01em]">clearway</span>
          <span className="mx-0.5 h-5 w-px bg-[#e6e7ea]" />
          <span className="text-sm font-semibold text-[#6c7079]">AIP Data Portal</span>
        </button>
        <div className="flex items-center gap-3.5">
          <HealthPill />
          <span className="hidden h-6 w-px bg-[#e6e7ea] md:block" />
          <UserBadge />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* LEFT NAV */}
        <div className="hidden w-[228px] flex-none flex-col border-r border-[#e6e7ea] bg-white px-3 pb-3.5 pt-4 lg:flex">
          <div className="px-2.5 pb-2.5 text-[10.5px] font-bold tracking-[0.13em] text-[#9aa0a8]">
            PORTAL
          </div>
          <div className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-[11px] rounded-[10px] px-[11px] py-[9px] text-sm no-underline",
                    active
                      ? "bg-[#eef4ff] font-bold text-[#1d4ed8]"
                      : "font-medium text-[#3a3d44] hover:bg-[#f5f6f7] hover:text-[#17181c]"
                  )}
                >
                  <Icon className="h-[17px] w-[17px]" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="flex-1" />
          <div className="flex flex-col gap-1 border-t border-[#eef0f2] pt-3">
            <div className="text-[11px] font-bold tracking-[0.1em] text-[#c3c7cd]">BUILT BY</div>
            <div className="text-[15px] font-extrabold tracking-[0.06em]">VERXYL</div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="min-w-0 flex-1 overflow-auto">
          <div className={clsx("min-h-[calc(100vh-60px-63px)]", !wide && "mx-auto max-w-[1100px]")}>
            {children}
          </div>
          <div className="flex items-center gap-3.5 border-t border-[#e6e7ea] bg-white px-[30px] py-[18px]">
            <span className="flex-1 text-[12.5px] text-[#9aa0a8]">
              Data sourced from official AIP publications. For operational use only.
            </span>
            <span className="text-[11px] font-bold tracking-[0.1em] text-[#c3c7cd]">BUILT BY</span>
            <span className="text-sm font-extrabold tracking-[0.06em]">VERXYL</span>
          </div>
        </div>
      </div>
      <span className="sr-only">
        <GlobeIcon />
      </span>
    </div>
  );
}
