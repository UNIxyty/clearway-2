"use client";

// Airport SEARCH (audit §5.2): the search half of the old app/page.tsx
// monolith — search card + live suggestions, the browse-by-region wizard and
// the "Recently opened" table. The airport detail moved to /aip/<ICAO>
// (components/portal/AirportView.tsx); picking a result, a suggestion or
// wizard-Done NAVIGATES there instead of flipping in-page state. Legacy
// /aip?icao=XXXX (and the old /?icao=XXXX) deep links are redirected to the
// real airport route on mount.

import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { PlaneIcon, ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, Trash2Icon, XIcon, GlobeIcon, SearchIcon, SquareIcon } from "lucide-react";
import PortalShell from "@/components/portal/Shell";
import { PButton, PCard, PMono, PSectionTitle, PTh } from "@/components/portal/ui";
import { getCountryFlagUrl } from "@/lib/country-flags";
import { useBackgroundSearch, type SyncStage } from "@/lib/search-context";
import { sendNotification, type NotificationPrefs, DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications";
import BugReportsHoverBanner from "@/components/bug-reports-hover-banner";
import type { BugReportRow } from "@/lib/bug-reports-shared";
import {
  type AIPAirport,
  type RecentEntry,
  RECENTS_STORAGE_KEY,
  isEadIcao,
} from "@/components/portal/AirportView";

const BROWSE_LOADING_STEPS = [
  { id: "browse-1", label: "Loading…", duration: 400 },
  { id: "browse-2", label: "Ready", duration: 250 },
];

function formatRecentTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} d ago`;
  return new Date(ts).toLocaleDateString();
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

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

type RegionEntry = { region: string; countries: string[] };

function AIPSearchPageInner() {
  const { bgList, startBackground, updateStage, finishBackground, cancelBackground } = useBackgroundSearch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AIPAirport[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestHighlight, setSuggestHighlight] = useState(-1);
  const [results, setResults] = useState<AIPAirport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
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
  const [browseDeletingIcaos, setBrowseDeletingIcaos] = useState<Record<string, boolean>>({});
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingStepIndex, setBrowseLoadingStepIndex] = useState(0);
  const [browseCountrySearch, setBrowseCountrySearch] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [bugReports, setBugReports] = useState<BugReportRow[]>([]);
  const [recents, setRecents] = useState<RecentEntry[]>([]);

  const [bugReportError, setBugReportError] = useState<string | null>(null);
  const [deletingBugReportId, setDeletingBugReportId] = useState<string | null>(null);

  // Load "Recently opened" entries once on mount (client-only localStorage list).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RecentEntry[];
      if (Array.isArray(parsed)) {
        setRecents(parsed.filter((r) => r && typeof r.icao === "string"));
      }
    } catch {
      // corrupt or unavailable localStorage — start with an empty list
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadBugReports = async () => {
      try {
        const res = await fetch("/api/bug-reports", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json().catch(() => ({}))) as { reports?: BugReportRow[] };
        if (!cancelled) setBugReports(Array.isArray(payload.reports) ? payload.reports : []);
      } catch {
        // best effort
      }
    };
    loadBugReports();
    const id = window.setInterval(loadBugReports, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const deleteFixedBugReport = useCallback(async (reportId: string) => {
    if (!reportId) return;
    setDeletingBugReportId(reportId);
    try {
      const res = await fetch(`/api/bug-reports/${encodeURIComponent(reportId)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; deleted?: boolean };
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      if (body.deleted) {
        setBugReports((prev) => prev.filter((report) => report.id !== reportId));
      }
    } catch (err) {
      setBugReportError(err instanceof Error ? err.message : "Failed to delete fixed bug report");
    } finally {
      setDeletingBugReportId(null);
    }
  }, []);

  const handledIcaoParamRef = useRef<string | null>(null);
  const requestControllersRef = useRef<Map<string, AbortController>>(new Map());
  const suggestAbortRef = useRef<AbortController | null>(null);
  const suggestDebounceRef = useRef<number | null>(null);

  const beginRequest = useCallback((key: string) => {
    const prev = requestControllersRef.current.get(key);
    if (prev) prev.abort();
    const controller = new AbortController();
    requestControllersRef.current.set(key, controller);
    return controller;
  }, []);

  const finishRequest = useCallback((key: string, controller: AbortController) => {
    if (requestControllersRef.current.get(key) === controller) {
      requestControllersRef.current.delete(key);
    }
  }, []);

  const isAbortError = useCallback((err: unknown) => {
    const msg = String((err as { message?: string })?.message || "").toLowerCase();
    const name = String((err as { name?: string })?.name || "").toLowerCase();
    return name === "aborterror" || msg.includes("aborted") || msg.includes("aborterror");
  }, []);

  const stopAllRequests = useCallback(() => {
    for (const controller of requestControllersRef.current.values()) controller.abort();
    requestControllersRef.current.clear();
  }, []);

  useEffect(() => {
    return () => stopAllRequests();
  }, [stopAllRequests]);

  useEffect(() => {
    fetch("/api/regions", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setRegions(data.regions ?? []))
      .catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((res) => res.json())
      .then((data) => {
        if (data.preferences) {
          const p = data.preferences;
          setNotifPrefs((prev) => ({
            ...prev,
            notify_enabled: p.notify_enabled ?? prev.notify_enabled,
            notify_search_start: p.notify_search_start ?? prev.notify_search_start,
            notify_search_end: p.notify_search_end ?? prev.notify_search_end,
            notify_notam: p.notify_notam ?? prev.notify_notam,
            notify_aip: p.notify_aip ?? prev.notify_aip,
            notify_gen: p.notify_gen ?? prev.notify_gen,
          }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/admin/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { isAdmin: false }))
      .then((data) => setIsAdmin(Boolean(data?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  const countriesInRegion = useMemo(() => {
    if (!selectedRegion) return [];
    const r = regions.find((x) => x.region === selectedRegion);
    return r?.countries ?? [];
  }, [regions, selectedRegion]);

  const allCountriesWithRegion = useMemo(() => {
    const out: { country: string; region: string }[] = [];
    for (const r of regions) {
      for (const c of r.countries ?? []) {
        out.push({ country: c, region: r.region });
      }
    }
    return out;
  }, [regions]);

  const countrySearchMatches = useMemo(() => {
    const q = browseCountrySearch.trim().toLowerCase();
    if (!q) return [];
    const scored = allCountriesWithRegion
      .map(({ country, region }) => {
        const cl = country.toLowerCase();
        const rl = region.toLowerCase();
        const inCountry = cl.includes(q);
        const inRegion = rl.includes(q);
        if (!inCountry && !inRegion) return null;
        let score = 0;
        if (cl.startsWith(q)) score += 100;
        else if (inCountry) score += 50;
        if (rl.startsWith(q)) score += 30;
        else if (inRegion) score += 10;
        return { country, region, score };
      })
      .filter(Boolean) as { country: string; region: string; score: number }[];
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.country.localeCompare(b.country, undefined, { sensitivity: "base" });
    });
    const seen = new Set<string>();
    const deduped: { country: string; region: string }[] = [];
    for (const row of scored) {
      const key = row.country.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({ country: row.country, region: row.region });
      if (deduped.length >= 50) break;
    }
    return deduped;
  }, [allCountriesWithRegion, browseCountrySearch]);

  const applyBrowseCountrySelection = useCallback((country: string, region: string) => {
    setSelectedRegion(region);
    setSelectedCountry("");
    setSelectedState("");
    setBrowseSelectedState("");
    setBrowseSelection([]);
    setBrowseSelectedCountry(country);
    setBrowseCountrySearch("");
    setBrowseStep(3);
  }, []);

  useEffect(() => {
    if (!browseMenuOpen || browseStep !== 1) return;

    function handleKeydown(event: KeyboardEvent) {
      if (isEditableElement(event.target)) return;

      const hasOneMatch = browseCountrySearch.trim().length > 0 && countrySearchMatches.length === 1;
      if (event.key === "Enter" && hasOneMatch) {
        event.preventDefault();
        const only = countrySearchMatches[0];
        applyBrowseCountrySelection(only.country, only.region);
        return;
      }

      if (event.key === "Escape") {
        setBrowseCountrySearch("");
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        setBrowseCountrySearch((prev) => prev.slice(0, -1));
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Prevent native key insertion when we programmatically focus the search input.
        event.preventDefault();
        setBrowseCountrySearch((prev) => prev + event.key);
      } else {
        return;
      }

      const input = document.getElementById("browse-country-search");
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [applyBrowseCountrySelection, browseCountrySearch, browseMenuOpen, browseStep, countrySearchMatches]);

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
    fetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setBrowseCountryAirports(data.results ?? []);
      })
      .catch(() => setBrowseCountryAirports([]))
      .finally(() => setLoadingCountry(false));
  }, [browseStep, browseSelectedCountry, browseSelectedState, isUSABrowse]);

  const deleteAirportFromPortal = useCallback(async (airport: AIPAirport) => {
    const icao = airport.icao.toUpperCase();
    setBrowseDeletingIcaos((prev) => ({ ...prev, [icao]: true }));
    try {
      const res = await fetch("/api/airports/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icao }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(data.error || "Failed to hide airport.");

      setBrowseCountryAirports((prev) => prev.filter((a) => a.icao !== icao));
      setBrowseSelection((prev) => prev.filter((a) => a.icao !== icao));
      setResults((prev) => (prev ? prev.filter((a) => a.icao !== icao) : prev));
    } catch (e) {
      setError((e as { message?: string })?.message || "Failed to hide airport.");
    } finally {
      setBrowseDeletingIcaos((prev) => {
        const next = { ...prev };
        delete next[icao];
        return next;
      });
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

  const search = useCallback(async (queryOverride?: string) => {
    const q = (queryOverride ?? query).trim();
    if (!q) return;
    const qUpper = q.toUpperCase();

    setLoading(true);
    setError(null);
    startBackground(qUpper);
    updateStage(qUpper, "airport", "running", "Searching…");
    sendNotification("search_start", "Search started", `Looking up ${qUpper}…`, notifPrefs);

    if (queryOverride === undefined && searchParams.get("fromBanner") === "1") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("fromBanner");
      router.replace(params.toString() ? `/aip?${params.toString()}` : "/aip");
    }

    const searchController = beginRequest("airport-search");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: searchController.signal });
      let data: { results?: AIPAirport[]; error?: string };
      try {
        data = await res.json();
      } catch {
        setError(res.ok ? "Invalid response from server." : "Search failed. Please try again.");
        updateStage(qUpper, "airport", "error", "Search failed");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Search failed");
        updateStage(qUpper, "airport", "error", data.error || "Search failed");
        return;
      }

      let newResults = data.results ?? [];
      if (qUpper.length === 4 && isEadIcao(qUpper) && !newResults.some((r: AIPAirport) => r.icao.toUpperCase() === qUpper)) {
        newResults = [
          ...newResults,
          {
            country: "EAD (EU AIP)",
            gen1_2: "",
            gen1_2_point_4: "",
            icao: qUpper,
            name: "EAD UNDEFINED",
            publicationDate: "",
            trafficPermitted: "",
            trafficRemarks: "",
            ad22Operator: "",
            ad22Address: "",
            ad22Telephone: "",
            ad22Telefax: "",
            ad22Email: "",
            ad22Afs: "",
            ad22Website: "",
            operator: "",
            customsImmigration: "",
            ats: "",
            atsRemarks: "",
            fireFighting: "",
            runwayNumber: "",
            runwayDimensions: "",
          } as AIPAirport,
        ];
      }
      setResults((prev) => {
        const next = [...(prev ?? [])];
        newResults.forEach((a: AIPAirport) => {
          if (!next.some((x) => x.icao === a.icao)) next.push(a);
        });
        return next;
      });
      if (newResults.length === 1) {
        // One result = the airport itself: navigate to its page (the
        // suggestion and legacy ?icao= paths land here too).
        router.push(`/aip/${newResults[0].icao.toUpperCase()}`);
      }
      updateStage(qUpper, "airport", "done", "Airport loaded");
      sendNotification("search_end", "Search completed", `${qUpper} ready`, notifPrefs);

      // Fire-and-forget search analytics (per-user, Supabase-backed)
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[search/log] sending", { query: q, resultCount: newResults.length });
      }
      fetch("/api/search/log", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, resultCount: newResults.length, source: "search" }),
      })
        .then(async (res) => {
          const text = await res.text();
          const data = (() => {
            try {
              return JSON.parse(text);
            } catch {
              return { raw: text };
            }
          })();
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[search/log] response", res.status, data);
          }
        })
        .catch((err) => {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[search/log] fetch failed", err);
          }
        });
    } catch (err) {
      if (isAbortError(err)) {
        updateStage(qUpper, "airport", "cancelled", "Search cancelled");
        cancelBackground(qUpper, "Search cancelled");
        return;
      }
      setError("Connection error. Please try again.");
      updateStage(qUpper, "airport", "error", "Connection error");
    } finally {
      finishRequest("airport-search", searchController);
      setLoading(false);
      setHasSearched(true);
    }
  }, [query, notifPrefs, startBackground, updateStage, searchParams, router, beginRequest, finishRequest, isAbortError, cancelBackground]);

  const stopSearch = useCallback(() => {
    stopAllRequests();
    setLoading(false);
    for (const item of bgList) {
      const hasRunning = Object.values(item.stages).some((s) => s === "running");
      if (hasRunning) {
        for (const [stage, status] of Object.entries(item.stages) as Array<[SyncStage, typeof item.stages[SyncStage]]>) {
          if (status === "running") updateStage(item.icao, stage, "cancelled", "Search cancelled");
        }
        cancelBackground(item.icao, "Search cancelled");
      }
    }
  }, [stopAllRequests, bgList, updateStage, cancelBackground]);

  // Legacy deep link: /aip?icao=EVRA (and the old /?icao=EVRA behaviour) →
  // the real airport route. Non-ICAO values fall back to a normal search.
  useEffect(() => {
    const icaoParam = searchParams.get("icao")?.trim().toUpperCase() ?? "";
    if (!icaoParam) {
      handledIcaoParamRef.current = null;
      return;
    }
    if (handledIcaoParamRef.current === icaoParam) return;
    handledIcaoParamRef.current = icaoParam;
    if (/^[A-Za-z0-9]{4}$/.test(icaoParam)) {
      router.replace(`/aip/${icaoParam}`);
      return;
    }
    setQuery(icaoParam);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("icao");
    params.delete("fromBanner");
    router.replace(params.toString() ? `/aip?${params.toString()}` : "/aip");
    void search(icaoParam);
  }, [searchParams, search, router]);

  useEffect(() => {
    if (loading) return;
    const finishable = bgList.filter((item) => !item.done && (item.stages.airport === "done" || item.stages.airport === "error"));
    for (const item of finishable) {
      finishBackground(item.icao);
    }
  }, [bgList, loading, finishBackground]);

  // Live search suggestions: debounce 250ms, >=2 chars, reuse the existing
  // /api/search endpoint with an AbortController per keystroke.
  const closeSuggestions = useCallback(() => {
    if (suggestDebounceRef.current != null) {
      window.clearTimeout(suggestDebounceRef.current);
      suggestDebounceRef.current = null;
    }
    suggestAbortRef.current?.abort();
    suggestAbortRef.current = null;
    setSuggestOpen(false);
    setSuggestHighlight(-1);
  }, []);

  useEffect(() => {
    return () => {
      if (suggestDebounceRef.current != null) window.clearTimeout(suggestDebounceRef.current);
      suggestAbortRef.current?.abort();
    };
  }, []);

  const rankSuggestions = useCallback((list: AIPAirport[], q: string): AIPAirport[] => {
    const qUp = q.toUpperCase();
    const qLow = q.toLowerCase();
    const score = (a: AIPAirport) => {
      const icao = String(a.icao || "").toUpperCase();
      if (icao === qUp) return 0;
      if (icao.startsWith(qUp)) return 1;
      if (
        String(a.name || "").toLowerCase().includes(qLow) ||
        String(a.country || "").toLowerCase().includes(qLow)
      ) {
        return 2;
      }
      return 3;
    };
    const seen = new Set<string>();
    const deduped = list.filter((a) => {
      const key = String(a.icao || "").toUpperCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [...deduped].sort((a, b) => score(a) - score(b)).slice(0, 8);
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (suggestDebounceRef.current != null) {
      window.clearTimeout(suggestDebounceRef.current);
      suggestDebounceRef.current = null;
    }
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      suggestAbortRef.current?.abort();
      suggestAbortRef.current = null;
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestHighlight(-1);
      return;
    }
    suggestDebounceRef.current = window.setTimeout(() => {
      suggestDebounceRef.current = null;
      suggestAbortRef.current?.abort();
      const controller = new AbortController();
      suggestAbortRef.current = controller;
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data: { results?: AIPAirport[] }) => {
          if (controller.signal.aborted) return;
          const ranked = rankSuggestions(data.results ?? [], trimmed);
          setSuggestions(ranked);
          setSuggestOpen(ranked.length > 0);
          setSuggestHighlight(-1);
        })
        .catch(() => {
          // aborted or network error — leave dropdown as-is
        });
    }, 250);
  }, [rankSuggestions]);

  const pickSuggestion = useCallback((airport: AIPAirport) => {
    closeSuggestions();
    // Same path the ?icao= deep link uses: search() fires /api/search/log exactly as now.
    setQuery(airport.icao);
    void search(airport.icao);
  }, [closeSuggestions, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (suggestOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestHighlight((h) => (h + 1 >= suggestions.length ? 0 : h + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeSuggestions();
        return;
      }
      if (e.key === "Enter" && suggestHighlight >= 0 && suggestHighlight < suggestions.length) {
        e.preventDefault();
        pickSuggestion(suggestions[suggestHighlight]);
        return;
      }
    }
    if (e.key === "Enter") {
      closeSuggestions();
      search();
    }
  };

  return (
    <PortalShell
      title="Airport search"
      crumb="/aip"
      subtitle="Look up AIP, GEN, NOTAM and weather data for any aerodrome by ICAO code, name or country."
    >
      <div className="px-4 py-6 pb-12 sm:px-[30px]">
        <div className="mx-auto w-full max-w-[1560px]">
          {/* Browse controls (the page h1 moved into the shell header) */}
            <div className="mb-4 flex flex-wrap items-start justify-end gap-4">
              <div className="flex flex-none flex-wrap items-center gap-2">
                <PButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setBrowseMenuOpen((o) => !o);
                    if (!browseMenuOpen) {
                      setBrowseStep(1);
                      setBrowseSelection([]);
                      setBrowseSelectedState("");
                      setBrowseCountrySearch("");
                    }
                  }}
                  aria-expanded={browseMenuOpen}
                >
                  <GlobeIcon className="size-4 shrink-0 text-[#6c7079]" />
                  {selectedRegion && selectedCountry
                    ? selectedCountry === "United States of America" && (selectedState || browseSelectedState)
                      ? `${selectedRegion} → ${selectedCountry} → ${selectedState || browseSelectedState}`
                      : `${selectedRegion} → ${selectedCountry}`
                    : "Browse by region & country"}
                  {browseMenuOpen ? <ChevronUpIcon className="size-4 shrink-0" /> : <ChevronDownIcon className="size-4 shrink-0" />}
                </PButton>
                {selectedCountry && getCountryFlagUrl(selectedCountry) && (
                  <img
                    src={getCountryFlagUrl(selectedCountry)!}
                    alt=""
                    width={28}
                    height={21}
                    className="shrink-0 rounded-sm border border-[#e6e7ea] object-cover"
                  />
                )}
                {loadingCountry && <Spinner className="size-5 text-[#9aa0a8]" />}
              </div>
            </div>

            {/* Search card */}
            <PCard className="mb-6 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="search" className="sr-only">
                  Search
                </label>
                <div className="relative flex h-12 min-w-[240px] flex-1 items-center gap-2.5 rounded-[10px] border border-[#d6d8dc] bg-white px-3.5 transition-colors focus-within:border-[#2563eb]">
                  <SearchIcon className="size-[18px] shrink-0 text-[#9aa0a8]" aria-hidden />
                  <input
                    id="search"
                    placeholder="Airport code / name / country..."
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => {
                      // Suggestion rows use onMouseDown+preventDefault, so row clicks
                      // land before this closes the dropdown.
                      setSuggestOpen(false);
                      setSuggestHighlight(-1);
                    }}
                    role="combobox"
                    aria-expanded={suggestOpen}
                    aria-autocomplete="list"
                    aria-controls="search-suggestions"
                    autoComplete="off"
                    disabled={loading}
                    className="h-full min-w-0 flex-1 border-none bg-transparent font-mono text-[15px] tracking-[0.02em] text-[#17181c] outline-none placeholder:text-[#9aa0a8] disabled:opacity-60"
                  />
                  <PMono className="hidden text-[11px] text-[#c3c7cd] sm:inline">ICAO</PMono>
                  {suggestOpen && suggestions.length > 0 && (
                    <div
                      id="search-suggestions"
                      role="listbox"
                      aria-label="Airport suggestions"
                      className="absolute left-0 right-0 top-[calc(100%+6px)] z-[120] overflow-hidden rounded-[12px] border border-[#e6e7ea] bg-white py-1 shadow-[0_16px_44px_rgba(16,18,22,.16)]"
                    >
                      {suggestions.map((s, i) => {
                        const flagUrl = getCountryFlagUrl(s.country);
                        return (
                          <button
                            key={`${s.icao}-${s.country}`}
                            type="button"
                            role="option"
                            aria-selected={i === suggestHighlight}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickSuggestion(s)}
                            onMouseEnter={() => setSuggestHighlight(i)}
                            className={`flex w-full cursor-pointer items-center gap-2.5 border-none px-3 py-2 text-left text-sm transition-colors ${
                              i === suggestHighlight ? "bg-[#eef4ff]" : "bg-transparent hover:bg-[#f5f6f7]"
                            }`}
                          >
                            <span className="inline-flex w-[22px] flex-none items-center justify-center">
                              {flagUrl ? (
                                <img
                                  src={flagUrl}
                                  alt=""
                                  width={22}
                                  height={16}
                                  className="rounded-sm border border-[#e6e7ea] object-cover"
                                />
                              ) : (
                                <GlobeIcon className="size-4 text-[#9aa0a8]" />
                              )}
                            </span>
                            <PMono className="whitespace-nowrap text-[13.5px] font-semibold text-[#17181c]">
                              {s.icao}
                            </PMono>
                            <span className="min-w-0 flex-1 truncate text-[#3a3d44]">{s.name}</span>
                            <span className="flex-none text-xs text-[#9aa0a8]">{s.country}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <PButton
                  type="button"
                  variant="primary"
                  className="h-12 shrink-0 px-6 text-[15px]"
                  onClick={() => {
                    void search();
                  }}
                  disabled={loading}
                >
                  {loading ? <Spinner className="size-4" /> : "Find"}
                </PButton>
                <PButton
                  type="button"
                  variant="stop"
                  className="h-12 shrink-0 px-5 text-[15px]"
                  onClick={stopSearch}
                  disabled={!loading}
                >
                  <SquareIcon className="size-3 fill-current" />
                  Stop search
                </PButton>
              </div>

              {loading && (
                <p className="mt-4 flex items-center gap-2 text-sm text-[#6c7079]">
                  <Spinner className="size-4 shrink-0" />
                  Searching…
                </p>
              )}

              {!loading && hasSearched && (
                <div className="mt-4 space-y-3 border-t border-[#eef0f2] pt-4">
                  {error && (
                    <p className="text-sm text-[#e5484d]">{error}</p>
                  )}
                  {!error && results === null && (
                    <p className="text-sm text-[#6c7079]">Search failed. Try again.</p>
                  )}
                  {!error && results !== null && results.length === 0 && (
                    <p className="text-sm text-[#6c7079]">
                      No airports found. Try ICAO (e.g. OIAA), airport name, or country.
                    </p>
                  )}
                  {!error && results !== null && results.length === 1 && (
                    <p className="py-1 text-xs font-semibold uppercase tracking-wider text-[#9aa0a8]">
                      1 result — AIP data below
                    </p>
                  )}
                  {!error && results !== null && results.length > 1 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#9aa0a8]">
                        {results.length} airports — switch tab to view
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {results.map((airport, i) => {
                          const flagUrl = getCountryFlagUrl(airport.country);
                          return (
                            <div
                              key={`${airport.icao}-${airport.country}`}
                              className="flex items-center overflow-hidden rounded-[10px] border border-[#e6e7ea] bg-white transition-colors hover:bg-[#f5f6f7]"
                            >
                              <button
                                type="button"
                                onClick={() => router.push(`/aip/${airport.icao}`)}
                                className="flex min-w-0 cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 font-mono text-sm font-semibold text-[#17181c]"
                              >
                                <span className="inline-flex w-[22px] flex-none items-center justify-center">
                                  {flagUrl ? (
                                    <img
                                      src={flagUrl}
                                      alt=""
                                      width={22}
                                      height={16}
                                      className="rounded-sm border border-[#e6e7ea] object-cover"
                                    />
                                  ) : (
                                    <GlobeIcon className="size-4 text-[#9aa0a8]" />
                                  )}
                                </span>
                                <span className="whitespace-nowrap">{airport.icao}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = results.filter((_, j) => j !== i);
                                  setResults(next.length ? next : []);
                                }}
                                className="shrink-0 cursor-pointer rounded-sm border-none bg-transparent p-2 text-[#9aa0a8] hover:bg-[#f0f1f3] hover:text-[#e5484d]"
                                title="Close tab"
                              >
                                <XIcon className="size-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </PCard>

            {/* Browse wizard */}
            {browseMenuOpen && (
              <PCard className="mb-6 overflow-hidden">
                <div className="border-b border-[#eef0f2] px-5 pb-4 pt-[18px]">
                  <div className="mb-3 flex flex-wrap items-center gap-3.5">
                    {(regionHasUSA
                      ? ([[1, "Region"], [2, "Country"], [3, "State"], [4, "Aerodromes"]] as const)
                      : ([[1, "Region"], [2, "Country"], [3, "Aerodromes"]] as const)
                    ).map(([n, label]) => (
                      <div key={n} className="flex items-center gap-2">
                        <span
                          className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs font-bold ${
                            browseStep >= n ? "bg-[#2563eb] text-white" : "bg-[#eef0f2] text-[#9aa0a8]"
                          }`}
                        >
                          {n}
                        </span>
                        <span className={`text-[13.5px] ${browseStep === n ? "font-bold text-[#17181c]" : "font-medium text-[#9aa0a8]"}`}>
                          {label}
                        </span>
                      </div>
                    ))}
                    <div className="flex-1" />
                    <PMono className="text-[12.5px] text-[#9aa0a8]">
                      STEP {browseStep} / {regionHasUSA ? 4 : 3}
                    </PMono>
                  </div>
                  <div className="h-[5px] overflow-hidden rounded-full bg-[#eef0f2]">
                    <div
                      className="h-full rounded-full bg-[#2563eb] transition-all duration-300"
                      style={{ width: `${Math.min(100, (browseStep / (regionHasUSA ? 4 : 3)) * 100)}%` }}
                    />
                  </div>
                </div>

                {browseLoading ? (
                  <div className="space-y-3 px-5 py-6">
                    <div className="mb-2 flex items-center justify-center gap-3">
                      <PlaneIcon className="size-6 text-[#2563eb] animate-fly" strokeWidth={1.8} aria-hidden />
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#6c7079]">
                        {browseStep === 1 ? "Loading region…" : browseStep === 2 ? "Loading country…" : "Adding airports…"}
                      </p>
                    </div>
                    <div className="mx-auto max-w-sm space-y-2">
                      {BROWSE_LOADING_STEPS.map((step, i) => (
                        <div key={step.id} className="flex items-center gap-2 text-sm">
                          {i < browseLoadingStepIndex ? (
                            <span className="text-[#2563eb]">✓</span>
                          ) : i === browseLoadingStepIndex ? (
                            <Spinner className="size-3.5 text-[#2563eb]" />
                          ) : (
                            <span className="text-[#c3c7cd]">○</span>
                          )}
                          <span className={i <= browseLoadingStepIndex ? "text-[#17181c]" : "text-[#9aa0a8]"}>
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mx-auto h-[5px] max-w-sm overflow-hidden rounded-full bg-[#eef0f2]">
                      <div
                        className="h-full rounded-full bg-[#2563eb] transition-all duration-300"
                        style={{ width: `${((browseLoadingStepIndex + 1) / BROWSE_LOADING_STEPS.length) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : browseStep === 1 ? (
                  <div className="space-y-4 px-5 py-5">
                    <div className="space-y-2">
                      <label htmlFor="browse-country-search" className="text-sm font-semibold text-[#17181c]">
                        Find country
                      </label>
                      <div className="relative flex max-w-[420px] items-center">
                        <SearchIcon className="pointer-events-none absolute left-3 size-4 text-[#9aa0a8]" aria-hidden />
                        <input
                          id="browse-country-search"
                          type="search"
                          autoComplete="off"
                          placeholder="Type country or region…"
                          value={browseCountrySearch}
                          onChange={(e) => setBrowseCountrySearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && countrySearchMatches.length === 1) {
                              e.preventDefault();
                              const only = countrySearchMatches[0];
                              applyBrowseCountrySelection(only.country, only.region);
                            }
                          }}
                          className={`h-[42px] w-full rounded-[10px] border border-[#d6d8dc] bg-white pl-9 text-sm text-[#17181c] outline-none transition-colors focus:border-[#2563eb] ${browseCountrySearch.trim() ? "pr-9" : "pr-3"}`}
                          aria-describedby="browse-country-search-hint"
                        />
                        {browseCountrySearch.trim() ? (
                          <button
                            type="button"
                            aria-label="Clear country search"
                            className="absolute right-2 cursor-pointer rounded border-none bg-transparent p-1 text-[#9aa0a8] hover:text-[#17181c]"
                            onClick={() => setBrowseCountrySearch("")}
                          >
                            <XIcon className="size-4" />
                          </button>
                        ) : null}
                      </div>
                      <p id="browse-country-search-hint" className="text-xs text-[#9aa0a8]">
                        {browseCountrySearch.trim()
                          ? "Pick a country below, or browse by region."
                          : "Or choose a region below to list countries."}
                      </p>
                    </div>
                    {browseCountrySearch.trim() ? (
                      <div className="space-y-2">
                        <PSectionTitle>Matches</PSectionTitle>
                        {countrySearchMatches.length === 0 ? (
                          <p className="py-2 text-sm text-[#6c7079]">No countries match.</p>
                        ) : (
                          <div
                            role="listbox"
                            aria-label="Country search results"
                            className="max-h-[min(220px,40vh)] space-y-1 overflow-y-auto rounded-[10px] border border-[#e6e7ea] bg-white p-1.5"
                          >
                            {countrySearchMatches.map(({ country, region }) => (
                              <button
                                key={`${region}::${country}`}
                                type="button"
                                role="option"
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-2 py-2 text-left text-sm transition-colors hover:bg-[#f5f6f7] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                                onClick={() => applyBrowseCountrySelection(country, region)}
                              >
                                <span className="inline-flex w-[22px] flex-none items-center justify-center">
                                  {getCountryFlagUrl(country) ? (
                                    <img
                                      src={getCountryFlagUrl(country)!}
                                      alt=""
                                      width={22}
                                      height={16}
                                      className="rounded-sm object-cover"
                                    />
                                  ) : null}
                                </span>
                                <span className="min-w-0 flex-1 truncate font-semibold">{country}</span>
                                <span className="shrink-0 text-xs text-[#9aa0a8]">{region}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    <div className={browseCountrySearch.trim() ? "space-y-3 border-t border-[#eef0f2] pt-4" : "space-y-3"}>
                      <p className="text-sm font-semibold text-[#17181c]">Select region</p>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                        {regions.map((r) => (
                          <button
                            key={r.region}
                            type="button"
                            className={`flex cursor-pointer items-center gap-3.5 rounded-xl border px-[18px] py-4 text-left transition-colors hover:border-[#2563eb] hover:bg-[#f8fbff] ${
                              selectedRegion === r.region ? "border-[#2563eb] bg-[#f8fbff]" : "border-[#e6e7ea] bg-white"
                            }`}
                            onClick={() => {
                              setBrowseCountrySearch("");
                              setSelectedRegion(r.region);
                              setSelectedCountry("");
                              setSelectedState("");
                              setBrowseStep(2);
                            }}
                          >
                            <GlobeIcon className="size-5 shrink-0 text-[#2563eb]" />
                            <span className="flex-1 text-[15px] font-bold">{r.region}</span>
                            <ChevronRightIcon className="size-4 shrink-0 text-[#c3c7cd]" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {!browseLoading && browseStep === 2 && (
                  <div className="space-y-4 px-5 py-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#17181c]">Select country</p>
                      <PButton
                        type="button"
                        variant="quiet"
                        size="sm"
                        onClick={() => {
                          setBrowseCountrySearch("");
                          setBrowseStep(1);
                        }}
                      >
                        ← Back
                      </PButton>
                    </div>
                    <p className="text-xs text-[#9aa0a8]">{selectedRegion}</p>
                    <div className="grid max-h-[260px] grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2 overflow-y-auto pr-1">
                      {countriesInRegion.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-[11px] text-left transition-colors hover:border-[#2563eb] hover:bg-[#f8fbff] ${
                            selectedCountry === c ? "border-[#2563eb] bg-[#f8fbff]" : "border-[#e6e7ea] bg-white"
                          }`}
                          onClick={() => {
                            setBrowseSelectedCountry(c);
                            setBrowseStep(3);
                          }}
                        >
                          <span className="inline-flex w-[22px] flex-none items-center justify-center">
                            {getCountryFlagUrl(c) && (
                              <img
                                src={getCountryFlagUrl(c)!}
                                alt=""
                                width={20}
                                height={15}
                                className="rounded-sm object-cover"
                              />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{c}</span>
                          <ChevronRightIcon className="size-4 shrink-0 text-[#c3c7cd]" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!browseLoading && browseStep === 3 && isUSABrowse && (
                  <div className="space-y-4 px-5 py-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#17181c]">Select state or territory</p>
                      <PButton type="button" variant="quiet" size="sm" onClick={() => setBrowseStep(2)}>
                        ← Back
                      </PButton>
                    </div>
                    <p className="text-xs text-[#9aa0a8]">{selectedRegion} → {browseSelectedCountry}</p>
                    <div className="grid max-h-[260px] grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2 overflow-y-auto pr-1">
                      {usaStates.map((stateName) => (
                        <button
                          key={stateName}
                          type="button"
                          className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3.5 py-[11px] text-left transition-colors hover:border-[#2563eb] hover:bg-[#f8fbff] ${
                            browseSelectedState === stateName ? "border-[#2563eb] bg-[#f8fbff]" : "border-[#e6e7ea] bg-white"
                          }`}
                          onClick={() => {
                            setBrowseSelectedState(stateName);
                            setBrowseStep(4);
                          }}
                        >
                          {USA_STATE_ABBR[stateName] ? (
                            <PMono className="shrink-0 text-xs text-[#9aa0a8]">({USA_STATE_ABBR[stateName]})</PMono>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{stateName}</span>
                          <ChevronRightIcon className="size-4 shrink-0 text-[#c3c7cd]" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!browseLoading && (browseStep === 3 && !isUSABrowse || browseStep === 4) && (
                  <div>
                    <div className="flex flex-wrap items-center gap-3 border-b border-[#eef0f2] px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#17181c]">Select airport(s)</p>
                        <p className="mt-0.5 text-xs text-[#9aa0a8]">
                          {browseStep === 4
                            ? `${selectedRegion} → ${browseSelectedCountry} → ${browseSelectedState} · Click to toggle, then Done`
                            : `${selectedRegion} → ${browseSelectedCountry} · Click to toggle, then Done`}
                        </p>
                      </div>
                      <div className="flex-1" />
                      {isAdmin && (
                        <PButton
                          type="button"
                          variant="quiet"
                          size="sm"
                          onClick={() => router.push("/admin/airports/deleted")}
                        >
                          Restore deleted airports
                        </PButton>
                      )}
                    </div>
                    <div className="max-h-[320px] overflow-y-auto px-5 py-2">
                      {loadingCountry ? (
                        <div className="flex items-center justify-center py-8">
                          <Spinner className="size-6 text-[#2563eb]" />
                        </div>
                      ) : browseCountryAirports.length > 0 ? (
                        browseCountryAirports.map((airport) => {
                          const isSelected = browseSelection.some((a) => a.icao === airport.icao);
                          const isDeleting = Boolean(browseDeletingIcaos[airport.icao]);
                          return (
                            <div
                              key={airport.icao}
                              onClick={() => {
                                setBrowseSelection((prev) =>
                                  isSelected
                                    ? prev.filter((a) => a.icao !== airport.icao)
                                    : [...prev, airport]
                                );
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setBrowseSelection((prev) =>
                                    isSelected
                                      ? prev.filter((a) => a.icao !== airport.icao)
                                      : [...prev, airport]
                                  );
                                }
                              }}
                              className="flex w-full cursor-pointer items-center gap-3.5 border-b border-[#f2f3f5] px-1 py-3 text-left last:border-b-0 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                            >
                              <span
                                className={`flex h-5 w-5 flex-none items-center justify-center rounded-[6px] border text-xs font-medium transition-colors ${
                                  isSelected
                                    ? "border-[#2563eb] bg-[#2563eb] text-white"
                                    : "border-[#d6d8dc] bg-white"
                                }`}
                              >
                                {isSelected ? "✓" : ""}
                              </span>
                              <span className="inline-flex w-[24px] flex-none items-center justify-center">
                                {getCountryFlagUrl(airport.country) && (
                                  <img
                                    src={getCountryFlagUrl(airport.country)!}
                                    alt=""
                                    width={24}
                                    height={18}
                                    className="rounded object-cover"
                                  />
                                )}
                              </span>
                              <PMono className="w-16 flex-none whitespace-nowrap text-[14.5px] font-semibold text-[#17181c]">
                                {airport.icao}
                              </PMono>
                              <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#3a3d44]">
                                {airport.name}
                              </span>
                              <button
                                type="button"
                                aria-label={`Hide ${airport.icao}`}
                                className="flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-[#9aa0a8] hover:bg-[#fdecec] hover:text-[#e5484d] disabled:opacity-50"
                                disabled={isDeleting}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void deleteAirportFromPortal(airport);
                                }}
                              >
                                <Trash2Icon className="size-4" />
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <p className="py-4 text-center text-sm text-[#6c7079]">
                          No airports found for this country.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3.5 border-t border-[#eef0f2] bg-[#fbfbfc] px-5 py-4">
                      <span className="text-sm text-[#6c7079]">
                        <strong className="font-bold text-[#17181c]">{browseSelection.length} selected</strong>
                      </span>
                      <div className="flex-1" />
                      <PButton
                        type="button"
                        variant="secondary"
                        onClick={() => browseStep === 4 ? setBrowseStep(3) : setBrowseStep(2)}
                      >
                        Back
                      </PButton>
                      {browseCountryAirports.length > 0 && (
                        <PButton
                          type="button"
                          variant="primary"
                          onClick={() => {
                            if (browseSelection.length > 0) {
                              // Log each selected airport immediately before animation starts
                              for (const airport of browseSelection) {
                                fetch("/api/search/log", {
                                  method: "POST",
                                  credentials: "include",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ query: airport.icao, resultCount: 1, source: "browse" }),
                                }).catch(() => {});
                              }
                              runBrowseLoading(() => {
                                const merged = [...(results ?? []), ...browseSelection];
                                const byIcao = merged.filter((a, i, arr) => arr.findIndex((x) => x.icao === a.icao) === i);
                                setResults(byIcao);
                                const withCoords = byIcao.find((a) => a.lat != null && a.lon != null);
                                const nextIcao = withCoords?.icao ?? browseSelection[0].icao;
                                setSelectedCountry(browseSelectedCountry);
                                setSelectedState(browseSelectedCountry === "United States of America" ? browseSelectedState : "");
                                setBrowseMenuOpen(false);
                                setHasSearched(true);
                                router.push(`/aip/${nextIcao}`);
                              });
                            }
                          }}
                          disabled={browseSelection.length === 0}
                        >
                          Done · open {browseSelection.length}
                        </PButton>
                      )}
                    </div>
                  </div>
                )}
              </PCard>
            )}

            {/* Recently opened */}
            {!results?.length && recents.length > 0 && (
              <div>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[17px] font-bold">Recently opened</h2>
                  <span className="text-[13px] text-[#9aa0a8]">Stored on this device</span>
                </div>
                <PCard className="overflow-x-auto">
                  <div className="min-w-[680px]">
                    <div className="grid grid-cols-[110px_1.6fr_1fr_150px_90px] items-center border-b border-[#eef0f2] bg-[#fbfbfc] px-[18px] py-[11px]">
                      <PTh>ICAO</PTh>
                      <PTh>AERODROME</PTh>
                      <PTh>COUNTRY</PTh>
                      <PTh>OPENED</PTh>
                      <PTh className="text-right" />
                    </div>
                    {recents.map((r) => (
                      <div
                        key={r.icao}
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(`/aip/${r.icao}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(`/aip/${r.icao}`);
                          }
                        }}
                        className="grid cursor-pointer grid-cols-[110px_1.6fr_1fr_150px_90px] items-center border-b border-[#f2f3f5] px-[18px] py-[13px] last:border-b-0 hover:bg-[#f8fafc] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex w-[22px] flex-none items-center justify-center">
                            {getCountryFlagUrl(r.country) ? (
                              <img
                                src={getCountryFlagUrl(r.country)!}
                                alt=""
                                width={22}
                                height={16}
                                className="rounded-sm border border-[#e6e7ea] object-cover"
                              />
                            ) : (
                              <GlobeIcon className="size-4 text-[#9aa0a8]" />
                            )}
                          </span>
                          <PMono className="whitespace-nowrap text-[14.5px] font-semibold">{r.icao}</PMono>
                        </div>
                        <div className="truncate pr-3 text-sm text-[#17181c]">{r.name}</div>
                        <div className="truncate pr-3 text-sm text-[#6c7079]">{r.country}</div>
                        <PMono className="text-[12.5px] text-[#9aa0a8]">{formatRecentTimestamp(r.ts)}</PMono>
                        <div className="flex justify-end">
                          <PButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="text-[#1d4ed8]"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/aip/${r.icao}`);
                            }}
                          >
                            Open
                          </PButton>
                        </div>
                      </div>
                    ))}
                  </div>
                </PCard>
              </div>
            )}
        </div>

        <BugReportsHoverBanner
          reports={bugReports}
          onDeleteFixed={deleteFixedBugReport}
          deletingReportId={deletingBugReportId}
        />
      </div>
    </PortalShell>
  );
}

export default function AIPSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[#f5f6f7]">
          <div className="text-sm text-[#6c7079]">Loading…</div>
        </div>
      }
    >
      <AIPSearchPageInner />
    </Suspense>
  );
}
