"use client";

// Agent access manager — who can use the dispatcher agent, and the one switch
// that turns it off for everyone.
//
// Built entirely on components/console-kit (the Display Console design system,
// wired to shared/design-tokens.json). No browser-default controls: the
// revoke confirmation and the disable-reason prompt are real dialogs, the
// "show revoked" control is the console Toggle, and every input, button and
// banner is the kit's. In an ops tool a native confirm() is also the one piece
// of UI a user cannot distinguish from a phishing prompt.
//
// Developer-only: the API returns 403 to anyone else. The list is deliberately
// honest about provenance — every row shows when access was granted and by
// whom, because "who let this person in" is what gets asked afterwards.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import {
  Button, Card, ConfirmDialog, ConsoleStyles, EmptyState, ErrorBanner, FieldLabel,
  InfoBanner, LoadingRows, ReasonDialog, StatusPill, TextInput, Toggle, t,
} from "@/components/console-kit";
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
  const [revoking, setRevoking] = useState<AgentAccessRow | null>(null);
  const [disabling, setDisabling] = useState(false);

  const load = useCallback(async () => {
    const accessRes = await fetch(`/api/assistant/access?includeRevoked=${includeRevoked}`, { cache: "no-store" }).catch(() => null);
    if (accessRes?.status === 403) { setForbidden(true); setRows([]); return; }
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
    setBusy(true); setError(null);
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

  async function confirmRevoke() {
    if (!revoking) return;
    setBusy(true);
    await fetch(`/api/assistant/access?userId=${encodeURIComponent(revoking.userId)}`, { method: "DELETE" }).catch(() => {});
    setBusy(false); setRevoking(null);
    void load();
  }

  async function applyKillSwitch(enabled: boolean, reason: string) {
    setBusy(true); setError(null);
    const res = await fetch("/api/assistant/kill-switch", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, reason }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) setError(body?.error || "Could not change the kill switch.");
    setBusy(false); setDisabling(false);
    void load();
  }

  const active = (rows ?? []).filter((r) => !r.revokedAt);

  return (
    <PortalShell
      crumb="Developer"
      title="Agent access"
      subtitle="Who can use the dispatcher agent. Developer-managed — the agent is a build in progress."
    >
      <ConsoleStyles />
      <div className="cw-kit" style={{ margin: "0 auto", maxWidth: 880, padding: "24px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        {forbidden && <ErrorBanner>Developer role required.</ErrorBanner>}

        {/* The kill switch comes first: it overrides every grant below it. */}
        {killSwitch && (
          <Card style={{ padding: 16, display: "flex", alignItems: "center", gap: 14, borderColor: killSwitch.enabled ? t.greenBorder : t.redBorder, background: killSwitch.enabled ? "#f6fbf8" : t.redTint }}>
            <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, background: killSwitch.enabled ? t.greenTint : "#fbdcdc", color: killSwitch.enabled ? t.greenDeep : t.redDeep }}>
              {killSwitch.enabled ? "◉" : "⏻"}
            </span>
            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: t.ink }}>
                  {killSwitch.enabled ? "Agent is enabled" : "Agent is disabled for everyone"}
                </span>
                <StatusPill
                  color={killSwitch.enabled ? t.greenDeep : t.redDeep}
                  bg={killSwitch.enabled ? t.greenTint : "#fbdcdc"}
                  dot={killSwitch.enabled ? t.green : t.red}
                >
                  {killSwitch.enabled ? "LIVE" : "OFF"}
                </StatusPill>
              </div>
              <span style={{ fontSize: 12.5, color: t.muted, lineHeight: 1.5 }}>
                {killSwitch.reason ? `${killSwitch.reason} · ` : ""}
                {killSwitch.updatedByEmail ? `${killSwitch.updatedByEmail} · ` : ""}
                {when(killSwitch.updatedAt)}
              </span>
            </div>
            <Button
              variant={killSwitch.enabled ? "danger" : "primary"}
              disabled={busy}
              onClick={() => (killSwitch.enabled ? setDisabling(true) : void applyKillSwitch(true, "Re-enabled"))}
            >
              {killSwitch.enabled ? "Disable for everyone" : "Enable"}
            </Button>
          </Card>
        )}

        {!forbidden && (
          <Card style={{ padding: 16, background: t.blueWash, borderColor: t.blueBorder }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                <FieldLabel>Work email</FieldLabel>
                <TextInput
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void grant()}
                  placeholder="person@clearway.aero"
                />
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                <FieldLabel extra={<span style={{ fontWeight: 500, color: t.faint }}>optional</span>}>Note</FieldLabel>
                <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="why they need it" />
              </div>
              <Button variant="primary" spin={busy} disabled={busy || !email.trim()} onClick={() => void grant()} style={{ height: 42 }}>
                Grant access
              </Button>
            </div>
          </Card>
        )}

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 2px 0" }}>
          <Toggle size="sm" on={includeRevoked} onToggle={() => setIncludeRevoked((v) => !v)} label="Show revoked grants" />
          <span style={{ fontSize: 13, fontWeight: 600, color: t.body }}>Show revoked grants</span>
          {active.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: t.faint }}>
              {active.length} {active.length === 1 ? "person has" : "people have"} access
            </span>
          )}
        </div>

        {rows === null && <LoadingRows rows={2} />}

        {rows?.map((r) => (
          <Card key={r.id} className="cw-hover-row" style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 13, opacity: r.revokedAt ? 0.62 : 1 }}>
            <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, background: r.revokedAt ? "#f1f1f2" : t.greenTint, color: r.revokedAt ? t.faint : t.greenDeep }}>
              {r.revokedAt ? "✕" : "✓"}
            </span>
            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.userEmail || r.userId}
              </span>
              <span style={{ fontSize: 12.5, color: t.muted, lineHeight: 1.5 }}>
                granted {when(r.grantedAt)}
                {r.grantedByEmail ? ` by ${r.grantedByEmail}` : ""}
                {r.revokedAt ? ` · revoked ${when(r.revokedAt)}${r.revokedByEmail ? ` by ${r.revokedByEmail}` : ""}` : ""}
                {r.note ? ` · ${r.note}` : ""}
              </span>
            </div>
            {!r.revokedAt && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRevoking(r)} style={{ color: t.muted }}>
                Revoke
              </Button>
            )}
          </Card>
        ))}

        {rows !== null && rows.length === 0 && !forbidden && (
          <EmptyState title="Nobody has agent access yet">
            Until someone is granted access, the agent does not appear anywhere in the platform — no menu entry, no page.
          </EmptyState>
        )}

        {!forbidden && (
          <InfoBanner>
            Revoking takes effect immediately, including in a conversation someone already has open: the gate is
            re-checked on every message. The kill switch overrides every grant above.
          </InfoBanner>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(revoking)}
        title="Revoke agent access?"
        body={`${revoking?.userEmail || revoking?.userId || ""}\n\nThis takes effect immediately, including in any conversation they have open right now.`}
        confirmLabel="Revoke access"
        busy={busy}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setRevoking(null)}
      />

      <ReasonDialog
        open={disabling}
        title="Disable the agent for everyone?"
        body="Every user loses the agent immediately, regardless of their grant."
        label="Why are you disabling it?"
        placeholder="e.g. wrong answers on NOTAM lookups — investigating"
        confirmLabel="Disable agent"
        busy={busy}
        onConfirm={(reason) => void applyKillSwitch(false, reason)}
        onCancel={() => setDisabling(false)}
      />
    </PortalShell>
  );
}
