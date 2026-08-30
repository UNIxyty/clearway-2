"use client";

// Dashboard region B — "Service status" (audit §6.4): consumes the sibling
// agent's GET /api/service-checks + POST /api/service-checks/recheck.
// Coded defensively: a 404 (checker not deployed yet) renders a calm
// "checker offline" note, never an error. State chips use the shared
// stateChip tokens (shared/design-tokens.json via lib/tokens.ts).
// Red/amber rows sort first; polls every 30s.
import { useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { PButton } from "@/components/portal/ui";
import { T, type StateChipKey } from "@/lib/tokens";
import { LoadingRows, RegionCard, RegionNote, clockTime, timeAgo, usePoll } from "./shared";

type Check = {
  id: string;
  label: string;
  state: "operational" | "degraded" | "down" | "unknown";
  lastChecked?: string | null;
  lastError?: string | null;
  latencyMs?: number | null;
};

type ChecksPayload = { checks?: Check[]; lastSweep?: string | null };

const STATE_ORDER: Record<string, number> = { down: 0, degraded: 1, unknown: 2, operational: 3 };
const STATE_LABEL: Record<string, string> = {
  operational: "OPERATIONAL",
  degraded: "DEGRADED",
  down: "DOWN",
  unknown: "UNKNOWN",
};

function chip(state: string) {
  const key = (state in T.stateChip ? state : "unknown") as StateChipKey;
  return T.stateChip[key];
}

export default function ServiceStatusCard() {
  const { data, loading, offline, error, refresh } = usePoll<ChecksPayload>(
    "/api/service-checks",
    30_000,
  );
  const [rechecking, setRechecking] = useState(false);

  const checks = [...(data?.checks ?? [])].sort(
    (a, b) => (STATE_ORDER[a.state] ?? 2) - (STATE_ORDER[b.state] ?? 2) || a.label.localeCompare(b.label),
  );
  const counts = { operational: 0, degraded: 0, down: 0, unknown: 0 };
  for (const c of checks) counts[c.state in counts ? c.state : "unknown"] += 1;

  async function recheck() {
    setRechecking(true);
    try {
      await fetch("/api/service-checks/recheck", { method: "POST", credentials: "include" });
      await refresh();
    } catch {
      // The next 30s poll will pick it up.
    } finally {
      setRechecking(false);
    }
  }

  const headerRight = (
    <>
      <span className="font-mono text-[11.5px] text-cw-faint">
        checked {clockTime(data?.lastSweep)}
      </span>
      <PButton size="sm" onClick={recheck} disabled={rechecking || offline}>
        <MaskIcon name="refresh-cw" size={13} color="#6c7079" className={rechecking ? "animate-spin" : undefined} />
        Re-check
      </PButton>
    </>
  );

  return (
    <RegionCard icon="activity" title="Service status" headerRight={headerRight}>
      {offline ? (
        <RegionNote
          icon="activity"
          title="Checker offline"
          body="The service checker isn't running yet — once /api/service-checks is deployed, live per-service health appears here."
        />
      ) : loading && !data ? (
        <LoadingRows count={5} height={34} />
      ) : error && !data ? (
        <RegionNote
          icon="triangle-alert"
          iconColor="#e5484d"
          title="Couldn't reach the checker"
          body={error}
          action={
            <PButton size="sm" className="mt-1.5" onClick={() => refresh()}>
              Try again
            </PButton>
          }
        />
      ) : checks.length === 0 ? (
        <RegionNote icon="activity" title="No checks configured" body="The checker answered but reported no services yet." />
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-3.5 border-b border-cw-borderInner bg-cw-page px-5 py-3.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-extrabold tracking-[-0.02em] text-cw-ink">
                {counts.operational}
              </span>
              <span className="text-[13px] text-cw-muted">of {checks.length} operational</span>
            </div>
            <div className="ml-auto flex flex-wrap gap-[7px]">
              {(["degraded", "down", "unknown"] as const).map((state) =>
                counts[state] > 0 ? (
                  <span
                    key={state}
                    className="inline-flex items-center gap-[7px] rounded-full px-[11px] py-[5px] text-xs font-semibold"
                    style={{ color: chip(state).fg, background: chip(state).bg }}
                  >
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: chip(state).dot }} />
                    {counts[state]} {state}
                  </span>
                ) : null,
              )}
            </div>
          </div>
          {checks.map((check) => {
            const c = chip(check.state);
            const note =
              check.state === "operational"
                ? check.latencyMs != null
                  ? `${Math.round(check.latencyMs)} ms`
                  : ""
                : check.lastError || "";
            return (
              <div
                key={check.id}
                className="flex min-w-0 items-center gap-3 border-t border-[#f4f5f6] px-5 py-[9px]"
              >
                <span
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ background: c.dot, boxShadow: `0 0 0 3px ${c.bg}` }}
                />
                <span className="min-w-0 flex-none truncate text-[13.5px] font-semibold text-cw-ink">
                  {check.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-cw-muted" title={note}>
                  {note}
                </span>
                <span
                  className="flex-none whitespace-nowrap rounded-md px-[9px] py-1 text-center text-[11px] font-bold tracking-[0.05em]"
                  style={{ color: c.fg, background: c.bg }}
                >
                  {STATE_LABEL[check.state] ?? check.state.toUpperCase()}
                </span>
                <span className="w-[58px] flex-none text-right font-mono text-[11.5px] text-cw-faint">
                  {check.lastChecked ? timeAgo(check.lastChecked) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </RegionCard>
  );
}
