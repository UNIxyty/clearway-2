"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { PlaneIcon, ChevronDownIcon, ChevronUpIcon, FileWarningIcon, PlusIcon, Trash2Icon, RefreshCwIcon, XIcon } from "lucide-react";
import { getCountryFlagUrl } from "@/lib/country-flags";

export type NotamItem = {
  location: string;
  number: string;
  class: string;
  startDateUtc: string;
  endDateUtc: string;
  condition: string;
};

const AirportMap = dynamic(() => import("@/components/AirportMap"), {
  ssr: false,
  loading: () => <div className="bg-muted/30 rounded-lg flex items-center justify-center min-h-[240px] text-sm text-muted-foreground">Loading map…</div>,
});

const LOADING_STEPS = [
  { id: "website", label: "Loading up website", duration: 800 },
  { id: "reading", label: "Reading info", duration: 1200 },
  { id: "saving", label: "Saving data", duration: 600 },
];

type AIPAirport = {
  country: string;
  gen1_2: string;
  gen1_2_point_4: string;
  icao: string;
  name: string;
  trafficPermitted: string;
  trafficRemarks: string;
  operator: string;
  customsImmigration: string;
  ats: string;
  atsRemarks: string;
  fireFighting: string;
  lat?: number;
  lon?: number;
};

const AIP_FIELD_LABELS: { key: keyof AIPAirport; section: string; label: string }[] = [
  { key: "country", section: "", label: "State" },
  { key: "trafficPermitted", section: "AD 2.2", label: "Types of traffic permitted" },
  { key: "trafficRemarks", section: "AD 2.2", label: "Remarks" },
  { key: "operator", section: "AD 2.3", label: "AD Operator" },
  { key: "customsImmigration", section: "AD 2.3", label: "Customs and immigration" },
  { key: "ats", section: "AD 2.3", label: "ATS" },
  { key: "atsRemarks", section: "AD 2.3", label: "Remarks" },
  { key: "fireFighting", section: "AD 2.6", label: "AD category for fire fighting" },
];

