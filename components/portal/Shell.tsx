"use client";

// Portal app shell — console-parity top bar, left nav and footer. The
// sidebar mirrors the Display Console's exactly (236px, same paddings, item
// metrics, active tint, bottom status card) so the two apps read as one
// product. Real brand assets (shared with the console: public/brand/* are
// copies of opsboard-react/public/assets/*) — "Built by Verxyl" appears
// exactly ONCE per page, in the footer.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SearchIcon, ActivityIcon, Trash2Icon, BarChart3Icon } from "lucide-react";
import { clsx } from "clsx";
import UserBadge from "@/components/UserBadge";
import {
  COUNTRY_SERVICE_STATE_META,
  type CountryServiceState,
} from "@/lib/country-service-status-shared";

type StatusRow = { country: string; state: CountryServiceState };

/**
 * Aggregate portal health from the country statuses. Thresholds (stated in
 * docs): RED when ≥10% of countries are in `issues`; AMBER when ≥10% are
 * not operational (in work / partial / issues combined); GREEN otherwise —
 * i.e. effectively all operational. 103/106 operational with 3 issues
 * (~2.8%) reads GREEN, matching what /status shows.
 */
function healthTone(rows: StatusRow[]) {
  const total = rows.length;
  if (!total) return null;
  const operational = rows.filter((r) => r.state === "operational").length;
  const issues = rows.filter((r) => r.state === "issues").length;
  const notOperational = total - operational;
  const tone = issues / total >= 0.1 ? "red" : notOperational / total >= 0.1 ? "amber" : "green";
  return { tone, operational, total } as const;
}

function useStatusRows() {
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
  return rows;
}

const TONE_STYLES = {
  green: {
    pill: "border-[#c7ead2] bg-[#e7f6ec] hover:bg-[#dcf0e4]",
    text: "text-[#15803d]",
    dot: "#16a34a",
    halo: "rgba(22,163,74,.15)",
  },
  amber: {
    pill: "border-[#f0e0c2] bg-[#fdf6e7] hover:bg-[#faefd6]",
    text: "text-[#b45309]",
    dot: "#f59e0b",
    halo: "rgba(245,158,11,.16)",
  },
  red: {
    pill: "border-[#f0d4d4] bg-[#fdf2f2] hover:bg-[#fbe8e8]",
    text: "text-[#a12a2e]",
    dot: "#ef4444",
    halo: "rgba(229,72,77,.12)",
  },
} as const;

function HealthPill({ rows }: { rows: StatusRow[] | null }) {
  const summary = useMemo(() => healthTone(rows ?? []), [rows]);
  if (!summary) return null;
  const s = TONE_STYLES[summary.tone];
  return (
    <Link
      href="/status"
      className={clsx(
        "hidden items-center gap-2 rounded-full border px-3 py-1.5 no-underline md:inline-flex",
        s.pill
      )}
      title="Country service statuses"
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: s.dot, boxShadow: `0 0 0 4px ${s.halo}` }}
      />
      <span className={clsx("text-[12.5px] font-semibold", s.text)}>
        {summary.operational} of {summary.total} countries operational
      </span>
    </Link>
  );
}

const NAV = [
  { href: "/", label: "Search", icon: SearchIcon },
  { href: "/status", label: "Service status", icon: ActivityIcon },
  { href: "/admin/airports/deleted", label: "Deleted airports", icon: Trash2Icon },
  { href: "/stats", label: "Search statistics", icon: BarChart3Icon },
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
  const rows = useStatusRows();
  const summary = useMemo(() => healthTone(rows ?? []), [rows]);

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f6f7] font-sans text-[#17181c]">
      {/* TOP BAR */}
      <div className="flex h-[60px] flex-none items-center justify-between border-b border-[#e6e7ea] bg-white px-5">
        <button
          onClick={() => router.push("/")}
          className="flex cursor-pointer items-center gap-3 border-none bg-transparent p-0"
        >
          {/* Same asset the Display Console serves. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/clearway-logo.svg" alt="Clearway" className="h-[30px] w-auto" />
          <span className="mx-0.5 h-5 w-px bg-[#e6e7ea]" />
          <span className="text-sm font-semibold text-[#6c7079]">AIP Data Portal</span>
        </button>
        <div className="flex items-center gap-3.5">
          <HealthPill rows={rows} />
          <span className="hidden h-6 w-px bg-[#e6e7ea] md:block" />
          <UserBadge />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* LEFT NAV — console parity: 236px, 18/14 padding, same item metrics */}
        <div className="hidden w-[236px] flex-none flex-col border-r border-[#e6e7ea] bg-white px-3.5 py-[18px] lg:flex">
          <div className="px-2.5 pb-3 text-[10.5px] font-bold tracking-[0.13em] text-[#9aa0a8]">
            PORTAL
          </div>
          <div className="flex flex-col gap-[3px]">
            {NAV.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 rounded-[10px] px-[11px] py-[10px] text-[14.5px] no-underline",
                    active
                      ? "bg-[#eef4ff] font-bold text-[#1d4ed8]"
                      : "font-medium text-[#3a3d44] hover:bg-[#f5f6f7] hover:text-[#17181c]"
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="flex-1" />
          {/* Bottom card — the console has "Sync status" here; the portal's
              equivalent is the live country-service summary. */}
          <div className="rounded-xl border border-[#e6e7ea] bg-[#fbfbfc] px-3.5 py-[13px]">
            <div className="mb-[7px] flex items-center gap-2 text-[12.5px] font-bold">
              Service status
              <span
                className="ml-auto h-2 w-2 rounded-full"
                style={{
                  background: summary ? TONE_STYLES[summary.tone].dot : "#d6d8dc",
                }}
              />
            </div>
            <div className="text-[11.5px] leading-[1.45] text-[#9aa0a8]">
              {summary
                ? `${summary.operational} of ${summary.total} countries operational`
                : "Checking country statuses…"}
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="min-w-0 flex-1 overflow-auto">
          <div className={clsx("min-h-[calc(100vh-60px-63px)]", !wide && "mx-auto max-w-[1100px]")}>
            {children}
          </div>
          {/* The ONLY "Built by Verxyl" on the page. */}
          <div className="flex items-center gap-3.5 border-t border-[#e6e7ea] bg-white px-[30px] py-[18px]">
            <span className="flex-1 text-[12.5px] text-[#9aa0a8]">
              Data sourced from official AIP publications. For operational use only.
            </span>
            <span className="text-[11.5px] text-[#9aa0a8]">Built by</span>
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
    </div>
  );
}
