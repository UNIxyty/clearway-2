"use client";

// Dashboard region A — "Recently used" (audit §6.1): the current user's
// latest distinct queries from the server-side search_events log, as
// clickable tiles per the platform design (mono resource + service chip +
// action + relative time + Open link). Polls every 60s.
import Link from "next/link";
import MaskIcon from "@/components/portal/Icon";
import { PButton } from "@/components/portal/ui";
import { RegionCard, RegionNote, timeAgo, usePoll } from "./shared";

type RecentItem = {
  resource: string;
  service: string;
  action: "Searched" | "Opened";
  when: string;
  href: string;
};

export default function RecentsCard() {
  const { data, loading, error, refresh } = usePoll<{ recents?: RecentItem[] }>(
    "/api/dashboard/recents",
    60_000,
  );
  const recents = data?.recents ?? [];

  return (
    <RegionCard icon="history" title="Recently used" subtitle="Pick up where you left off">
      {loading && !data ? (
        <div className="grid grid-cols-2 gap-3.5 p-5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[84px] animate-pulse rounded-[10px] bg-[#f2f3f5]" />
          ))}
        </div>
      ) : error && !data ? (
        <RegionNote
          icon="triangle-alert"
          iconColor="#e5484d"
          title="Couldn't load your recent activity"
          body={error}
          action={
            <PButton size="sm" className="mt-1.5" onClick={() => refresh()}>
              Try again
            </PButton>
          }
        />
      ) : recents.length === 0 ? (
        <RegionNote
          icon="history"
          title="Nothing recent yet"
          body="Airports you search or open in the AIP Portal will appear here so you can jump straight back in."
          action={
            <Link
              href="/aip"
              className="mt-1.5 rounded-[9px] bg-cw-primary px-[17px] py-[9px] text-[13.5px] font-semibold text-white no-underline hover:bg-cw-primaryDeep"
            >
              Search an airport
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-px bg-cw-borderInner lg:grid-cols-4">
          {recents.map((item) => (
            <Link
              key={`${item.resource}-${item.when}`}
              href={item.href}
              className="group flex flex-col gap-[9px] bg-white px-[18px] pb-[15px] pt-4 text-left no-underline hover:bg-cw-page"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-base font-semibold tracking-[0.02em] text-cw-ink">
                  {item.resource}
                </span>
                <span className="rounded-[5px] bg-[#eef1f5] px-[7px] py-[3px] text-[11px] font-bold tracking-[0.04em] text-[#475569]">
                  {item.service}
                </span>
              </span>
              <span className="text-[13px] leading-snug text-cw-body">{item.action}</span>
              <span className="mt-auto flex items-center gap-1.5 text-xs text-cw-faint">
                <MaskIcon name="history" size={12} />
                {timeAgo(item.when)}
                <span className="ml-auto font-semibold text-cw-primary">Open →</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </RegionCard>
  );
}