function AIPResultCard({
  airport,
  isSelected,
  onSelect,
  onAddToList,
  isInList,
}: {
  airport: AIPAirport;
  isSelected?: boolean;
  onSelect?: () => void;
  onAddToList?: () => void;
  isInList?: boolean;
}) {
  const [showGen, setShowGen] = useState(false);

  const rows = AIP_FIELD_LABELS
    .map(({ key, section, label }) => {
      const value = airport[key];
      if (typeof value !== "string" || !value.trim()) return null;
      return { key, section, label, value: value.trim() };
    })
    .filter((r): r is { key: keyof AIPAirport; section: string; label: string; value: string } => r !== null);

  const flagUrl = getCountryFlagUrl(airport.country);

  const hasGen = airport.gen1_2 || airport.gen1_2_point_4;

  return (
    <Card
      className={`bg-card/80 border-border/60 transition-colors ${isSelected ? "ring-2 ring-primary" : ""} ${onSelect ? "cursor-pointer hover:bg-card" : ""}`}
      role={onSelect ? "button" : undefined}
      onClick={onSelect}
    >
      <CardHeader className="pb-2 px-4 sm:px-6">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2 shrink-0">
            <span className="font-mono text-primary">{airport.icao}</span>
          </CardTitle>
          {onAddToList && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 shrink-0"
              onClick={(e) => { e.stopPropagation(); onAddToList(); }}
              title={isInList ? "Already in list" : "Add to my airports"}
              disabled={isInList}
            >
              <PlusIcon className={`size-4 ${isInList ? "opacity-50" : ""}`} />
            </Button>
          )}
        </div>
        <CardDescription className="font-normal text-foreground/90 text-xs sm:text-sm">
          {airport.name}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-xs sm:text-sm pt-0 px-4 sm:px-6">
        <dl className="space-y-0">
          {rows.map(({ key, section, label, value }) => (
            <div
              key={`${section}-${label}`}
              className="flex flex-col sm:flex-row gap-0.5 sm:gap-3 py-2 sm:py-2.5 border-b border-border/50 last:border-0"
            >
              <dt className="shrink-0 sm:w-44 font-semibold text-[11px] sm:text-[13px] uppercase tracking-wide">
                {section ? (
                  <>
                    <span className="font-mono text-primary">{section}</span>
                    <span className="text-muted-foreground font-medium normal-case"> — {label}</span>
                  </>
                ) : (
                  <span className="text-foreground">{label}</span>
                )}
              </dt>
              <dd className="text-foreground/90 min-w-0 leading-snug text-xs sm:text-sm flex items-center gap-2">
                {key === "country" && flagUrl ? (
                  <>
                    <img
                      src={flagUrl}
                      alt=""
                      width={28}
                      height={21}
                      className="rounded-sm shrink-0 object-cover align-middle"
                    />
                    <span>{value}</span>
                  </>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
        {hasGen && (
          <div className="border-t border-border/60 pt-3 sm:pt-4 mt-3 sm:mt-4">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowGen((v) => !v); }}
              className="flex items-center gap-2 text-sm sm:text-base text-muted-foreground hover:text-foreground font-semibold"
            >
              {showGen ? <ChevronUpIcon className="size-4 sm:size-5" /> : <ChevronDownIcon className="size-4 sm:size-5" />}
              {flagUrl && (
                <img
                  src={flagUrl}
                  alt=""
                  width={22}
                  height={16}
                  className="rounded-sm shrink-0 object-cover align-middle inline-block"
                />
              )}
              GEN (General — {airport.country})
            </button>
            {showGen && (
              <div className="mt-3 space-y-4 sm:space-y-5">
                {airport.gen1_2 && (
                  <div className="max-w-none">
                    <p className="text-sm sm:text-base font-semibold text-foreground mb-1.5 sm:mb-2">GEN 1.2</p>
                    <p className="text-[13px] sm:text-[15px] text-foreground leading-6 sm:leading-7">{airport.gen1_2}</p>
                  </div>
                )}
                {airport.gen1_2_point_4 && (
                  <div className="max-w-none">
                    <p className="text-sm sm:text-base font-semibold text-foreground mb-1.5 sm:mb-2">GEN 1.2 Point 4</p>
                    <p className="text-[13px] sm:text-[15px] text-foreground leading-6 sm:leading-7">{airport.gen1_2_point_4}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AIPPortalPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [results, setResults] = useState<AIPAirport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
  const [notamsCache, setNotamsCache] = useState<Record<string, { notams: NotamItem[]; error: string | null; detail?: string; updatedAt?: string | null }>>({});
  const [notamsLoadingIcao, setNotamsLoadingIcao] = useState<string | null>(null);
  const [notamsSyncingIcao, setNotamsSyncingIcao] = useState<string | null>(null);
  const [notamsSyncSteps, setNotamsSyncSteps] = useState<string[]>([]);
  const [syncRequestedIcao, setSyncRequestedIcao] = useState<string | null>(null);
  const [savedAirports, setSavedAirports] = useState<AIPAirport[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number | null>(null);

  const selectedAirport = useMemo(() => {
    if (!results?.length || !selectedIcao) return null;
    return results.find((a) => a.icao === selectedIcao) ?? null;
  }, [results, selectedIcao]);

  const viewingAirport = useMemo(() => {
    if (activeTabIndex !== null && savedAirports[activeTabIndex]) return savedAirports[activeTabIndex];
    return selectedAirport;
  }, [activeTabIndex, savedAirports, selectedAirport]);

  const cachedNotams = viewingAirport ? notamsCache[viewingAirport.icao] : null;
  const notamsLoading = viewingAirport ? notamsLoadingIcao === viewingAirport.icao : false;
  const notamsSyncing = viewingAirport ? notamsSyncingIcao === viewingAirport.icao : false;
  const notams = cachedNotams?.notams ?? null;
  const notamsError = cachedNotams?.error ?? null;
  const notamsUpdatedAt = cachedNotams?.updatedAt ?? null;

  useEffect(() => {
    if (!results?.length) {
      setSelectedIcao(null);
      return;
    }
    const withCoords = results.find((a) => a.lat != null && a.lon != null);
    setSelectedIcao(withCoords?.icao ?? results[0].icao);
  }, [results]);

  const addToSaved = useCallback((airport: AIPAirport) => {
    setSavedAirports((prev) => {
      if (prev.some((a) => a.icao === airport.icao)) return prev;
      const next = [...prev, airport];
      setActiveTabIndex(next.length - 1);
      return next;
    });
  }, []);

  const removeFromSaved = useCallback((icao: string) => {
    setSavedAirports((prev) => {
      const idx = prev.findIndex((a) => a.icao === icao);
      if (idx < 0) return prev;
      const next = prev.filter((a) => a.icao !== icao);
      setNotamsCache((c) => {
        const { [icao]: _, ...rest } = c;
        return rest;
      });
      setActiveTabIndex((i) =>
        i === null ? null : i >= next.length ? Math.max(0, next.length - 1) : i === idx ? Math.min(i, next.length - 1) : i > idx ? i - 1 : i
      );
      return next;
    });
  }, []);

  const requestSyncNotams = useCallback((icao: string) => {
    setSyncRequestedIcao(icao);
  }, []);

  // Fetch NOTAMs only when no cache for this icao, or user pressed Sync
  useEffect(() => {
    const icao = viewingAirport?.icao ?? null;
    if (!icao || !viewingAirport?.lat) return;

    const hasCache = icao in notamsCache;
    const syncRequested = syncRequestedIcao === icao;
    if (hasCache && !syncRequested) return;

    const isSync = syncRequested;
    setNotamsLoadingIcao(icao);
    if (isSync) {
      setNotamsSyncingIcao(icao);
      setNotamsSyncSteps([]);
    }

    if (isSync) {
      // Stream sync: get progress steps from server, then final result
      const url = `/api/notams?icao=${encodeURIComponent(icao)}&sync=1&stream=1&_t=${Date.now()}`;
      fetch(url, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            const text = await res.text();
            const data = (() => { try { return JSON.parse(text); } catch { return {}; } })();
            const msg = data.detail ? `${data.error ?? "Sync failed"}: ${data.detail}` : (data.error ?? (text || "Sync failed"));
            setNotamsCache((c) => ({ ...c, [icao]: { notams: [], error: msg, detail: data.detail, updatedAt: null } }));
            return;
          }
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const events = buf.split(/\n\n/);
              buf = events.pop() ?? "";
              for (const event of events) {
                const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
                if (!dataLine) continue;
                try {
                  const data = JSON.parse(dataLine.slice(6));
                  if (data.step) {
                    setNotamsSyncSteps((prev) => [...prev, data.step]);
                  } else if (data.done) {
                    setNotamsCache((c) => ({
                      ...c,
                      [icao]: { notams: data.notams ?? [], error: null, updatedAt: data.updatedAt ?? null },
                    }));
                    return;
                  } else if (data.error) {
                    setNotamsCache((c) => ({
                      ...c,
                      [icao]: { notams: [], error: data.error + (data.detail ? ": " + data.detail : ""), updatedAt: null },
                    }));
                    return;
                  }
                } catch (_) {}
              }
            }
          } finally {
            reader.releaseLock();
          }
        })
        .catch((err) => {
          setNotamsCache((c) => ({
            ...c,
            [icao]: { notams: [], error: `Failed to load NOTAMs: ${err?.message ?? "network or server error"}`, updatedAt: null },
          }));
        })
        .finally(() => {
          setNotamsLoadingIcao(null);
          setNotamsSyncingIcao(null);
          setNotamsSyncSteps([]);
          setSyncRequestedIcao((prev) => (prev === icao ? null : prev));
        });
      return;
    }

    // Non-sync: plain JSON fetch
    const url = `/api/notams?icao=${encodeURIComponent(icao)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          const msg = data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Failed");
          setNotamsCache((c) => ({ ...c, [icao]: { notams: [], error: msg, detail: data.detail, updatedAt: null } }));
        } else {
          setNotamsCache((c) => ({ ...c, [icao]: { notams: data.notams ?? [], error: null, updatedAt: data.updatedAt ?? null } }));
        }
      })
      .catch((err) => {
        setNotamsCache((c) => ({ ...c, [icao]: { notams: [], error: `Failed to load NOTAMs: ${err?.message ?? "network or server error"}`, updatedAt: null } }));
      })
      .finally(() => {
        setNotamsLoadingIcao(null);
        setSyncRequestedIcao((prev) => (prev === icao ? null : prev));
      });
  }, [viewingAirport?.icao, viewingAirport?.lat, syncRequestedIcao, notamsCache]);

  const runFakeLoadingSteps = useCallback(async () => {
    setStepIndex(0);
    for (let i = 0; i < LOADING_STEPS.length; i++) {
      setStepIndex(i);
      await new Promise((r) => setTimeout(r, LOADING_STEPS[i].duration));
    }
  }, []);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      await runFakeLoadingSteps();
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Search failed");
        setResults([]);
        return;
      }

      setResults(data.results ?? []);
    } catch {
      setError("Connection error. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
      setStepIndex(0);
    }
  }, [query, runFakeLoadingSteps]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") search();
  };

  const showMap = (results?.length && selectedAirport?.lat != null) || (savedAirports.length > 0 && viewingAirport?.lat != null);

  return (
    <div className="h-screen w-full flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 overflow-hidden">
      <div className={`flex-1 w-full min-h-0 overflow-auto p-4 sm:p-6 lg:p-8 ${showMap ? "lg:flex lg:flex-col lg:gap-6 lg:max-w-[1600px] lg:mx-auto" : ""}`}>
        <div className={showMap ? "lg:flex lg:min-h-0 lg:flex-1 lg:gap-6 lg:overflow-hidden lg:w-full" : "w-full max-w-2xl mx-auto space-y-6 sm:space-y-8"}>
          {/* Left column: search + results */}
          <div className={showMap ? "lg:min-w-0 lg:flex-1 lg:flex lg:flex-col lg:overflow-hidden" : "space-y-6 sm:space-y-8"}>
            <header className="text-center space-y-1.5 sm:space-y-2 shrink-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
                AIP Data Portal
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Aeronautical Information Publication lookup · Official source
              </p>
            </header>

            <div className={showMap ? "lg:min-h-0 lg:flex-1 lg:overflow-auto lg:space-y-6" : "space-y-6 sm:space-y-8"}>
        <Card className="shadow-md border-border/80 shrink-0">
          <CardHeader className="pb-2 px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg font-semibold">
              Search airport data
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              Enter airport code (ICAO) or name (e.g. DBBB, CADJEHOUN, Benin)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 sm:px-6">
            <div className="flex justify-start items-center gap-2">
              <div className="flex-1 flex items-center min-w-0">
                <Label htmlFor="search" className="sr-only">
                  Search
                </Label>
                <Input
                  id="search"
                  placeholder="Airport code / name / country..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  className="h-10 flex-1 min-w-0"
                />
              </div>
              <Button
                onClick={search}
                disabled={loading}
                type="button"
                className="h-10 px-5 shrink-0"
              >
                {loading ? (
                  <Spinner className="size-4" />
                ) : (
                  "Find"
                )}
              </Button>
            </div>

            {loading && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <PlaneIcon
                    className="size-8 text-primary animate-fly"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Retrieving from AIP source
                  </p>
                </div>
                <div className="space-y-2">
                  {LOADING_STEPS.map((step, i) => (
                    <div
                      key={step.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      {i < stepIndex ? (
                        <span className="text-primary">✓</span>
                      ) : i === stepIndex ? (
                        <Spinner className="size-3.5 text-primary" />
                      ) : (
                        <span className="text-muted-foreground/50">○</span>
                      )}
                      <span
                        className={
                          i <= stepIndex
                            ? "text-foreground"
                            : "text-muted-foreground/70"
                        }
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
                <Progress value={((stepIndex + 1) / LOADING_STEPS.length) * 100} className="h-1.5" />
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {!loading && results !== null && (
              <div className="space-y-3 pt-2">
                {results.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No airports found. Try another code or name.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {results.length} result{results.length !== 1 ? "s" : ""} retrieved
                    </p>
                    {results.map((airport) => (
                      <AIPResultCard
                        key={`${airport.icao}-${airport.country}`}
                        airport={airport}
                        isSelected={viewingAirport?.icao === airport.icao && activeTabIndex === null}
                        onSelect={
                          airport.lat != null && airport.lon != null
                            ? () => { setActiveTabIndex(null); setSelectedIcao(airport.icao); }
                            : undefined
                        }
                        onAddToList={airport.lat != null && airport.lon != null ? () => addToSaved(airport) : undefined}
                        isInList={savedAirports.some((a) => a.icao === airport.icao)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] sm:text-xs text-muted-foreground lg:text-left shrink-0">
          Data sourced from official AIP publications. For operational use only.
        </p>
            </div>
          </div>

          {/* Right column: map + NOTAMs (only when viewing an airport with coords) */}
          {showMap && viewingAirport && (
            <div className="hidden lg:flex lg:shrink-0 lg:w-[min(420px,42vw)] lg:flex-col lg:min-h-0 rounded-xl overflow-hidden border border-border/80 shadow-md bg-card">
              {savedAirports.length > 0 && (
                <div className="flex items-end gap-0.5 px-2 pt-2 pb-0 border-b border-border/60 bg-muted/30 shrink-0 overflow-x-auto min-h-[40px]">
                  {savedAirports.map((a, i) => (
                    <div
                      key={a.icao}
                      className={`flex items-center rounded-t-md border border-b-0 shrink-0 overflow-hidden transition-colors ${
                        activeTabIndex === i ? "bg-card border-border/80 shadow-[0_-1px_0_0_hsl(var(--card))]" : "border-transparent bg-muted/50 hover:bg-muted"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => { setActiveTabIndex(i); setSelectedIcao(null); }}
                        className="px-3 py-2 text-xs font-mono font-medium text-foreground"
                      >
                        {a.icao}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFromSaved(a.icao); }}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted/80 rounded-sm"
                        title="Close tab"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-3 py-2 border-b border-border/60 bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0 flex items-center justify-between gap-2">
                <span>Location — {viewingAirport.icao}</span>
              </div>
              <div className="flex-1 min-h-[240px] shrink-0">
                <AirportMap
                  lat={viewingAirport.lat!}
                  lon={viewingAirport.lon!}
                  icao={viewingAirport.icao}
                  name={viewingAirport.name}
                  className="w-full h-full"
                />
              </div>
              <div className="border-t border-border/60 flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <FileWarningIcon className="size-3.5" />
                    NOTAMs — {viewingAirport.icao}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => requestSyncNotams(viewingAirport.icao)}
                    disabled={notamsLoading}
                    title="Sync now: scrape FAA and refresh data"
                  >
                    <RefreshCwIcon className={`size-3.5 ${notamsLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto p-2 sm:p-3">
                  {notamsLoading && (
                    <div className="flex flex-col gap-3 py-4 text-sm text-muted-foreground">
                      {notamsSyncing ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Spinner className="size-4 shrink-0" />
                            <span className="font-medium">Syncing live from FAA…</span>
                          </div>
                          {notamsSyncSteps.length > 0 && (
                            <ul className="space-y-1 pl-6 list-disc text-xs">
                              {notamsSyncSteps.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ul>
                          )}
                          {notamsSyncSteps.length === 0 && (
                            <span className="text-xs">Starting scraper · can take 1–2 min</span>
                          )}
                        </>
                      ) : (
                        <>
                          <Spinner className="size-4" />
                          <span>Loading NOTAMs…</span>
                        </>
                      )}
                    </div>
                  )}
                  {!notamsLoading && notamsUpdatedAt && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Last updated: {new Date(notamsUpdatedAt).toLocaleString()}
                    </p>
                  )}
                  {!notamsLoading && notamsError && (
                    <div className="space-y-2 py-2">
                      <p className="text-sm text-destructive font-medium">NOTAMs unavailable</p>
                      <p className="text-xs text-muted-foreground break-words">{notamsError}</p>
                      <p className="text-xs text-muted-foreground">Run locally: <code className="bg-muted px-1 rounded">npm run notam {viewingAirport?.icao}</code> to fetch NOTAMs and check Chrome/Playwright.</p>
                    </div>
                  )}
                  {!notamsLoading && !notamsError && notams && notams.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">No NOTAMs returned.</p>
                  )}
                  {!notamsLoading && !notamsError && notams && notams.length > 0 && (
                    <ul className="space-y-3">
                      {notams.slice(0, 50).map((n, i) => (
                        <li key={`${n.number}-${i}`} className="text-xs border-b border-border/50 pb-2 last:border-0">
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-semibold text-foreground mb-0.5">
                            <span className="font-mono">{n.number}</span>
                            <span className="text-muted-foreground">{n.class}</span>
                            {(n.startDateUtc || n.endDateUtc) && (
                              <span className="text-muted-foreground">
                                {[n.startDateUtc, n.endDateUtc].filter(Boolean).join(" → ")}
                              </span>
                            )}
                          </div>
                          <p className="text-foreground/90 leading-snug whitespace-pre-wrap break-words">{n.condition}</p>
                        </li>
                      ))}
                      {notams.length > 50 && (
                        <li className="text-muted-foreground text-xs pt-1">
                          +{notams.length - 50} more NOTAMs
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
