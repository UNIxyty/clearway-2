"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type SyncStage = "airport" | "notam" | "aip" | "gen" | "gen-non-ead";

export type StageStatus = "pending" | "running" | "done" | "error";

export type BackgroundSearch = {
  icao: string;
  stages: Record<SyncStage, StageStatus>;
  currentStage: SyncStage | null;
  progress: string;
  done: boolean;
  error: string | null;
};

type SearchContextValue = {
  bg: BackgroundSearch | null;
  startBackground: (icao: string) => void;
  updateStage: (stage: SyncStage, status: StageStatus, progress?: string) => void;
  finishBackground: () => void;
  clearBackground: () => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);

const INITIAL_STAGES: Record<SyncStage, StageStatus> = {
  airport: "pending",
  notam: "pending",
  aip: "pending",
  gen: "pending",
  "gen-non-ead": "pending",
};

export function SearchProvider({ children }: { children: ReactNode }) {
  const [bg, setBg] = useState<BackgroundSearch | null>(null);

  const startBackground = useCallback((icao: string) => {
    setBg({
      icao,
      stages: { ...INITIAL_STAGES },
      currentStage: "airport",
      progress: "Loading airport data…",
      done: false,
      error: null,
    });
  }, []);

  const updateStage = useCallback(
    (stage: SyncStage, status: StageStatus, progress?: string) => {
      setBg((prev) => {
        if (!prev) return prev;
        const stages = { ...prev.stages, [stage]: status };
        const currentStage = status === "running" ? stage : prev.currentStage;
        return {
          ...prev,
          stages,
          currentStage,
          progress: progress ?? prev.progress,
          error: status === "error" ? progress ?? prev.error : prev.error,
        };
      });
    },
    []
  );

  const finishBackground = useCallback(() => {
    setBg((prev) => (prev ? { ...prev, done: true, currentStage: null, progress: "Complete" } : prev));
  }, []);

  const clearBackground = useCallback(() => {
    setBg(null);
  }, []);

  return (
    <SearchContext.Provider value={{ bg, startBackground, updateStage, finishBackground, clearBackground }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useBackgroundSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useBackgroundSearch must be used within SearchProvider");
  return ctx;
}
