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
import { PlaneIcon, ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, FileWarningIcon, Trash2Icon, RefreshCwIcon, XIcon, GlobeIcon } from "lucide-react";
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

const BROWSE_LOADING_STEPS = [
  { id: "browse-1", label: "Loading…", duration: 400 },
  { id: "browse-2", label: "Ready", duration: 250 },
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

const USA_STATE_ABBR: Record<string, string> = {
  "Alaska": "AK", "American Samoa": "AS", "Arizona": "AZ", "California": "CA", "Colorado": "CO",
  "Connecticut": "CT", "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA", "Guam": "GU",
  "Hawaii": "HI", "Illinois": "IL", "Indiana": "IN", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
  "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
  "Missouri": "MO", "Nevada": "NV", "New Jersey": "NJ", "New York": "NY", "North Carolina": "NC",
  "Northern Mariana Islands": "MP", "Ohio": "OH", "Oregon": "OR", "Palau Island": "PW",
  "Pennsylvania": "PA", "Puerto Rico": "PR", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Virgin Islands": "VI", "Washington": "WA", "Wisconsin": "WI",
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
}: {
  airport: AIPAirport;
  isSelected?: boolean;
  onSelect?: () => void;
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

type RegionEntry = { region: string; countries: string[] };

export default function AIPPortalPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [results, setResults] = useState<AIPAirport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionEntry[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [loadingCountry, setLoadingCountry] = useState(false);
  const [browseMenuOpen, setBrowseMenuOpen] = useState(false);
  const [browseStep, setBrowseStep] = useState<1 | 2 | 3 | 4>(1);
  const [browseSelection, setBrowseSelection] = useState<AIPAirport[]>([]);
  const [browseSelectedCountry, setBrowseSelectedCountry] = useState<string>("");
  const [browseSelectedState, setBrowseSelectedState] = useState<string>("");
  const [usaStates, setUsaStates] = useState<string[]>([]);
  const [browseCountryAirports, setBrowseCountryAirports] = useState<AIPAirport[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingStepIndex, setBrowseLoadingStepIndex] = useState(0);
  const [notamsCache, setNotamsCache] = useState<Record<string, { notams: NotamItem[]; error: string | null; detail?: string; updatedAt?: string | null }>>({});
  const [notamsLoadingIcao, setNotamsLoadingIcao] = useState<string | null>(null);
  const [notamsSyncingIcao, setNotamsSyncingIcao] = useState<string | null>(null);
  const [notamsSyncSteps, setNotamsSyncSteps] = useState<string[]>([]);
  const [syncRequestedIcao, setSyncRequestedIcao] = useState<string | null>(null);
  const [eadAirports, setEadAirports] = useState<AIPAirport[]>([]);
  const [eadAirportsLoading, setEadAirportsLoading] = useState(true);
  const selectedAirport = useMemo(() => {
    if (!results?.length || !selectedIcao) return null;
    return results.find((a) => a.icao === selectedIcao) ?? null;
  }, [results, selectedIcao]);

  const viewingAirport = selectedAirport;

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

  useEffect(() => {
    fetch("/api/regions")
      .then((res) => res.json())
      .then((data) => setRegions(data.regions ?? []))
      .catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    fetch("/api/ead-extracted")
      .then((res) => res.json())
      .then((data) => {
        const list = (data.airports ?? []) as Array<{
          "Airport Code"?: string;
          "Airport Name"?: string;
          "AD2.2 Types of Traffic Permitted"?: string;
          "AD2.2 Remarks"?: string;
          "AD2.3 AD Operator"?: string;
          "AD 2.3 Customs and Immigration"?: string;
          "AD2.3 ATS"?: string;
          "AD2.3 Remarks"?: string;
          "AD2.6 AD category for fire fighting"?: string;
        }>;
        setEadAirports(
          list.map((a) => ({
            country: "EAD (EU AIP)",
            gen1_2: "",
            gen1_2_point_4: "",
            icao: a["Airport Code"] ?? "",
            name: a["Airport Name"] ?? "",
            trafficPermitted: a["AD2.2 Types of Traffic Permitted"] ?? "",
            trafficRemarks: a["AD2.2 Remarks"] ?? "",
            operator: a["AD2.3 AD Operator"] ?? "",
            customsImmigration: a["AD 2.3 Customs and Immigration"] ?? "",
            ats: a["AD2.3 ATS"] ?? "",
            atsRemarks: a["AD2.3 Remarks"] ?? "",
            fireFighting: a["AD2.6 AD category for fire fighting"] ?? "",
          }))
        );
      })
      .catch(() => setEadAirports([]))
      .finally(() => setEadAirportsLoading(false));
  }, []);

  const countriesInRegion = useMemo(() => {
    if (!selectedRegion) return [];
    const r = regions.find((x) => x.region === selectedRegion);
    return r?.countries ?? [];
  }, [regions, selectedRegion]);

  const isUSABrowse = browseSelectedCountry === "United States of America";
  const regionHasUSA = countriesInRegion.includes("United States of America");

  useEffect(() => {
    if (isUSABrowse && browseStep === 3) {
      fetch("/api/usa-states")
        .then((res) => res.json())
        .then((data) => setUsaStates(data.states ?? []))
        .catch(() => setUsaStates([]));
    }
  }, [isUSABrowse, browseStep]);

  useEffect(() => {
    const shouldFetchNonUSA = browseStep === 3 && browseSelectedCountry && !isUSABrowse;
    const shouldFetchUSA = browseStep === 4 && browseSelectedCountry === "United States of America" && browseSelectedState;
    if (!shouldFetchNonUSA && !shouldFetchUSA) return;
    setLoadingCountry(true);
    const url = shouldFetchUSA
      ? `/api/airports?country=${encodeURIComponent(browseSelectedCountry)}&state=${encodeURIComponent(browseSelectedState)}`
      : `/api/airports?country=${encodeURIComponent(browseSelectedCountry)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setBrowseCountryAirports(data.results ?? []);
      })
      .catch(() => setBrowseCountryAirports([]))
      .finally(() => setLoadingCountry(false));
  }, [browseStep, browseSelectedCountry, browseSelectedState, isUSABrowse]);

  const requestSyncNotams = useCallback((icao: string) => {
    setSyncRequestedIcao(icao);
  }, []);

  // Fetch NOTAMs only on first view (no cache) or when user presses Sync. Do NOT re-scrape when re-entering a tab (use cache).
  useEffect(() => {
    const icao = viewingAirport?.icao ?? null;
    if (!icao || !viewingAirport?.lat) return;

    const hasCache = icao in notamsCache;
    const syncRequested = syncRequestedIcao === icao;
    if (hasCache && !syncRequested) return; // re-entering tab: use cached NOTAMs, do not scrape

    const isSync = syncRequested || !hasCache;
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

  const runBrowseLoading = useCallback(async (then: () => void) => {
    setBrowseLoading(true);
    setBrowseLoadingStepIndex(0);
    for (let i = 0; i < BROWSE_LOADING_STEPS.length; i++) {
      setBrowseLoadingStepIndex(i);
      await new Promise((r) => setTimeout(r, BROWSE_LOADING_STEPS[i].duration));
    }
    then();
    setBrowseLoading(false);
  }, []);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);

    try {
      await runFakeLoadingSteps();
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      let data: { results?: AIPAirport[]; error?: string };
      try {
        data = await res.json();
      } catch {
        setError(res.ok ? "Invalid response from server." : "Search failed. Please try again.");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Search failed");
        return;
      }

      const newResults = data.results ?? [];
      setResults((prev) => {
        const next = [...(prev ?? [])];
        newResults.forEach((a: AIPAirport) => {
          if (!next.some((x) => x.icao === a.icao)) next.push(a);
        });
        return next;
      });
      if (newResults.length > 0) {
        setSelectedIcao(newResults[0].icao);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
      setStepIndex(0);
      setHasSearched(true);
    }
  }, [query, runFakeLoadingSteps]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") search();
  };

  const showMap = results?.length && selectedAirport?.lat != null;

  return (
    <div className="h-screen w-full flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 overflow-hidden">
      <div className={`flex-1 w-full min-h-0 overflow-auto p-4 sm:p-6 lg:p-8 ${showMap ? "lg:flex lg:flex-col lg:gap-6 lg:max-w-[1600px] lg:mx-auto" : ""}`}>
        <div className={showMap ? "lg:flex lg:min-h-0 lg:flex-1 lg:gap-6 lg:overflow-hidden lg:w-full" : "w-full max-w-2xl mx-auto space-y-6 sm:space-y-8"}>
          {/* Left column: search + results */}
          <div className={showMap ? "lg:min-w-0 lg:flex-1 lg:flex lg:flex-col lg:overflow-hidden" : "space-y-6 sm:space-y-8"}>
            <header className="text-center space-y-1.5 sm:space-y-2 shrink-0">
              <img
                src="/header_logo_white.svg"
                alt="Clearway"
                className="mx-auto h-10 sm:h-12 w-auto max-w-[280px] object-contain [filter:brightness(0)]"
              />
            </header>

            <div className={showMap ? "lg:min-h-0 lg:flex-1 lg:overflow-auto lg:space-y-6" : "space-y-6 sm:space-y-8"}>
        <Card className="shadow-md border-border/80 shrink-0">
          <CardHeader className="pb-2 px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg font-semibold">
              Search airport data
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              Enter airport code (ICAO) or name (e.g. OIAA, Iran, ABADAN)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 sm:px-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => {
                    setBrowseMenuOpen((o) => !o);
                    if (!browseMenuOpen) {
                      setBrowseStep(1);
                      setBrowseSelection([]);
                      setBrowseSelectedState("");
                    }
                  }}
                  aria-expanded={browseMenuOpen}
                >
                  <GlobeIcon className="size-4 shrink-0" />
                  {selectedRegion && selectedCountry
                    ? selectedCountry === "United States of America" && (selectedState || browseSelectedState)
                      ? `${selectedRegion} → ${selectedCountry} → ${selectedState || browseSelectedState}`
                      : `${selectedRegion} → ${selectedCountry}`
                    : "Browse by region & country"}
                  {browseMenuOpen ? <ChevronUpIcon className="size-4 shrink-0" /> : <ChevronDownIcon className="size-4 shrink-0" />}
                </Button>
                {selectedCountry && getCountryFlagUrl(selectedCountry) && (
                  <img
                    src={getCountryFlagUrl(selectedCountry)!}
                    alt=""
                    width={28}
                    height={21}
                    className="rounded-sm shrink-0 object-cover border border-border"
                  />
                )}
                {loadingCountry && <Spinner className="size-5 text-muted-foreground" />}
              </div>

              {browseMenuOpen && (
                <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-4 shadow-sm animate-browse-menu-in overflow-hidden">
                  {/* Step indicator: 4 steps when region has USA (region → country → state → airports), 3 otherwise */}
                  <div className="flex items-center gap-1.5">
                    {(regionHasUSA ? [1, 2, 3, 4] : [1, 2, 3]).map((s) => (
                      <div
                        key={s}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          browseStep >= s ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>

                  {browseLoading ? (
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <PlaneIcon className="size-6 text-primary animate-fly" strokeWidth={1.8} aria-hidden />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {browseStep === 1 ? "Loading region…" : browseStep === 2 ? "Loading country…" : "Adding airports…"}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {BROWSE_LOADING_STEPS.map((step, i) => (
                          <div key={step.id} className="flex items-center gap-2 text-sm">
                            {i < browseLoadingStepIndex ? (
                              <span className="text-primary">✓</span>
                            ) : i === browseLoadingStepIndex ? (
                              <Spinner className="size-3.5 text-primary" />
                            ) : (
                              <span className="text-muted-foreground/50">○</span>
                            )}
                            <span className={i <= browseLoadingStepIndex ? "text-foreground" : "text-muted-foreground/70"}>
                              {step.label}
                            </span>
                          </div>
                        ))}
                      </div>
                      <Progress value={((browseLoadingStepIndex + 1) / BROWSE_LOADING_STEPS.length) * 100} className="h-1.5" />
                    </div>
                  ) : browseStep === 1 ? (
                    <div className="animate-step-enter space-y-4">
                      <p className="text-sm font-semibold text-foreground">Select region</p>
                      <div className="flex flex-wrap gap-2">
                        {regions.map((r) => (
                          <Button
                            key={r.region}
                            type="button"
                            variant={selectedRegion === r.region ? "default" : "outline"}
                            size="sm"
                            className="h-10 gap-1.5 transition-all duration-200 hover:scale-[1.02] hover:shadow-sm"
                            onClick={() => {
                              setSelectedRegion(r.region);
                              setSelectedCountry("");
                              setSelectedState("");
                              setBrowseStep(2);
                            }}
                          >
                            {r.region}
                            <ChevronRightIcon className="size-4" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!browseLoading && browseStep === 2 && (
                    <div className="animate-step-enter space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">Select country</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setBrowseStep(1)}
                        >
                          ← Back
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{selectedRegion}</p>
                      <div className="flex flex-wrap gap-2 max-h-[180px] overflow-y-auto pr-1">
                        {countriesInRegion.map((c, i) => (
                          <Button
                            key={c}
                            type="button"
                            variant={selectedCountry === c ? "default" : "outline"}
                            size="sm"
                            className="h-10 gap-1.5 transition-all duration-200 hover:scale-[1.02] hover:shadow-sm"
                            style={{ animationDelay: `${i * 30}ms` }}
                            onClick={() => {
                              setBrowseSelectedCountry(c);
                              setBrowseStep(3);
                            }}
                          >
                            {getCountryFlagUrl(c) && (
                              <img
                                src={getCountryFlagUrl(c)!}
                                alt=""
                                width={20}
                                height={15}
                                className="rounded-sm shrink-0 object-cover"
                              />
                            )}
                            {c}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!browseLoading && browseStep === 3 && isUSABrowse && (
                    <div className="animate-step-enter space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">Select state or territory</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setBrowseStep(2)}
                        >
                          ← Back
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{selectedRegion} → {browseSelectedCountry}</p>
                      <div className="flex flex-wrap gap-2 max-h-[180px] overflow-y-auto pr-1">
                        {usaStates.map((stateName, i) => (
                          <Button
                            key={stateName}
                            type="button"
                            variant={browseSelectedState === stateName ? "default" : "outline"}
                            size="sm"
                            className="h-10 gap-1.5 transition-all duration-200 hover:scale-[1.02] hover:shadow-sm"
                            style={{ animationDelay: `${i * 30}ms` }}
                            onClick={() => {
                              setBrowseSelectedState(stateName);
                              setBrowseStep(4);
                            }}
                          >
                            {USA_STATE_ABBR[stateName] ? (
                              <>
                                <span className="font-mono text-muted-foreground shrink-0">({USA_STATE_ABBR[stateName]})</span>
                                {stateName}
                              </>
                            ) : (
                              stateName
                            )}
                            <ChevronRightIcon className="size-4" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!browseLoading && (browseStep === 3 && !isUSABrowse || browseStep === 4) && (
                    <div className="animate-step-enter space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">Select airport(s)</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => browseStep === 4 ? setBrowseStep(3) : setBrowseStep(2)}
                        >
                          ← Back
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {browseStep === 4
                          ? `${selectedRegion} → ${browseSelectedCountry} → ${browseSelectedState} · Click to toggle, then Done`
                          : `${selectedRegion} → ${browseSelectedCountry} · Click to toggle, then Done`}
                      </p>
                      <div className="max-h-[240px] overflow-y-auto space-y-1.5 pr-1">
                        {loadingCountry ? (
                          <div className="flex items-center justify-center py-8">
                            <Spinner className="size-6 text-primary" />
                          </div>
                        ) : browseCountryAirports.length > 0 ? (
                          browseCountryAirports.map((airport, i) => {
                            const isSelected = browseSelection.some((a) => a.icao === airport.icao);
                            return (
                              <button
                                key={airport.icao}
                                type="button"
                                onClick={() => {
                                  setBrowseSelection((prev) =>
                                    isSelected
                                      ? prev.filter((a) => a.icao !== airport.icao)
                                      : [...prev, airport]
                                  );
                                }}
                                className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                                  isSelected
                                    ? "border-primary bg-primary/15 shadow-sm"
                                    : "border-border/80 bg-background/80 hover:bg-primary/5 hover:border-primary/20"
                                }`}
                                style={{ animationDelay: `${i * 25}ms` }}
                              >
                                <span
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-medium transition-colors ${
                                    isSelected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-muted-foreground/40 bg-background"
                                  }`}
                                >
                                  {isSelected ? "✓" : ""}
                                </span>
                                {getCountryFlagUrl(airport.country) && (
                                  <img
                                    src={getCountryFlagUrl(airport.country)!}
                                    alt=""
                                    width={24}
                                    height={18}
                                    className="rounded shrink-0 object-cover"
                                  />
                                )}
                                <span className="font-mono text-sm font-semibold text-primary shrink-0">
                                  {airport.icao}
                                </span>
                                <span className="text-sm text-muted-foreground truncate min-w-0">
                                  {airport.name}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            No airports found for this country.
                          </p>
                        )}
                      </div>
                      {browseCountryAirports.length > 0 && (
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                          <span className="text-xs text-muted-foreground">
                            {browseSelection.length} selected
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              if (browseSelection.length > 0) {
                                runBrowseLoading(() => {
                                  const merged = [...(results ?? []), ...browseSelection];
                                  const byIcao = merged.filter((a, i, arr) => arr.findIndex((x) => x.icao === a.icao) === i);
                                  setResults(byIcao);
                                  const withCoords = byIcao.find((a) => a.lat != null && a.lon != null);
                                  setSelectedIcao(withCoords?.icao ?? browseSelection[0].icao);
                                  setSelectedCountry(browseSelectedCountry);
                                  setSelectedState(browseSelectedCountry === "United States of America" ? browseSelectedState : "");
                                  setBrowseMenuOpen(false);
                                  setHasSearched(true);
                                });
                              }
                            }}
                            disabled={browseSelection.length === 0}
                          >
                            Done{browseSelection.length > 0 ? ` (${browseSelection.length})` : ""}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or search</span>
              </div>
            </div>

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

            {!loading && hasSearched && (
              <div className="space-y-3 pt-2">
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                {!error && results === null && (
                  <p className="text-sm text-muted-foreground">Search failed. Try again.</p>
                )}
                {!error && results !== null && results.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No airports found. Try ICAO (e.g. OIAA), airport name, or country.
                  </p>
                )}
                {!error && results !== null && results.length === 1 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      1 result retrieved
                    </p>
                    <AIPResultCard
                      key={`${results[0].icao}-${results[0].country}`}
                      airport={results[0]}
                      isSelected={true}
                    />
                  </div>
                )}
                {!error && results !== null && results.length > 1 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {results.length} airports — switch tab to view
                    </p>
                    <div className="flex items-end gap-0.5 overflow-x-auto min-h-[52px] border-b border-border -mx-1 px-1">
                      {results.map((airport, i) => {
                        const isActive = viewingAirport?.icao === airport.icao;
                        const flagUrl = getCountryFlagUrl(airport.country);
                        return (
                          <div
                            key={`${airport.icao}-${airport.country}`}
                            className={`flex items-center rounded-t-lg border border-b-0 shrink-0 overflow-hidden transition-all duration-150 ${
                              isActive
                                ? "bg-card border-border shadow-[0_-1px_0_0_hsl(var(--card))] z-[1]"
                                : "border-transparent bg-muted/50 hover:bg-muted/80"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIcao(airport.icao);
                              }}
                              className="flex items-center gap-2 px-4 py-3 text-sm font-mono font-semibold text-foreground min-w-0"
                            >
                              {flagUrl && (
                                <img
                                  src={flagUrl}
                                  alt=""
                                  width={28}
                                  height={21}
                                  className="rounded shrink-0 object-cover border border-border/60"
                                />
                              )}
                              {airport.icao}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = results.filter((_, j) => j !== i);
                                setResults(next.length ? next : []);
                                setSelectedIcao(next.length ? (next[0].icao === airport.icao ? next[0].icao : selectedIcao ?? next[0].icao) : null);
                              }}
                              className="p-2 text-muted-foreground hover:text-destructive hover:bg-muted/80 rounded-sm shrink-0"
                              title="Close tab"
                            >
                              <XIcon className="size-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {viewingAirport && (
                      <AIPResultCard
                        key={`${viewingAirport.icao}-${viewingAirport.country}`}
                        airport={viewingAirport}
                        isSelected={true}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md border-border/80 shrink-0">
          <CardHeader className="pb-2 px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg font-semibold">
              EAD AIP extracted
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              Airports from EAD AD 2 PDFs (download &amp; extract via <a href="/aip-test" className="text-primary hover:underline">/aip-test</a>)
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4">
            {eadAirportsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Spinner className="size-4" />
                Loading…
              </div>
            ) : eadAirports.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No EAD data yet. Use <a href="/aip-test" className="text-primary hover:underline">/aip-test</a> to download and extract.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {eadAirports.map((airport) => (
                  <AIPResultCard
                    key={airport.icao}
                    airport={airport}
                    isSelected={viewingAirport?.icao === airport.icao}
                    onSelect={() => {
                      setResults([airport]);
                      setSelectedIcao(airport.icao);
                      setHasSearched(true);
                    }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] sm:text-xs text-muted-foreground lg:text-left shrink-0">
          Data sourced from official AIP publications. For operational use only.
        </p>
        <div className="flex flex-col items-center gap-1.5 pt-4 shrink-0">
          <span className="text-[10px] sm:text-xs text-muted-foreground/80 uppercase tracking-wider">Built by</span>
          <img src="/logo.png" alt="Clearway" className="h-14 sm:h-16 w-auto max-w-[320px] object-contain opacity-90 hover:opacity-100 transition-opacity" />
        </div>
            </div>
          </div>

          {/* Right column: map + NOTAMs (only when viewing an airport with coords) */}
          {showMap && viewingAirport && (
            <div className="hidden lg:flex lg:shrink-0 lg:w-[min(420px,42vw)] lg:flex-col lg:min-h-0 rounded-xl overflow-hidden border border-border/80 shadow-md bg-card">
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
