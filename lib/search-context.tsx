"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";

export type SyncStage = "airport" | "notam" | "weather" | "aip" | "gen" | "gen-non-ead";

export type StageStatus = "pending" | "running" | "done" | "error" | "cancelled";

export type BackgroundSearch = {
  icao: string;
  stages: Record<SyncStage, StageStatus>;
  currentStage: SyncStage | null;
  progress: string;
  done: boolean;
  error: string | null;
  startedAt: number;
  updatedAt: number;
};

type SearchContextValue = {
  bgList: BackgroundSearch[];
  bg: BackgroundSearch | null;
  activeIcaos: string[];
  startBackground: (icao: string) => void;
  updateStage: (icao: string, stage: SyncStage, status: StageStatus, progress?: string) => void;
  finishBackground: (icao: string, progress?: string) => void;
  cancelBackground: (icao: string, progress?: string) => void;
  clearBackground: (icao?: string) => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);
const STORAGE_KEY = "clearway-bg-search-state-v1";

const INITIAL_STAGES: Record<SyncStage, StageStatus> = {
  airport: "pending",
  notam: "pending",
  weather: "pending",
  aip: "pending",
  gen: "pending",
  "gen-non-ead": "pending",
};

export function SearchProvider({ children }: { children: ReactNode }) {
  const [bgList, setBgList] = useState<BackgroundSearch[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as BackgroundSearch[];
      if (!Array.isArray(parsed)) return;
      setBgList(parsed);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bgList));
    } catch {}
  }, [bgList]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as BackgroundSearch[];
        if (!Array.isArray(parsed)) return;
        setBgList(parsed);
      } catch {}
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const startBackground = useCallback((icao: string) => {
    const now = Date.now();
    const normalized = icao.trim().toUpperCase();
    setBgList((prev) => {
      const without = prev.filter((item) => item.icao !== normalized);
      const next: BackgroundSearch = {
        icao: normalized,
        stages: { ...INITIAL_STAGES },
        currentStage: "airport",
        progress: "Loading airport data…",
        done: false,
        error: null,
        startedAt: now,
        updatedAt: now,
      };
      return [next, ...without];
    });
  }, []);

  const updateStage = useCallback(
    (icao: string, stage: SyncStage, status: StageStatus, progress?: string) => {
      const normalized = icao.trim().toUpperCase();
      setBgList((prev) =>
        prev.map((item) => {
          if (item.icao !== normalized) return item;
          const stages = { ...item.stages, [stage]: status };
          const currentStage = status === "running" ? stage : item.currentStage;
          return {
            ...item,
            stages,
            currentStage,
            progress: progress ?? item.progress,
            error: status === "error" ? progress ?? item.error : item.error,
            updatedAt: Date.now(),
          };
        })
      );
    },
    []
  );

  const finishBackground = useCallback((icao: string, progress?: string) => {
    const normalized = icao.trim().toUpperCase();
    setBgList((prev) =>
      prev.map((item) =>
        item.icao === normalized
          ? { ...item, done: true, currentStage: null, progress: progress ?? "Complete", updatedAt: Date.now() }
          : item
      )
    );
  }, []);

  const cancelBackground = useCallback((icao: string, progress?: string) => {
    const normalized = icao.trim().toUpperCase();
    setBgList((prev) =>
      prev.map((item) => {
        if (item.icao !== normalized) return item;
        const stages = Object.fromEntries(
          (Object.entries(item.stages) as Array<[SyncStage, StageStatus]>).map(([stage, status]) => [
            stage,
            status === "running" ? "cancelled" : status,
          ]),
        ) as Record<SyncStage, StageStatus>;
        return {
          ...item,
          stages,
          done: true,
          currentStage: null,
          progress: progress ?? "Cancelled",
          updatedAt: Date.now(),
        };
      })
    );
  }, []);

  const clearBackground = useCallback((icao?: string) => {
    if (!icao) {
      setBgList([]);
      return;
    }
    const normalized = icao.trim().toUpperCase();
    setBgList((prev) => prev.filter((item) => item.icao !== normalized));
  }, []);

  const orderedBgList = useMemo(
    () => [...bgList].sort((a, b) => b.updatedAt - a.updatedAt),
    [bgList]
  );
  const bg = orderedBgList[0] ?? null;
  const activeIcaos = orderedBgList.filter((item) => !item.done).map((item) => item.icao);

  return (
    <SearchContext.Provider
      value={{ bgList: orderedBgList, bg, activeIcaos, startBackground, updateStage, finishBackground, cancelBackground, clearBackground }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useBackgroundSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useBackgroundSearch must be used within SearchProvider");
  return ctx;
}
