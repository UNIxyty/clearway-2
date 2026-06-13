"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PickemCompetition, PickemGroup, PickemMatch, PickemTeam } from "@/lib/pickem-shared";

type AdminPayload = {
  competition: PickemCompetition;
  teams: PickemTeam[];
  matches: PickemMatch[];
  isDeveloper: boolean;
  viewer?: {
    id: string;
    email: string | null;
    name: string | null;
  };
};

type EditState = Record<string, { home: string; away: string; live: boolean }>;
type Tab = "matches" | "groups" | "locks" | "devmode";

type DevModePreviewRow = {
  matchId: string;
  groupCode: string | null;
  homeName: string;
  awayName: string;
  actualHome: number;
  actualAway: number;
  predictedHome: number | null;
  predictedAway: number | null;
  hasPrediction: boolean;
  outcomeCorrect: boolean;
  scoreCorrect: boolean;
  points: number;
};

type DevModePayload = {
  active: boolean;
  overrideCount: number;
  matchesWithPrediction?: number;
  totalPoints?: number;
  preview?: DevModePreviewRow[];
};
type GroupResultRow = { groupCode: string; teamId: string; finalPosition: number };
type GroupsPayload = {
  competition: PickemCompetition;
  groups: PickemGroup[];
  teams: PickemTeam[];
  groupResults: GroupResultRow[];
};
type LockParticipant = {
  userId: string;
  displayName: string;
  rank: number;
  points: number;
};
type LockOverrideRow = {
  userId: string;
  unlockUntil: string;
  reason: string | null;
  updatedAt: string;
};
type LocksPayload = {
  competition: PickemCompetition;
  participants: LockParticipant[];
  overrides: LockOverrideRow[];
};

const ADMIN_API_URL = "/api/pickem/admin/matches";
const GROUP_API_URL = "/api/pickem/admin/groups";
const LOCK_API_URL = "/api/pickem/admin/locks";

function fmtKickoff(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Riga",
    timeZoneName: "short",
  });
}

