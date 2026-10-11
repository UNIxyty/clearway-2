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
  const { data, loading, error, refresh } = usePoll<{ entries?: Entry[]; scope?: "mine" | "everyone" }>(
    `/api/dashboard/changelog?filter=${filter}`,
    60_000,
  );
  const entries = data?.entries ?? [];
  // Portal foundations 1.3: ordinary users get only their own entries; admins get everyone's, and the card says so.
  const everyone = data?.scope === "everyone";

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
                ? { color: "var(--cw-text-link)", background: "var(--cw-primary-tint)", borderColor: "var(--cw-primary-tint-border)" }
                : { color: "var(--cw-text-muted)", background: "var(--cw-bg-surface)", borderColor: "var(--cw-border-control)" }
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
      title={everyone ? "Changelog — everyone (admin view)" : "Your changelog"}
      subtitle={
        everyone
          ? "Everyone's edits and errors across every service. Only admins see this."
          : "Your own edits, and what happened to your reports and emails"
      }
      headerRight={headerRight}
    >
      {loading && !data ? (
        <LoadingRows count={5} height={40} />
      ) : error && !data ? (
        <RegionNote
          icon="triangle-alert"
          iconColor="var(--cw-danger-text)"
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
              : everyone
                ? "Edits to airports, bulletins, reports and settings will appear here as they happen."
                : "Your edits to airports, reports and settings will appear here as they happen."
          }
        />
      ) : (
        <div>
          {entries.map((entry, i) => {
            const isError = entry.kind === "error";
            return (
              <div
                key={`${entry.at}-${i}`}
                className="flex items-start gap-[13px] border-t border-cw-divider py-3 pr-5"
                style={
                  isError
                    ? { background: "var(--cw-danger-tint)", borderLeft: "3px solid var(--cw-danger)", paddingLeft: 17 }
                    : { borderLeft: "3px solid transparent", paddingLeft: 17 }
                }
              >
                <span
                  className="mt-px flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg"
                  style={{ background: isError ? "var(--cw-danger-tint)" : "var(--cw-neutral-tint)" }}
                >
                  <MaskIcon
                    name={isError ? "triangle-alert" : SOURCE_ICON[entry.source] ?? "file-text"}
                    size={14}
                    color={isError ? "var(--cw-danger-text)" : "var(--cw-neutral-text)"}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[13.5px] leading-relaxed text-cw-text"
                    style={{ fontWeight: isError ? 600 : 400 }}
                  >
                    {entry.summary}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-[9px] gap-y-1">
                    <span
                      className="rounded-[5px] px-2 py-[3px] text-[11px] font-bold tracking-[0.05em]"
                      style={
                        isError
                          ? { color: "var(--cw-danger-text)", background: "var(--cw-danger-tint)" }
                          : { color: "var(--cw-neutral-text)", background: "var(--cw-neutral-tint)" }
                      }
                    >
                      {isError ? "ERROR" : "EDIT"}
                    </span>
                    <span className="text-xs text-cw-text-muted">{entry.source}</span>
                    {entry.actor && (
                      <span className="truncate font-mono text-[11.5px] text-cw-text-muted" title={entry.actor}>
                        {entry.actor}
                      </span>
                    )}
                  </span>
                </span>
                <span className="mt-0.5 flex-none font-mono text-[11.5px] text-cw-text-muted" title={entry.at}>
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
