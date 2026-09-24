"use client";

// Agent settings (design spec §12): organisation settings, admins only. Five
// capability switches (saved immediately, each change logged server-side),
// who-can-do-what from the allowlist, and this month's usage against the cap.
// There is no "don't ask" mode: the write switch removes the capability;
// confirmation is not configurable.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import { LoadingRows } from "@/components/console-kit";
import { C, mono } from "../ui/tokens";
import { Eyebrow, Toggle } from "../ui/primitives";
import AgentStyles from "../ui/AgentStyles";
import { AGENT_BASE } from "../types";

type Capability = { key: string; label: string; description: string; enabled: boolean };
type Person = { userId: string; email: string; name: string; read: string; wall: string; sendEmail: string; approveKb: string };
type Usage = { month: string; spendEur: number; capEur: number; replies: number; toolCalls: number; heaviest: { email: string; eur: number } | null; model: string | null; voice: boolean };

const AVATAR = [C.primary, C.ok, C.warn, C.neutral, C.info, C.danger];
const initialsOf = (s: string) => s.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
const eur = (n: number) => `€${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SettingsPage() {
  const [caps, setCaps] = useState<Capability[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const get = (p: string) => fetch(`${AGENT_BASE}${p}`, { credentials: "same-origin", cache: "no-store" }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch(() => ({ status: 0, body: null }));
    const [s, p, u] = await Promise.all([get("/api/settings"), get("/api/settings/permissions"), get("/api/usage")]);
    if (s.status === 401 || s.status === 403) { setForbidden(true); return; }
    if (!s.body?.ok) { setError(s.body?.message || "Could not load settings."); return; }
    setCaps(s.body.capabilities); setCanEdit(Boolean(s.body.canEdit));
    if (p.status === 403 || u.status === 403) setForbidden(true);
    setPeople(p.body?.ok ? p.body.people : []); setUsage(u.body?.ok ? u.body.usage : null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(cap: Capability, next: boolean) {
    if (!canEdit || saving) return;
    setSaving(cap.key); setError(null);
    const prev = caps;
    setCaps((list) => (list ?? []).map((c) => (c.key === cap.key ? { ...c, enabled: next } : c)));
    const r = await fetch(`${AGENT_BASE}/api/settings`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: cap.key, enabled: next }) }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setCaps(prev); setError(r?.message || `Could not change “${cap.label}”.`); } else setCaps(r.capabilities);
    setSaving(null);
  }

  const pct = usage ? Math.min(100, Math.round((usage.spendEur / Math.max(usage.capEur, 0.01)) * 100)) : 0;
  const cell = (v: string) => (v === "yes" ? <span style={{ color: C.okDot }}>✓</span> : v === "ask" ? <span style={{ color: C.primaryHover }}>ask</span> : <span style={{ color: C.disabledFill }}>—</span>);

  return (
    <PortalShell crumb="Ops Agent" title="Agent settings" subtitle="Organisation settings, admins only. Your own voice preferences are under Account.">
      <AgentStyles />
      <div style={{ padding: "30px 32px", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18, alignItems: "start", maxWidth: 1180 }}>
        {error && <div role="alert" style={{ gridColumn: "1 / -1", fontSize: 13, color: C.danger }}>{error}</div>}
        {forbidden && !caps && <div role="alert" style={{ gridColumn: "1 / -1", fontSize: 13.5, color: C.muted }}>Admins only. Ask an administrator if you need a capability changed.</div>}

        {/* Capabilities */}
        <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }} aria-label="Capabilities">
          <div style={{ padding: "14px 18px 8px" }}><Eyebrow>Capabilities</Eyebrow></div>
          {caps === null && !forbidden && <div style={{ padding: "0 18px 14px" }}><LoadingRows rows={5} /></div>}
          {caps?.map((cap) => (
            <div key={cap.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", borderTop: `1px solid ${C.dividerRow}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{cap.label}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.45, color: C.muted }}>{cap.description}</div>
              </div>
              <Toggle on={cap.enabled} disabled={!canEdit || saving === cap.key} label={cap.label} onChange={(next) => void toggle(cap, next)} />
            </div>
          ))}
          {caps && !canEdit && <div style={{ padding: "10px 18px 14px", fontSize: 12.5, color: C.faint, borderTop: `1px solid ${C.dividerRow}` }}>Read-only: only admins can change these.</div>}
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Who can do what */}
          <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }} aria-label="Who can do what">
            <div style={{ padding: "14px 18px 8px" }}><Eyebrow>Who can do what</Eyebrow></div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) repeat(4,1fr)", padding: "8px 18px", background: C.page, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: C.faint }}>
              <span>PERSON</span>{["READ", "WALL", "EMAIL", "APPROVE KB"].map((h) => <span key={h} style={{ textAlign: "center" }}>{h}</span>)}
            </div>
            {people === null && !forbidden && <div style={{ padding: 18 }}><LoadingRows rows={3} /></div>}
            {people?.map((p, i) => (
              <div key={p.userId} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) repeat(4,1fr)", alignItems: "center", padding: "10px 18px", borderTop: `1px solid ${C.dividerRow}`, fontSize: 13, fontWeight: 700 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: AVATAR[i % AVATAR.length], color: C.surface, fontSize: 10.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{initialsOf(p.name || p.email)}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || p.email}</span>
                </span>
                <span style={{ textAlign: "center" }}>{cell(p.read)}</span><span style={{ textAlign: "center" }}>{cell(p.wall)}</span><span style={{ textAlign: "center" }}>{cell(p.sendEmail)}</span><span style={{ textAlign: "center" }}>{cell(p.approveKb)}</span>
              </div>
            ))}
            {people && people.length === 0 && <div style={{ padding: "12px 18px", fontSize: 13, color: C.muted, borderTop: `1px solid ${C.dividerRow}` }}>No one has been granted the agent yet.</div>}
            <div style={{ padding: "10px 18px 14px", fontSize: 12.5, color: C.muted, borderTop: `1px solid ${C.dividerRow}` }}>The agent never has more access than the person asking. Roles are set in Admin → Users.</div>
          </section>

          {/* Usage */}
          <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }} aria-label="Usage">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Eyebrow>{usage ? `Usage · ${usage.month}` : "Usage"}</Eyebrow>
              {usage && <span style={{ ...mono({ fontSize: 12 }), color: C.muted }}>model: {usage.model ?? "—"} · voice: {usage.voice ? "on" : "off"}</span>}
            </div>
            {usage === null && !forbidden && <LoadingRows rows={2} />}
            {usage && (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>{eur(usage.spendEur)}</span>
                  <span style={{ fontSize: 13, color: C.muted }}>of {eur(usage.capEur)} monthly cap · {usage.replies.toLocaleString("en-GB")} replies · {usage.toolCalls.toLocaleString("en-GB")} tool calls</span>
                </div>
                <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 8, borderRadius: 999, background: C.divider, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? C.dangerBadge : C.primary, borderRadius: 999 }} /></div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.muted }}>At the cap the agent stops replying and says so; the console is unaffected.{usage.heaviest ? ` Heaviest user: ${usage.heaviest.email}, ${eur(usage.heaviest.eur)}.` : ""}</div>
              </>
            )}
          </section>
        </div>
      </div>
    </PortalShell>
  );
}