function toDateTimeLocalValue(value: string): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "";
  const dt = new Date(ts);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function PickemAdminClient() {
  const [tab, setTab] = useState<Tab>("matches");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modalMatchId, setModalMatchId] = useState<string | null>(null);
  const [payload, setPayload] = useState<AdminPayload | null>(null);
  const [groupsPayload, setGroupsPayload] = useState<GroupsPayload | null>(null);
  const [locksPayload, setLocksPayload] = useState<LocksPayload | null>(null);
  const [groupOrders, setGroupOrders] = useState<Record<string, string[]>>({});
  const [edits, setEdits] = useState<EditState>({});
  const [devModePayload, setDevModePayload] = useState<DevModePayload | null>(null);
  const [devModeLoading, setDevModeLoading] = useState(false);
  const [selectedLockUserId, setSelectedLockUserId] = useState("");
  const [manualLockUserId, setManualLockUserId] = useState("");
  const [lockUntilLocal, setLockUntilLocal] = useState("");
  const [lockReason, setLockReason] = useState("");
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchAdminApi(
    init?: RequestInit,
  ): Promise<{ res: Response; json: any }> {
    const res = await fetch(ADMIN_API_URL, init);
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { res, json };
    throw new Error(json.error || `Failed to load admin data (${res.status}).`);
  }

  async function fetchGroupApi(
    init?: RequestInit,
  ): Promise<{ res: Response; json: any }> {
    const res = await fetch(GROUP_API_URL, init);
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { res, json };
    throw new Error(json.error || `Failed to load group standings (${res.status}).`);
  }

  async function fetchLockApi(
    init?: RequestInit,
  ): Promise<{ res: Response; json: any }> {
    const res = await fetch(LOCK_API_URL, init);
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { res, json };
    throw new Error(json.error || `Failed to load lock overrides (${res.status}).`);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { json } = await fetchAdminApi({ cache: "no-store" });
      setPayload(json as AdminPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (tab !== "groups" || groupsPayload) return;
    void (async () => {
      setError(null);
      try {
        const { json } = await fetchGroupApi({ cache: "no-store" });
        const nextPayload = json as GroupsPayload;
        setGroupsPayload(nextPayload);
        setGroupOrders(() => {
          const grouped = new Map<string, PickemTeam[]>();
          for (const team of nextPayload.teams || []) {
            const arr = grouped.get(team.groupCode) || [];
            arr.push(team);
            grouped.set(team.groupCode, arr);
          }
          for (const arr of grouped.values()) {
            arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
          }

          const resultByGroup = new Map<string, GroupResultRow[]>();
          for (const row of nextPayload.groupResults || []) {
            const arr = resultByGroup.get(row.groupCode) || [];
            arr.push(row);
            resultByGroup.set(row.groupCode, arr);
          }
          const orders: Record<string, string[]> = {};
          for (const group of nextPayload.groups || []) {
            const resultRows = (resultByGroup.get(group.code) || []).sort(
              (a, b) => a.finalPosition - b.finalPosition,
            );
            const orderedFromResult = resultRows.map((row) => row.teamId);
            const fallback = (grouped.get(group.code) || []).map((team) => team.id);
            orders[group.code] = orderedFromResult.length === 4 ? orderedFromResult : fallback;
          }
          return orders;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load group standings.");
      }
    })();
  }, [tab, groupsPayload]);

  useEffect(() => {
    if (tab !== "devmode" || !payload?.isDeveloper) return;
    void (async () => {
      setDevModeLoading(true);
      try {
        const res = await fetch("/api/admin/dev-mode", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (res.ok) setDevModePayload(json as DevModePayload);
      } finally {
        setDevModeLoading(false);
      }
    })();
  }, [tab, payload?.isDeveloper]);

  useEffect(() => {
    if (tab !== "locks" || locksPayload) return;
    void (async () => {
      setError(null);
      try {
        const { json } = await fetchLockApi({ cache: "no-store" });
        setLocksPayload(json as LocksPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lock overrides.");
      }
    })();
  }, [tab, locksPayload]);

  useEffect(() => {
    if (!selectedLockUserId || !locksPayload) return;
    const existing = locksPayload.overrides.find((row) => row.userId === selectedLockUserId);
    if (!existing) return;
    setLockUntilLocal(toDateTimeLocalValue(existing.unlockUntil));
    setLockReason(existing.reason || "");
  }, [selectedLockUserId, locksPayload]);

  const matches = useMemo(
    () =>
      [...(payload?.matches || [])].sort(
        (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime(),
      ),
    [payload],
  );

  const teamById = useMemo(() => {
    const map = new Map<string, PickemTeam>();
    for (const team of payload?.teams || []) map.set(team.id, team);
    return map;
  }, [payload]);

  const scoredMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          Number.isInteger(m.homeScore) &&
          Number.isInteger(m.awayScore) &&
          String(m.status || "").toLowerCase() === "finished",
      ),
    [matches],
  );

  const pendingMatches = matches.length - scoredMatches.length;
  const playersInPool = useMemo(() => {
    // No dedicated preview endpoint yet, so keep this as an informative placeholder metric.
    // Once preview endpoints land we can replace with live participant counts.
    return payload ? payload.teams.length * 10 : 0;
  }, [payload]);

  function flash(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }

  function getEditForMatch(match: PickemMatch): { home: string; away: string; live: boolean } {
    return (
      edits[match.id] || {
        home: match.homeScore === null ? "" : String(match.homeScore),
        away: match.awayScore === null ? "" : String(match.awayScore),
        live: String(match.status || "").toLowerCase() === "live",
      }
    );
  }

  async function activateDevMode() {
    setSaving("devmode:activate");
    setError(null);
    try {
      const res = await fetch("/api/admin/dev-mode", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to activate dev mode.");
      // Reload dev mode status
      const statusRes = await fetch("/api/admin/dev-mode", { cache: "no-store" });
      const statusJson = await statusRes.json().catch(() => ({}));
      if (statusRes.ok) setDevModePayload(statusJson as DevModePayload);
      flash(`Dev mode activated — ${json.matchCount} matches simulated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate dev mode.");
    } finally {
      setSaving(null);
    }
  }

  async function deactivateDevMode() {
    setSaving("devmode:deactivate");
    setError(null);
    try {
      const res = await fetch("/api/admin/dev-mode", { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to clear dev mode.");
      }
      setDevModePayload({ active: false, overrideCount: 0, preview: [] });
      flash("Dev mode cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear dev mode.");
    } finally {
      setSaving(null);
    }
  }

  async function saveMatch(match: PickemMatch, status: "live" | "finished") {
    const edit = getEditForMatch(match);
    const homeScore = edit.home === "" ? null : Number(edit.home);
    const awayScore = edit.away === "" ? null : Number(edit.away);
    setSaving(match.id);
    setError(null);
    try {
      const { json } = await fetchAdminApi({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          homeScore,
          awayScore,
          status,
        }),
      });
      setPayload((prev) => (prev ? { ...prev, matches: (json.matches || prev.matches) as PickemMatch[] } : prev));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      const homeLabel = homeScore === null ? "-" : homeScore;
      const awayLabel = awayScore === null ? "-" : awayScore;
      if (status === "finished") {
        flash(`Published ${homeLabel}-${awayLabel} and recomputed leaderboard points.`);
      } else {
        flash(`Updated live score to ${homeLabel}-${awayLabel}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save match update.");
    } finally {
      setSaving(null);
      if (status === "finished") setModalMatchId(null);
    }
  }

  async function publishGroup(groupCode: string) {
    if (!groupsPayload) return;
    const orderTeamIds = groupOrders[groupCode] || [];
    if (orderTeamIds.length !== 4) {
      setError(`Group ${groupCode} must contain 4 teams.`);
      return;
    }
    setSaving(`group:${groupCode}`);
    setError(null);
    try {
      const { json } = await fetchGroupApi({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupCode, orderTeamIds }),
      });
      setGroupsPayload((prev) =>
        prev ? { ...prev, groupResults: (json.groupResults || prev.groupResults) as GroupResultRow[] } : prev,
      );
      flash(`Published Group ${groupCode} and recomputed leaderboard points.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to publish Group ${groupCode}.`);
    } finally {
      setSaving(null);
    }
  }

  async function unpublishGroup(groupCode: string) {
    setSaving(`group:${groupCode}:clear`);
    setError(null);
    try {
      const { json } = await fetchGroupApi({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupCode, clear: true }),
      });
      setGroupsPayload((prev) =>
        prev ? { ...prev, groupResults: (json.groupResults || prev.groupResults) as GroupResultRow[] } : prev,
      );
      flash(`Cleared Group ${groupCode} standings and recomputed points.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to clear Group ${groupCode}.`);
    } finally {
      setSaving(null);
    }
  }

  function moveGroupTeam(groupCode: string, idx: number, direction: -1 | 1) {
    setGroupOrders((prev) => {
      const current = [...(prev[groupCode] || [])];
      const nextIdx = idx + direction;
      if (idx < 0 || nextIdx < 0 || idx >= current.length || nextIdx >= current.length) return prev;
      const next = [...current];
      [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
      return { ...prev, [groupCode]: next };
    });
  }

  const effectiveLockUserId = (manualLockUserId || selectedLockUserId).trim();

  async function saveUserLockOverride() {
    if (!effectiveLockUserId) {
      setError("Select a player or enter a user ID.");
      return;
    }
    const unlockTs = new Date(lockUntilLocal).getTime();
    if (!Number.isFinite(unlockTs)) {
      setError("Pick a valid unlock time.");
      return;
    }
    setSaving(`lock:${effectiveLockUserId}`);
    setError(null);
    try {
      const { json } = await fetchLockApi({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: effectiveLockUserId,
          unlockUntil: new Date(unlockTs).toISOString(),
          reason: lockReason || null,
        }),
      });
      setLocksPayload((prev) =>
        prev
          ? { ...prev, overrides: (json.overrides || prev.overrides) as LockOverrideRow[] }
          : prev,
      );
      flash(`Saved unlock for ${effectiveLockUserId}.`);
      setManualLockUserId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lock override.");
    } finally {
      setSaving(null);
    }
  }

  async function clearUserOverride(userId: string) {
    setSaving(`lock-clear:${userId}`);
    setError(null);
    try {
      const { json } = await fetchLockApi({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, clear: true }),
      });
      setLocksPayload((prev) =>
        prev
          ? { ...prev, overrides: (json.overrides || prev.overrides) as LockOverrideRow[] }
          : prev,
      );
      flash(`Cleared unlock for ${userId}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear lock override.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-black/10 bg-white p-6">Loading Pickem admin...</div>;
  }

  if (!payload) {
    return <div className="rounded-xl border border-red-200 bg-white p-6 text-sm font-semibold text-red-700">{error || "No data."}</div>;
  }

  const modalMatch = modalMatchId ? matches.find((m) => m.id === modalMatchId) ?? null : null;
  const groupTeamsByCode = (() => {
    const map = new Map<string, PickemTeam[]>();
    for (const team of groupsPayload?.teams || []) {
      const arr = map.get(team.groupCode) || [];
      arr.push(team);
      map.set(team.groupCode, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    return map;
  })();
  const groupResultCountByCode = (() => {
    const map = new Map<string, number>();
    for (const row of groupsPayload?.groupResults || []) {
      map.set(row.groupCode, (map.get(row.groupCode) || 0) + 1);
    }
    return map;
  })();

  return (
    <div className="space-y-5">
      <nav className="sticky top-0 z-20 rounded-2xl border border-black/10 bg-white/95 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Clearway Pickem Admin</h1>
            <span className="rounded-md bg-amber-100 px-2 py-1 text-[10px] font-extrabold tracking-[0.12em] text-amber-800">
              ADMIN
            </span>
          </div>
          <div className="text-xs font-semibold text-slate-500">
            {payload.viewer?.name || payload.viewer?.email || "Signed admin"} {payload.isDeveloper ? "(Developer)" : ""}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1 rounded-xl bg-black/[0.04] p-1">
          <button
            type="button"
            onClick={() => setTab("matches")}
            className={`h-9 rounded-lg px-4 text-sm font-bold transition ${
              tab === "matches" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Match Results
          </button>
          <button
            type="button"
            onClick={() => setTab("groups")}
            className={`h-9 rounded-lg px-4 text-sm font-bold transition ${
              tab === "groups" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Group Standings
          </button>
          <button
            type="button"
            onClick={() => setTab("locks")}
            className={`h-9 rounded-lg px-4 text-sm font-bold transition ${
              tab === "locks" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Pick Locks
          </button>
          {payload.isDeveloper && (
            <>
              <div className="mx-1 h-5 w-px bg-black/10" />
              <button
                type="button"
                onClick={() => setTab("devmode")}
                className={`h-9 rounded-lg px-4 text-sm font-bold transition ${
                  tab === "devmode" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Dev Mode
              </button>
            </>
          )}
          <div className="mx-1 h-5 w-px bg-black/10" />
          <a
            href="/admin/playoffs/bracket-setup"
            className="h-9 rounded-lg px-4 text-sm font-bold transition text-slate-500 hover:text-slate-700 flex items-center"
          >
            Bracket Setup
          </a>
          <a
            href="/admin/playoffs/results"
            className="h-9 rounded-lg px-4 text-sm font-bold transition text-slate-500 hover:text-slate-700 flex items-center"
          >
            Playoff Results
          </a>
        </div>
      </nav>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Matches scored</div>
          <div className="mt-1 text-3xl font-black text-slate-900 tabular-nums">
            {scoredMatches.length}
            <span className="ml-1 text-sm text-slate-500">/ {matches.length}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Pending matches</div>
          <div className="mt-1 text-3xl font-black text-slate-900 tabular-nums">{pendingMatches}</div>
        </div>
        <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Players in pool</div>
          <div className="mt-1 text-3xl font-black text-slate-900 tabular-nums">{playersInPool}</div>
        </div>
      </section>

      {tab === "devmode" ? (
        <section className="space-y-4">
          <article className="rounded-2xl border border-black/[0.08] bg-white p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Dev Mode</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Simulate group stage completion without touching real match data. Only affects your account.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold tracking-[0.1em] ${
                devModePayload?.active
                  ? "bg-amber-100 text-amber-800"
                  : "bg-black/[0.05] text-slate-500"
              }`}>
                {devModePayload?.active ? `ACTIVE · ${devModePayload.overrideCount} overrides` : "INACTIVE"}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-3">
              {devModePayload?.active ? (
                <button
                  type="button"
                  onClick={() => void deactivateDevMode()}
                  disabled={saving === "devmode:deactivate"}
                  className="h-10 rounded-lg border border-black/15 px-4 text-sm font-bold text-slate-700 disabled:opacity-40"
                >
                  {saving === "devmode:deactivate" ? "Clearing..." : "Clear simulation"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void activateDevMode()}
                  disabled={saving === "devmode:activate" || devModeLoading}
                  className="h-10 rounded-lg bg-amber-500 px-4 text-sm font-bold text-white disabled:opacity-40"
                >
                  {saving === "devmode:activate" ? "Activating..." : "Simulate group stage complete"}
                </button>
              )}
            </div>

            {devModePayload?.active && (
              <div className="mt-4 rounded-xl bg-slate-50 border border-black/[0.07] px-4 py-3 text-sm">
                <div className="flex items-center gap-6 text-sm font-semibold text-slate-600">
                  <span>Matches predicted: <strong className="text-slate-900">{devModePayload.matchesWithPrediction ?? 0} / {devModePayload.overrideCount}</strong></span>
                  <span>Simulated points: <strong className="text-bk-blue">{devModePayload.totalPoints ?? 0} pts</strong></span>
                </div>
              </div>
            )}
          </article>

          {devModePayload?.active && devModePayload.preview && devModePayload.preview.length > 0 && (
            <article className="rounded-2xl border border-black/[0.08] bg-white p-5">
              <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700 mb-3">Score preview</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      <th className="pb-2 pr-3">Group</th>
                      <th className="pb-2 pr-3">Match</th>
                      <th className="pb-2 pr-3 text-center">Actual</th>
                      <th className="pb-2 pr-3 text-center">Predicted</th>
                      <th className="pb-2 text-center">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.05]">
                    {(devModePayload.preview ?? [])
                      .sort((a, b) => (a.groupCode ?? '').localeCompare(b.groupCode ?? ''))
                      .map(row => (
                        <tr key={row.matchId} className="text-slate-700">
                          <td className="py-1.5 pr-3 font-bold text-slate-400">{row.groupCode ?? '-'}</td>
                          <td className="py-1.5 pr-3 font-semibold">
                            {row.homeName} <span className="text-slate-400">vs</span> {row.awayName}
                          </td>
                          <td className="py-1.5 pr-3 text-center font-extrabold tabular-nums">
                            {row.actualHome}–{row.actualAway}
                          </td>
                          <td className="py-1.5 pr-3 text-center font-semibold tabular-nums">
                            {row.hasPrediction ? `${row.predictedHome}–${row.predictedAway}` : (
                              <span className="text-slate-400 italic">none</span>
                            )}
                          </td>
                          <td className="py-1.5 text-center">
                            {row.hasPrediction ? (
                              <span className={`font-extrabold ${
                                row.scoreCorrect ? 'text-emerald-600' : row.outcomeCorrect ? 'text-blue-600' : 'text-red-500'
                              }`}>
                                {row.points > 0 ? `+${row.points}` : '0'}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}
        </section>
      ) : tab === "groups" ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(groupsPayload?.groups || []).map((group) => {
            const teamOrder = groupOrders[group.code] || (groupTeamsByCode.get(group.code) || []).map((t) => t.id);
            const teamObjs = teamOrder
              .map((teamId) => groupsPayload?.teams.find((team) => team.id === teamId))
              .filter((team): team is PickemTeam => Boolean(team));
            const isPublished = (groupResultCountByCode.get(group.code) || 0) === 4;
            return (
              <article key={group.code} className="rounded-2xl border border-black/[0.08] bg-slate-900 p-4 text-white">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-extrabold tracking-[0.14em]">GROUP {group.code}</h2>
                  <span
                    className={`rounded px-2 py-1 text-[10px] font-extrabold tracking-[0.1em] ${
                      isPublished ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60"
                    }`}
                  >
                    {isPublished ? "FINAL" : "DRAFT"}
                  </span>
                </div>
                <div className="space-y-2">
                  {teamObjs.map((team, idx) => (
                    <div key={team.id} className="flex items-center gap-2 rounded-lg bg-white/10 px-2 py-2">
                      <span className="w-5 text-center text-sm font-bold text-blue-200">{idx + 1}</span>
                      <span className="flex-1 truncate text-sm font-semibold">{team.name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveGroupTeam(group.code, idx, -1)}
                          disabled={idx === 0}
                          className="h-7 w-7 rounded border border-white/25 text-xs font-black disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveGroupTeam(group.code, idx, 1)}
                          disabled={idx === teamObjs.length - 1}
                          className="h-7 w-7 rounded border border-white/25 text-xs font-black disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => void publishGroup(group.code)}
                    disabled={saving === `group:${group.code}`}
                    className="h-9 flex-1 rounded-lg bg-blue-600 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {saving === `group:${group.code}` ? "Publishing..." : "Publish Standings"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void unpublishGroup(group.code)}
                    disabled={saving === `group:${group.code}:clear`}
                    className="h-9 rounded-lg border border-white/25 px-3 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {saving === `group:${group.code}:clear` ? "Clearing..." : "Clear"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : tab === "locks" ? (
        <section className="space-y-4">
          <article className="rounded-2xl border border-black/[0.08] bg-white p-4">
            <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">
              Per-user lock override
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Unlock one player after global lock. This does not change match kickoff dates or lock date.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Pick player</span>
                <select
                  value={selectedLockUserId}
                  onChange={(e) => setSelectedLockUserId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
                >
                  <option value="">Select participant</option>
                  {(locksPayload?.participants || []).map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.displayName} · #{user.rank} · {user.points} pts
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                  Or user id
                </span>
                <input
                  value={manualLockUserId}
                  onChange={(e) => setManualLockUserId(e.target.value)}
                  placeholder="uuid"
                  className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Unlocked until</span>
                <input
                  type="datetime-local"
                  value={lockUntilLocal}
                  onChange={(e) => setLockUntilLocal(e.target.value)}
                  className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Reason (optional)</span>
                <input
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  placeholder="Support override"
                  className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveUserLockOverride()}
                disabled={!lockUntilLocal || !effectiveLockUserId || saving === `lock:${effectiveLockUserId}`}
                className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                {saving === `lock:${effectiveLockUserId}` ? "Saving..." : "Save unlock"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualLockUserId("");
                  setSelectedLockUserId("");
                  setLockReason("");
                  setLockUntilLocal("");
                }}
                className="h-10 rounded-lg border border-black/15 px-4 text-sm font-bold text-slate-700"
              >
                Clear form
              </button>
            </div>
          </article>

          <article className="rounded-2xl border border-black/[0.08] bg-white p-4">
            <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Active overrides</h3>
            <div className="mt-3 space-y-2">
              {(locksPayload?.overrides || []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-black/20 px-3 py-4 text-sm font-semibold text-slate-500">
                  No active per-user unlocks.
                </div>
              ) : (
                (locksPayload?.overrides || []).map((row) => {
                  const user = (locksPayload?.participants || []).find((p) => p.userId === row.userId);
                  return (
                    <div key={row.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {user?.displayName || "Unknown user"} · {row.userId}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          Until {fmtKickoff(row.unlockUntil)}
                          {row.reason ? ` · ${row.reason}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void clearUserOverride(row.userId)}
                        disabled={saving === `lock-clear:${row.userId}`}
                        className="h-9 rounded-lg border border-black/15 px-3 text-xs font-bold text-slate-700 disabled:opacity-40"
                      >
                        {saving === `lock-clear:${row.userId}` ? "Clearing..." : "Remove"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </section>
      ) : (
        <section className="space-y-4">
          {matches.map((match) => {
            const home = teamById.get(match.homeTeamId);
            const away = teamById.get(match.awayTeamId);
            const edit = getEditForMatch(match);
            const published =
              Number.isInteger(match.homeScore) &&
              Number.isInteger(match.awayScore) &&
              String(match.status || "").toLowerCase() === "finished";
            const isLive = String(match.status || "").toLowerCase() === "live";
            const liveChecked = edit.live;
            return (
              <article
                key={match.id}
                className={`rounded-xl border bg-white p-4 sm:p-5 ${
                  published ? "border-emerald-300 shadow-[0_1px_3px_rgba(22,163,74,0.10)]" : "border-black/[0.08]"
                }`}
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-slate-700">
                    Group {match.groupCode || "-"} · {fmtKickoff(match.kickoffAt)}
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-extrabold tracking-[0.1em] ${
                      published ? "bg-emerald-100 text-emerald-800" : "bg-black/[0.05] text-slate-500"
                    }`}
                  >
                    {published ? "SCORED" : "PENDING"}
                  </span>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex-1 text-sm font-bold text-slate-900">{home?.name || "Home"}</div>
                  <input
                    value={edit.home}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [match.id]: { ...edit, home: String(e.target.value).replace(/[^0-9]/g, "").slice(0, 2) },
                      }))
                    }
                    className="h-11 w-12 rounded-lg border-2 border-black/15 text-center text-lg font-extrabold"
                    inputMode="numeric"
                    disabled={!liveChecked && !published}
                  />
                  <span className="text-lg font-black text-black/25">-</span>
                  <input
                    value={edit.away}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [match.id]: { ...edit, away: String(e.target.value).replace(/[^0-9]/g, "").slice(0, 2) },
                      }))
                    }
                    className="h-11 w-12 rounded-lg border-2 border-black/15 text-center text-lg font-extrabold"
                    inputMode="numeric"
                    disabled={!liveChecked && !published}
                  />
                  <div className="flex-1 text-right text-sm font-bold text-slate-900">{away?.name || "Away"}</div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-3">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={liveChecked}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [match.id]: { ...edit, live: e.target.checked },
                          }))
                        }
                      />
                      Live
                    </label>
                    <span className="text-xs font-semibold text-slate-500">
                      {published
                        ? "Published. You can edit and republish final."
                        : isLive || liveChecked
                          ? "Live match updates enabled"
                          : "Enable Live to edit"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void saveMatch(match, "live")}
                      disabled={saving === match.id || edit.home === "" || edit.away === "" || !liveChecked}
                      className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Update Live
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalMatchId(match.id)}
                      disabled={
                        saving === match.id ||
                        edit.home === "" ||
                        edit.away === "" ||
                        (!liveChecked && !published)
                      }
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {published ? "Republish Final" : "Publish Final"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {modalMatch && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-[460px] sm:rounded-2xl">
            <h3 className="text-sm font-extrabold uppercase tracking-[0.1em] text-blue-700">Confirm publish</h3>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              Save this score and recompute all player points for {payload.competition.name}?
            </p>
            <div className="mt-3 rounded-lg border border-black/[0.08] bg-black/[0.02] p-3 text-sm font-bold text-slate-800">
              {(teamById.get(modalMatch.homeTeamId)?.name || "Home") +
                " " +
                getEditForMatch(modalMatch).home +
                " - " +
                getEditForMatch(modalMatch).away +
                " " +
                (teamById.get(modalMatch.awayTeamId)?.name || "Away")}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setModalMatchId(null)}
                className="h-10 flex-1 rounded-lg border border-black/15 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveMatch(modalMatch, "finished")}
                disabled={saving === modalMatch.id}
                className="h-10 flex-1 rounded-lg bg-blue-600 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving === modalMatch.id ? "Saving..." : "Confirm & Publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 transition-all duration-300 ${
          toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <div className="max-w-[90vw] rounded-xl bg-slate-900 px-4 py-3 text-[13px] font-semibold text-white shadow-xl">
          {toast || ""}
        </div>
      </div>
    </div>
  );
}

