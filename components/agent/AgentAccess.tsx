"use client";

// Agent access manager — who can use the dispatcher agent, and the one switch
// that turns it off for everyone.
//
// Developer-only: the API returns 403 to anyone else, and the nav entry is
// developer-gated. The list is deliberately honest about provenance — every row
// shows when access was granted and by whom, because "who let this person in"
// is the question that gets asked after something goes wrong.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import type { AgentAccessRow, AgentKillSwitch } from "@/lib/agent/shared";

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function AgentAccess() {
  const [rows, setRows] = useState<AgentAccessRow[] | null>(null);
  const [killSwitch, setKillSwitch] = useState<AgentKillSwitch | null>(null);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    const accessRes = await fetch(`/api/assistant/access?includeRevoked=${includeRevoked}`, { cache: "no-store" }).catch(() => null);
    if (accessRes?.status === 403) {
      setForbidden(true);
      setRows([]);
      return;
    }
    const accessBody = await accessRes?.json().catch(() => null);
    setRows(accessBody?.access ?? []);
    const switchRes = await fetch("/api/assistant/kill-switch", { cache: "no-store" }).catch(() => null);
    const switchBody = await switchRes?.json().catch(() => null);
    setKillSwitch(switchBody?.killSwitch ?? null);
  }, [includeRevoked]);

  useEffect(() => { void load(); }, [load]);

  async function grant() {
    const target = email.trim();
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/assistant/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target, note: note.trim() || null }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) setError(body?.error || "Could not grant access.");
    else { setEmail(""); setNote(""); }
    setBusy(false);
    void load();
  }

  async function revoke(row: AgentAccessRow) {
    if (busy) return;
    // Revocation is immediate everywhere, including mid-conversation — say so
    // rather than letting someone discover it by surprising a colleague.
    if (!confirm(`Revoke agent access for ${row.userEmail || row.userId}?\n\nThis takes effect immediately, including in any conversation they have open right now.`)) return;
    setBusy(true);
    await fetch(`/api/assistant/access?userId=${encodeURIComponent(row.userId)}`, { method: "DELETE" }).catch(() => {});
    setBusy(false);
    void load();
  }

  async function toggleKillSwitch() {
    if (!killSwitch || busy) return;
    const turningOff = killSwitch.enabled;
    let reason: string | null = null;
    if (turningOff) {
      reason = prompt("Disabling the agent for EVERYONE. Why? (recorded in the audit log)");
      if (!reason || reason.trim().length < 3) return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/assistant/kill-switch", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !killSwitch.enabled, reason: reason?.trim() || "Re-enabled" }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) setError(body?.error || "Could not change the kill switch.");
    setBusy(false);
    void load();
  }

  const active = (rows ?? []).filter((r) => !r.revokedAt);

  return (
    <PortalShell
      crumb="Developer"
      title="Agent access"
      subtitle="Who can use the dispatcher agent. Developer-managed — the agent is a build in progress."
    >
      <div className="mx-auto flex max-w-[860px] flex-col gap-3 px-[30px] py-6">
        {forbidden && (
          <div className="rounded-[13px] border border-[#f3c7c2] bg-[#fdf2f2] p-4 text-[13px] text-[#b42318]">
            Developer role required.
          </div>
        )}

        {/* Kill switch first: it overrides every row below it. */}
        {killSwitch && (
          <div
            className="flex items-center gap-3 rounded-[13px] border p-4"
            style={killSwitch.enabled ? { borderColor: "#cfe6d6", background: "#f3faf5" } : { borderColor: "#f3c7c2", background: "#fdf2f2" }}
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] text-[15px]"
              style={killSwitch.enabled ? { background: "#e7f6ec", color: "#15803d" } : { background: "#fbe3e0", color: "#b42318" }}>
              {killSwitch.enabled ? "◉" : "⏻"}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13.5px] font-bold text-cw-ink">
                {killSwitch.enabled ? "Agent is enabled" : "Agent is DISABLED for everyone"}
              </span>
              <span className="text-[11.5px] text-cw-faint">
                {killSwitch.reason ? `${killSwitch.reason} · ` : ""}
                {killSwitch.updatedByEmail ? `${killSwitch.updatedByEmail} · ` : ""}
                {when(killSwitch.updatedAt)}
              </span>
            </div>
            <button
              onClick={() => void toggleKillSwitch()}
              disabled={busy}
              className="h-9 cursor-pointer rounded-[9px] border-none px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: killSwitch.enabled ? "#b42318" : "#15803d" }}
            >
              {killSwitch.enabled ? "Disable for everyone" : "Enable"}
            </button>
          </div>
        )}

        {!forbidden && (
          <div className="flex flex-col gap-3 rounded-[13px] border border-[#dbe6ff] bg-[#f2f7ff] p-4">
            <div className="flex gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void grant()}
                placeholder="work email of the person to grant access to"
                className="h-9 flex-1 rounded-[9px] border border-cw-border bg-white px-3 text-[13.5px] text-cw-ink outline-none"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="note (optional)"
                className="h-9 w-[200px] rounded-[9px] border border-cw-border bg-white px-3 text-[13.5px] text-cw-ink outline-none"
              />
              <button
                onClick={() => void grant()}
                disabled={busy || !email.trim()}
                className="h-9 cursor-pointer rounded-[9px] border-none bg-cw-primary px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50"
              >
                {busy ? "Working…" : "Grant access"}
              </button>
            </div>
            {error && <span className="text-[12px] text-[#b42318]">{error}</span>}
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-cw-muted">
          <input type="checkbox" checked={includeRevoked} onChange={(e) => setIncludeRevoked(e.target.checked)} />
          Show revoked grants
        </label>

        {rows === null && <div className="h-16 animate-pulse rounded-[13px] bg-white" />}
        {rows?.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-[13px] border border-cw-border bg-white px-4 py-3"
            style={r.revokedAt ? { opacity: 0.6 } : undefined}
          >
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] text-[13px]"
              style={r.revokedAt ? { background: "#f1f1f2", color: "#9aa0a8" } : { background: "#e7f6ec", color: "#15803d" }}>
              {r.revokedAt ? "✕" : "✓"}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13.5px] font-semibold text-cw-ink">{r.userEmail || r.userId}</span>
              <span className="text-[11.5px] text-cw-faint">
                granted {when(r.grantedAt)}
                {r.grantedByEmail ? ` by ${r.grantedByEmail}` : ""}
                {r.revokedAt ? ` · revoked ${when(r.revokedAt)}${r.revokedByEmail ? ` by ${r.revokedByEmail}` : ""}` : ""}
                {r.note ? ` · ${r.note}` : ""}
              </span>
            </div>
            {!r.revokedAt && (
              <button
                onClick={() => void revoke(r)}
                disabled={busy}
                className="cursor-pointer border-none bg-transparent text-[12.5px] font-semibold text-cw-faint hover:text-cw-red disabled:opacity-50"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
        {rows !== null && rows.length === 0 && !forbidden && (
          <div className="rounded-[13px] border border-cw-border bg-white p-6 text-center text-[13px] text-cw-muted">
            Nobody has agent access yet. Until someone is granted access, the agent does not appear anywhere in the platform.
          </div>
        )}
        {active.length > 0 && (
          <span className="px-1 text-[11.5px] text-cw-faint">
            {active.length} {active.length === 1 ? "person has" : "people have"} access. Revoking takes effect immediately, including mid-conversation.
          </span>
        )}
      </div>
    </PortalShell>
  );
}
