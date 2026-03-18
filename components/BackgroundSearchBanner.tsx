"use client";

import { useEffect, useState } from "react";
import { useBackgroundSearch, type SyncStage, type StageStatus } from "@/lib/search-context";
import { PlaneIcon, XIcon, CheckCircle2Icon, Loader2Icon, AlertCircleIcon, ChevronLeftIcon, ChevronRightIcon, ListIcon } from "lucide-react";

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
  const { bgList, clearBackground } = useBackgroundSearch();
  const [index, setIndex] = useState(0);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    if (bgList.length === 0) return;
    if (index > bgList.length - 1) setIndex(0);
  }, [bgList, index]);

  if (bgList.length === 0) return null;
  const current = bgList[index] ?? bgList[0];

  const activeStages = (Object.entries(current.stages) as [SyncStage, StageStatus][]).filter(
    ([, s]) => s !== "pending"
  );
  const canPrev = bgList.length > 1;
  const canNext = bgList.length > 1;

  return (
    <div
      className="fixed top-4 right-4 z-[1200] w-[min(95vw,30rem)] rounded-lg border border-border bg-card/95 text-card-foreground px-3 py-2 shadow-lg backdrop-blur-sm"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onNavigate?.(current.icao)}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 p-1 rounded hover:bg-accent transition-colors disabled:opacity-50"
          onClick={(e) => {
            e.stopPropagation();
            if (!canPrev) return;
            setIndex((prev) => (prev - 1 + bgList.length) % bgList.length);
          }}
          disabled={!canPrev}
          aria-label="Previous airport"
        >
          <ChevronLeftIcon className="size-4" />
        </button>

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onNavigate?.(current.icao)}
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center gap-2">
            <PlaneIcon className="size-4 shrink-0 text-primary" />
            <span className="font-semibold text-xs sm:text-sm">{current.icao}</span>
            <span className="text-[10px] text-muted-foreground">-</span>
            <span className="text-[11px] text-muted-foreground truncate">{current.progress}</span>
          </div>
          {activeStages.length > 0 && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {activeStages.map(([stage, status]) => (
                <StageIndicator key={stage} stage={stage} status={status} />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="mt-0.5 p-1 rounded hover:bg-accent transition-colors disabled:opacity-50"
          onClick={(e) => {
            e.stopPropagation();
            if (!canNext) return;
            setIndex((prev) => (prev + 1) % bgList.length);
          }}
          disabled={!canNext}
          aria-label="Next airport"
        >
          <ChevronRightIcon className="size-4" />
        </button>

        <button
          type="button"
          className="mt-0.5 p-1 rounded hover:bg-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setShowList((prev) => !prev);
          }}
          aria-label="Show all searches"
        >
          <ListIcon className="size-4" />
        </button>
        <button
          type="button"
          className="mt-0.5 p-1 rounded hover:bg-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            clearBackground(current.icao);
          }}
          aria-label="Dismiss"
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {index + 1}/{bgList.length} running
      </div>
      {showList && (
        <div className="mt-2 max-h-40 overflow-auto rounded-md border border-border/60 bg-background/80 p-1 space-y-1">
          {bgList.map((item, idx) => (
            <button
              key={item.icao}
              type="button"
              className="w-full text-left rounded px-2 py-1.5 hover:bg-accent text-xs flex items-center justify-between gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setIndex(idx);
                setShowList(false);
                onNavigate?.(item.icao);
              }}
            >
              <span className="font-medium">{item.icao}</span>
              <span className="text-muted-foreground truncate">{item.progress}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
