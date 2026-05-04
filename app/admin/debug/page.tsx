"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RunSummary = {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totals: { airports: number; failed: number; timeout: number };
  /** True when the run lives only in Supabase (server restarted) */
  persisted?: boolean;
};

type RunDetail = RunSummary & {
  options?: {
    steps?: string[];
  };
  airports: Array<{
    icao: string;
    country: string;
    name: string;
    steps: Record<string, string>;
    stepDetails: Record<string, string>;
    logs: string[];
  }>;
};

type PersistedFailure = {
  icao: string;
  country: string;
  name: string;
  step: string;
  state: string;
  detail: string | null;
};

function stepStatusClass(state: string) {
  if (state === "passed") return "text-emerald-700 dark:text-emerald-400";
  if (state === "pending" || state === "running") return "text-amber-700 dark:text-amber-400";
  if (state === "failed" || state === "timeout") return "text-red-700 dark:text-red-400";
  if (state === "skipped") return "text-muted-foreground";
  return "text-foreground";
}

const FINAL_STEP_STATES = new Set(["passed", "failed", "timeout", "skipped"]);
const DEFAULT_DEBUG_STEPS = ["aip", "notam", "weather", "pdf", "gen"];

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function AdminDebugPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [quantity, setQuantity] = useState("20");
  const [allAirports, setAllAirports] = useState(false);
  const [concurrency, setConcurrency] = useState("3");
  const [randomSample, setRandomSample] = useState(true);
  const [eadOnlyMode, setEadOnlyMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redebugLoading, setRedebugLoading] = useState(false);
  const [countryFilter, setCountryFilter] = useState("");
  const [selectedSteps, setSelectedSteps] = useState<Record<string, boolean>>({
    aip: true,
    notam: true,
    weather: true,
    pdf: true,
    gen: true,
  });
  const selectedStepCount = Object.values(selectedSteps).filter(Boolean).length;

  const refreshRuns = async () => {
    const res = await fetch("/api/admin/debug/runs", { cache: "no-store" });
    const data = await res.json();
    setRuns(Array.isArray(data.runs) ? data.runs : []);
  };

  const refreshRunDetail = async (runId: string) => {
    if (!runId) return;
    const res = await fetch(`/api/admin/debug/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setSelectedRun(data as RunDetail);
  };

  useEffect(() => {
    fetch("/api/admin/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setIsAdmin(Boolean(data?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    refreshRuns().catch(() => {});
    const timer = setInterval(() => refreshRuns().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedRunId) return;
    refreshRunDetail(selectedRunId).catch(() => {});
    const timer = setInterval(() => refreshRunDetail(selectedRunId).catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, [selectedRunId]);

  const grouped = useMemo(() => {
    const run = selectedRun;
    if (!run) return [] as Array<{ country: string; airports: RunDetail["airports"] }>;
    const map = new Map<string, RunDetail["airports"]>();
    for (const airport of run.airports) {
      const list = map.get(airport.country) ?? [];
      list.push(airport);
      map.set(airport.country, list);
    }
    return Array.from(map.entries()).map(([country, airports]) => ({ country, airports }));
  }, [selectedRun]);
  const progress = useMemo(() => {
    const run = selectedRun;
    const steps = run?.options?.steps?.length ? run.options.steps : DEFAULT_DEBUG_STEPS;
    const total = (run?.airports.length || 0) * steps.length;
    if (!run || total === 0) {
      return {
        completed: 0,
        total: 0,
        percent: 0,
        elapsedLabel: "0s",
        remainingLabel: "Estimating...",
        etaLabel: "",
      };
    }
    let completed = 0;
    for (const airport of run.airports) {
      for (const step of steps) {
        if (FINAL_STEP_STATES.has(airport.steps[step])) completed += 1;
      }
    }
    const startMs = new Date(run.startedAt).getTime();
    const endMs = run.endedAt ? new Date(run.endedAt).getTime() : Date.now();
    const elapsedMs = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : 0;
    const remainingChecks = Math.max(0, total - completed);
    const averageMsPerCheck = completed > 0 ? elapsedMs / completed : 0;
    const remainingMs = averageMsPerCheck > 0 ? remainingChecks * averageMsPerCheck : null;
    const etaDate = remainingMs != null && !run.endedAt ? new Date(Date.now() + remainingMs) : null;
    return {
      completed,
      total,
      percent: Math.round((completed / total) * 100),
      elapsedLabel: formatDuration(elapsedMs),
      remainingLabel:
        remainingChecks === 0
          ? "Done"
          : remainingMs == null
            ? "Estimating after first completed check..."
            : `About ${formatDuration(remainingMs)} left`,
      etaLabel: etaDate
        ? `ETA ${etaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "",
    };
  }, [selectedRun]);

  if (isAdmin === false) {
    return <div className="p-6 text-sm text-muted-foreground">Admin access required.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Debug Runner</CardTitle>
          <CardDescription>Start/stop admin debug runs and inspect airport step cards.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Quantity
            <Input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-28"
              disabled={allAirports}
              aria-describedby="debug-quantity-help"
            />
            <span id="debug-quantity-help" className="sr-only">
              Quantity is ignored when test all airports is enabled.
            </span>
          </label>
          <label className="text-sm">
            Concurrency
            <Input value={concurrency} onChange={(e) => setConcurrency(e.target.value)} className="w-28" />
          </label>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={allAirports}
              onChange={(e) => setAllAirports(e.target.checked)}
            />
            Test all airports
          </label>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={randomSample}
              onChange={(e) => setRandomSample(e.target.checked)}
              disabled={allAirports}
            />
            Random sample
          </label>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={eadOnlyMode}
              onChange={(e) => setEadOnlyMode(e.target.checked)}
            />
            EAD-only mode
          </label>
          <label className="text-sm">
            Countries (comma separated)
            <Input
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="w-[320px]"
              placeholder="Germany, France"
            />
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            {["aip", "notam", "weather", "pdf", "gen"].map((step) => (
              <label key={step} className="inline-flex items-center gap-1 rounded border px-2 py-1">
                <input
                  type="checkbox"
                  checked={Boolean(selectedSteps[step])}
                  onChange={(e) => setSelectedSteps((prev) => ({ ...prev, [step]: e.target.checked }))}
                />
                {step.toUpperCase()}
              </label>
            ))}
          </div>
          <Button
            disabled={loading || selectedStepCount === 0}
            onClick={async () => {
              setLoading(true);
              try {
                const steps = Object.entries(selectedSteps)
                  .filter(([, enabled]) => enabled)
                  .map(([step]) => step);
                const countries = countryFilter
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean);
                const res = await fetch("/api/admin/debug/runs", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    quantity: Number(quantity),
                    allAirports,
                    concurrency: Number(concurrency),
                    randomSample,
                    countries,
                    // EAD countries should be included and routed via EAD (not excluded by legacy captcha toggle).
                    excludeCaptchaCountries: false,
                    steps,
                    sourceMode: eadOnlyMode ? "ead-only" : "auto",
                  }),
                });
                const data = await res.json();
                if (data.runId) setSelectedRunId(data.runId);
                await refreshRuns();
              } finally {
                setLoading(false);
              }
            }}
          >
            Start run
          </Button>
          {selectedRunId ? (
            <Button
              variant="outline"
              onClick={async () => {
                await fetch(`/api/admin/debug/runs/${encodeURIComponent(selectedRunId)}`, { method: "POST" });
                await refreshRuns();
                await refreshRunDetail(selectedRunId);
              }}
            >
              Stop selected run
            </Button>
          ) : null}
          {selectedRun && (selectedRun.totals.failed + selectedRun.totals.timeout) > 0 ? (
            <Button
              variant="destructive"
              disabled={redebugLoading || loading}
              onClick={async () => {
                setRedebugLoading(true);
                try {
                  const failedIcaos = selectedRun.airports
                    .filter((a) => Object.values(a.steps).some((s) => s === "failed" || s === "timeout"))
                    .map((a) => a.icao);
                  const steps = Object.entries(selectedSteps)
                    .filter(([, enabled]) => enabled)
                    .map(([step]) => step);
                  const res = await fetch("/api/admin/debug/runs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      icaos: failedIcaos,
                      concurrency: Number(concurrency),
                      steps,
                      sourceMode: eadOnlyMode ? "ead-only" : "auto",
                    }),
                  });
                  const data = await res.json();
                  if (data.runId) setSelectedRunId(data.runId);
                  await refreshRuns();
                } finally {
                  setRedebugLoading(false);
                }
              }}
            >
              {redebugLoading ? "Starting…" : `Redebug ${selectedRun.totals.failed + selectedRun.totals.timeout} failed airport(s)`}
            </Button>
          ) : null}
          {selectedRunId && (!selectedRun || runs.find((r) => r.id === selectedRunId)?.persisted) ? (
            <Button
              variant="outline"
              disabled={redebugLoading || loading}
              onClick={async () => {
                setRedebugLoading(true);
                try {
                  const res = await fetch(`/api/admin/debug/runs/${encodeURIComponent(selectedRunId)}?failures=1`, { cache: "no-store" });
                  if (!res.ok) return;
                  const data = await res.json() as { failures?: PersistedFailure[] };
                  const failures = data.failures ?? [];
                  const uniqueIcaos = [...new Set(failures.map((f) => f.icao))];
                  if (!uniqueIcaos.length) return;
                  const steps = Object.entries(selectedSteps)
                    .filter(([, enabled]) => enabled)
                    .map(([step]) => step);
                  const runRes = await fetch("/api/admin/debug/runs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      icaos: uniqueIcaos,
                      concurrency: Number(concurrency),
                      steps,
                      sourceMode: eadOnlyMode ? "ead-only" : "auto",
                    }),
                  });
                  const runData = await runRes.json();
                  if (runData.runId) setSelectedRunId(runData.runId);
                  await refreshRuns();
                } finally {
                  setRedebugLoading(false);
                }
              }}
            >
              {redebugLoading ? "Loading…" : "Redebug from saved failures"}
            </Button>
          ) : null}
          {selectedRunId ? (
            <Link className="text-sm underline" href={`/admin/debug/raw?run=${encodeURIComponent(selectedRunId)}`}>
              Open raw stream
            </Link>
          ) : null}
          {selectedRunId ? (
            <Link
              className="text-sm underline"
              href={`/api/admin/debug/runs/${encodeURIComponent(selectedRunId)}${selectedRun ? "?download=1" : "?failures=1&download=1"}`}
            >
              Download raw JSON
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.map((run) => (
            <button
              key={run.id}
              type="button"
              className={`w-full rounded border p-2 text-left text-sm ${selectedRunId === run.id ? "border-primary" : "border-border"}`}
              onClick={() => setSelectedRunId(run.id)}
            >
              <div className="font-mono text-xs">{run.id}</div>
              <div className="text-muted-foreground text-xs">
                {run.persisted ? (
                  <span className="text-amber-600 dark:text-amber-400">⚠ Persisted (server restarted) — click Redebug to replay failures</span>
                ) : (
                  <>Status: {run.status} | Airports: {run.totals.airports} | Failed: {run.totals.failed} | Timeout: {run.totals.timeout}</>
                )}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {selectedRun ? (
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
            <CardDescription>
              {progress.completed} of {progress.total} selected checks finished across {selectedRun.airports.length} airport(s).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={progress.percent} aria-label="Debug run progress" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.percent}% complete</span>
              <span className="tabular-nums">
                Failed: {selectedRun.totals.failed} | Timeout: {selectedRun.totals.timeout}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>Elapsed: {progress.elapsedLabel}</span>
              <span className="tabular-nums">
                {progress.remainingLabel}{progress.etaLabel ? ` | ${progress.etaLabel}` : ""}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {grouped.map((group) => (
        <Card key={group.country}>
          <CardHeader>
            <CardTitle>{group.country}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {group.airports.map((airport) => (
              <div key={airport.icao} className="rounded border p-2 text-xs">
                <div className="font-mono text-sm">{airport.icao} — {airport.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={stepStatusClass(airport.steps.aip)}>AIP: {airport.steps.aip}</span>
                  <span className={stepStatusClass(airport.steps.notam)}>NOTAM: {airport.steps.notam}</span>
                  <span className={stepStatusClass(airport.steps.weather)}>WX: {airport.steps.weather}</span>
                  <span className={stepStatusClass(airport.steps.pdf)}>PDF: {airport.steps.pdf}</span>
                  <span className={stepStatusClass(airport.steps.gen)}>GEN: {airport.steps.gen}</span>
                </div>
                {(["aip", "notam", "weather", "pdf", "gen"] as const).map((step) => {
                  const state = airport.steps[step];
                  if (state !== "failed" && state !== "timeout") return null;
                  return (
                    <div key={`${airport.icao}-${step}`} className={`mt-1 rounded border border-red-300 bg-red-50 px-2 py-1 dark:border-red-900/70 dark:bg-red-950/40 ${stepStatusClass(state)}`}>
                      {step.toUpperCase()} {state}: {airport.stepDetails?.[step] || "No detail"}
                    </div>
                  );
                })}
                {airport.logs.slice(-4).map((line) => <div key={line} className="mt-1 text-muted-foreground">{line}</div>)}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
