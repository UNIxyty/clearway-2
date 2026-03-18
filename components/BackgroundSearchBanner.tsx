"use client";

import { useBackgroundSearch, type SyncStage, type StageStatus } from "@/lib/search-context";
import { PlaneIcon, XIcon, CheckCircle2Icon, Loader2Icon, AlertCircleIcon } from "lucide-react";

const STAGE_LABELS: Record<SyncStage, string> = {
  airport: "Airport",
  notam: "NOTAMs",
  aip: "AIP",
  gen: "GEN",
  "gen-non-ead": "GEN",
};

function StageIndicator({ stage, status }: { stage: SyncStage; status: StageStatus }) {
  if (status === "pending") return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      {status === "running" && <Loader2Icon className="size-3 animate-spin" />}
      {status === "done" && <CheckCircle2Icon className="size-3 text-green-500" />}
      {status === "error" && <AlertCircleIcon className="size-3 text-red-400" />}
      <span className={status === "running" ? "font-medium" : "text-muted-foreground"}>
        {STAGE_LABELS[stage]}
      </span>
    </span>
  );
}

export function BackgroundSearchBanner({ onNavigate }: { onNavigate?: (icao: string) => void }) {
  const { bg, clearBackground } = useBackgroundSearch();

  if (!bg) return null;

  const activeStages = (Object.entries(bg.stages) as [SyncStage, StageStatus][]).filter(
    ([, s]) => s !== "pending"
  );

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 bg-primary/95 text-primary-foreground px-4 py-2 flex items-center gap-3 shadow-md cursor-pointer backdrop-blur-sm"
      onClick={() => onNavigate?.(bg.icao)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onNavigate?.(bg.icao)}
    >
      <PlaneIcon className="size-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{bg.icao}</span>
          <span className="text-xs opacity-80">—</span>
          <span className="text-xs opacity-80">{bg.progress}</span>
        </div>
        {activeStages.length > 0 && (
          <div className="flex items-center gap-3 mt-0.5">
            {activeStages.map(([stage, status]) => (
              <StageIndicator key={stage} stage={stage} status={status} />
            ))}
          </div>
        )}
      </div>
      {bg.done && (
        <button
          className="shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            clearBackground();
          }}
          aria-label="Dismiss"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
