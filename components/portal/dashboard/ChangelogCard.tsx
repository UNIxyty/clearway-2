"use client";

// Dashboard region D — "Changelog" (audit §6.3): the assembled edit/error
// feed from /api/dashboard/changelog. Filter chips (all / edits / errors);
// errors are visually distinct — red-tinted left border. Polls every 60s.
import { useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { PButton } from "@/components/portal/ui";
import { LoadingRows, RegionCard, RegionNote, timeAgo, usePoll } from "./shared";

type Entry = {
  kind: "edit" | "error";
  source: string;
  summary: string;
  actor: string | null;
  at: string;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "edits", label: "Edits" },
  { id: "errors", label: "Errors" },
] as const;

type Filter = (typeof FILTERS)[number]["id"];

const SOURCE_ICON: Record<string, string> = {
  Airports: "plane",
  "Bug reports": "bug",
  Maintenance: "wrench",
  Email: "mail",
  "Debug runner": "terminal",
  "Wall — Important": "megaphone",
  "Wall — Reports": "clipboard-list",
  "Wall — Leon webhooks": "webhook",
};

export default function ChangelogCard() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, loading, error, refresh } = usePoll<{ entries?: Entry[] }>(
    `/api/dashboard/changelog?filter=${filter}`,
    60_000,
  );
  const entries = data?.entries ?? [];

  const headerRight = (
    <div className="flex items-center gap-[7px]">
      {FILTERS.map((f) => {
        const active = filter === f.id;
        return (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="cursor-pointer rounded-full border px-3 py-[5px] font-sans text-[12.5px] font-semibold"
            style={
              active
                ? { color: "#1d4ed8", background: "#eef4ff", borderColor: "#bfd3f8" }
                : { color: "#6c7079", background: "#fff", borderColor: "#d6d8dc" }
            }
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <RegionCard
      icon="clipboard-list"
      title="Changelog"
      subtitle="Edits and errors across every service"
      headerRight={headerRight}
    >
      {loading && !data ? (
        <LoadingRows count={5} height={40} />
      ) : error && !data ? (
        <RegionNote
          icon="triangle-alert"
          iconColor="#e5484d"
          title="Couldn't load the changelog"
          body={error}
          action={
            <PButton size="sm" className="mt-1.5" onClick={() => refresh()}>
              Try again
            </PButton>
          }
        />
      ) : entries.length === 0 ? (
        <RegionNote
          icon="clipboard-list"
          title={filter === "errors" ? "No errors logged" : "Nothing logged yet"}
          body={
            filter === "errors"
              ? "No failures from email delivery, debug runs or wall webhooks — that's a good sign."
              : "Edits to airports, bulletins, reports and settings will appear here as they happen."
          }
        />
      ) : (
        <div>
          {entries.map((entry, i) => {
            const isError = entry.kind === "error";
            return (
              <div
                key={`${entry.at}-${i}`}
                className="flex items-start gap-[13px] border-t border-[#f4f5f6] py-3 pr-5"
                style={
                  isError
                    ? { background: "#fef8f8", borderLeft: "3px solid #e5484d", paddingLeft: 17 }
                    : { borderLeft: "3px solid transparent", paddingLeft: 17 }
                }
              >
                <span
                  className="mt-px flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg"
                  style={{ background: isError ? "#fee2e2" : "#eef1f5" }}
                >
                  <MaskIcon
                    name={isError ? "triangle-alert" : SOURCE_ICON[entry.source] ?? "file-text"}
                    size={14}
                    color={isError ? "#b91c1c" : "#475569"}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[13.5px] leading-relaxed text-cw-ink"
                    style={{ fontWeight: isError ? 600 : 400 }}
                  >
                    {entry.summary}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-[9px] gap-y-1">
                    <span
                      className="rounded-[5px] px-2 py-[3px] text-[11px] font-bold tracking-[0.05em]"
                      style={
                        isError
                          ? { color: "#b91c1c", background: "#fee2e2" }
                          : { color: "#475569", background: "#eef1f5" }
                      }
                    >
                      {isError ? "ERROR" : "EDIT"}
                    </span>
                    <span className="text-xs text-cw-muted">{entry.source}</span>
                    {entry.actor && (
                      <span className="truncate font-mono text-[11.5px] text-cw-faint" title={entry.actor}>
                        {entry.actor}
                      </span>
                    )}
                  </span>
                </span>
                <span className="mt-0.5 flex-none font-mono text-[11.5px] text-cw-faint" title={entry.at}>
                  {timeAgo(entry.at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </RegionCard>
  );
}
