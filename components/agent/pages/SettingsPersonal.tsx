"use client";

// Settings sections added for items 3 and 4:
//  - Your preferences (every agent user): default model tier, and "Skip confirmation for low-risk actions"
//    (off by default; lists exactly which actions qualify and which always confirm; shows an admin lock).
//  - Routing (admins): the tier → model mapping and the escalation rules, saved to the organisation's
//    settings and applied on the next turn — no deploy.
//  - Skip-confirmation lock (admins): turn the setting off for everyone.

import { useEffect, useState } from "react";
import { C, mono } from "../ui/tokens";
import { Button, Eyebrow, Toggle } from "../ui/primitives";
import { AGENT_BASE } from "../types";

type Prefs = { defaultTier: string | null; skipConfirm: boolean; skipConfirmRequested: boolean; skipLocked: boolean; skipLockedForAll: boolean };
type Catalogue = { qualified: { tool: string; why: string }[]; alwaysConfirm: { tool: string; why: string }[] };
type TierCfg = { id: string | null; fallbackId: string | null; source?: string };
type Escalation = { lowConfidenceBelow: number; maxToolsBeforeEscalate: number; authoritativeFloor: string; conflictTo: string; careTo: string; retryOnFailure: boolean };

const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" } as const;
async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(`${AGENT_BASE}${path}`, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const b = await r.json().catch(() => null);
  return { ok: r.ok && b?.ok !== false, body: b };
}

export function PersonalSettings() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void api("/api/settings/me").then(({ ok, body }) => { if (ok) { setPrefs(body.prefs); setCat(body.lowRiskActions); } }); }, []);
  async function save(patch: Record<string, unknown>) {
    setMsg(null);
    const { ok, body } = await api("/api/settings/me", { method: "PATCH", body: JSON.stringify(patch) });
    if (ok) setPrefs(body.prefs); else setMsg(body?.message ?? "Could not save.");
  }
  return (
    <section aria-label="Your preferences" style={{ ...card, gridColumn: "1 / -1" }}>
      <div style={{ padding: "14px 18px 6px" }}><Eyebrow>Your preferences</Eyebrow></div>
      {!prefs ? <div style={{ padding: "0 18px 16px", fontSize: 13, color: C.muted }}>Loading…</div> : (
        <div style={{ padding: "4px 18px 18px", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Default model</span>
            <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>Automatic lets the router pick per request. A fixed tier is a floor: the agent may still escalate a turn, never lower it. Type <span style={mono({ fontSize: 12 })}>/model reasoning</span> to choose for one turn.</span>
            <div role="radiogroup" aria-label="Default model" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[["", "Automatic"], ["fast", "Fast · Haiku"], ["standard", "Standard · Sonnet"], ["reasoning", "Reasoning · Opus"]].map(([v, l]) => {
                const on = (prefs.defaultTier ?? "") === v;
                return <button key={v || "auto"} type="button" role="radio" aria-checked={on} onClick={() => void save({ defaultTier: v || null })} className="ag-focus" style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "6px 10px", borderRadius: 8, cursor: "pointer", border: `1px solid ${on ? C.primary : C.borderControl}`, background: on ? C.primaryTint : C.surface, color: on ? C.primaryHover : C.body }}>{l}</button>;
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, flex: 1 }}>Skip confirmation for low-risk actions</span>
              <Toggle on={prefs.skipConfirm} disabled={prefs.skipLocked} label="Skip confirmation for low-risk actions" onChange={(next) => void save({ skipConfirm: next })} />
            </div>
            <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
              Off by default. Only actions that can be undone run without a card; each is logged as auto-confirmed with an Undo in the reply. Voice never skips a confirmation.
              {prefs.skipLocked && <b style={{ color: C.warn }}> {prefs.skipLockedForAll ? "An admin has turned this off for everyone." : "An admin has turned this off for your account."}</b>}
            </span>
            {cat && (
              <details style={{ fontSize: 12.5, color: C.body }}>
                <summary style={{ cursor: "pointer", color: C.primaryHover, fontWeight: 600 }}>Which actions qualify</summary>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 8 }}>
                  <div><div style={{ fontWeight: 700, marginBottom: 4 }}>May skip (undoable)</div>{cat.qualified.map((q) => <div key={q.tool} style={{ marginBottom: 4 }}><span style={mono({ fontSize: 11.5 })}>{q.tool}</span><br /><span style={{ color: C.muted }}>{q.why}</span></div>)}</div>
                  <div><div style={{ fontWeight: 700, marginBottom: 4 }}>Always confirms</div>{cat.alwaysConfirm.map((q) => <div key={q.tool} style={{ marginBottom: 4 }}><span style={mono({ fontSize: 11.5 })}>{q.tool}</span><br /><span style={{ color: C.muted }}>{q.why}</span></div>)}</div>
                </div>
              </details>
            )}
          </div>
          {msg && <div role="alert" style={{ gridColumn: "1 / -1", fontSize: 12.5, color: C.danger }}>{msg}</div>}
        </div>
      )}
    </section>
  );
}

export function RoutingSettings() {
  const [data, setData] = useState<{ tiers: Record<string, TierCfg>; escalation: Escalation; canEdit: boolean } | null>(null);
  const [draft, setDraft] = useState<{ tiers: Record<string, TierCfg>; escalation: Escalation } | null>(null);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [lockAll, setLockAll] = useState(false);
  useEffect(() => { void api("/api/settings/routing").then(({ ok, body }) => { if (ok) { setData(body); setDraft({ tiers: body.tiers, escalation: body.escalation }); } }); }, []);
  if (!data || !draft || !data.canEdit) return null;
  const tiers = ["router", "fast", "standard", "reasoning", "embeddings", "rerank"];
  const setTier = (t: string, k: "id" | "fallbackId", v: string) => setDraft((d) => d && ({ ...d, tiers: { ...d.tiers, [t]: { ...d.tiers[t], [k]: v } } }));
  const setEsc = (k: keyof Escalation, v: unknown) => setDraft((d) => d && ({ ...d, escalation: { ...d.escalation, [k]: v } }));
  async function save() {
    if (!draft) return;
    setMsg(null);
    const { ok, body } = await api("/api/settings/routing", { method: "PUT", body: JSON.stringify({ tiers: Object.fromEntries(tiers.map((t) => [t, { id: draft.tiers[t]?.id ?? null, fallbackId: draft.tiers[t]?.fallbackId ?? null }])), escalation: draft.escalation }) });
    setMsg(ok ? { text: "Saved. Applies from the next message.", error: false } : { text: body?.message ?? "Could not save.", error: true });
    if (ok) setData((d) => d && ({ ...d, tiers: body.tiers, escalation: body.escalation }));
  }
  const input = (value: string | number | null | undefined, onChange: (v: string) => void, w = "100%") => <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={{ width: w, height: 30, border: `1px solid ${C.borderControl}`, borderRadius: 7, padding: "0 8px", ...mono({ fontSize: 12 }) }} />;
  const pick = (value: string, onChange: (v: string) => void) => <select value={value} onChange={(e) => onChange(e.target.value)} style={{ height: 30, border: `1px solid ${C.borderControl}`, borderRadius: 7, fontFamily: "inherit", fontSize: 12.5 }}>{["fast", "standard", "reasoning"].map((t) => <option key={t} value={t}>{t}</option>)}</select>;
  return (
    <section aria-label="Routing" style={{ ...card, gridColumn: "1 / -1" }}>
      <div style={{ padding: "14px 18px 4px", display: "flex", alignItems: "center", gap: 10 }}><Eyebrow>Routing — which model answers</Eyebrow><span style={{ flex: 1 }} /><span style={{ fontSize: 12, color: C.muted }}>Applies on the next message; no deploy.</span></div>
      <div style={{ padding: "8px 18px 16px", display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 6, alignItems: "center", fontSize: 12.5 }}>
          <span style={{ color: C.faint, fontWeight: 700, fontSize: 11 }}>TIER</span><span style={{ color: C.faint, fontWeight: 700, fontSize: 11 }}>MODEL ID</span><span style={{ color: C.faint, fontWeight: 700, fontSize: 11 }}>FALLBACK (used if unavailable)</span>
          {tiers.map((t) => [<span key={`${t}-l`} style={{ fontWeight: 600 }}>{t}</span>, <span key={`${t}-a`}>{input(draft.tiers[t]?.id, (v) => setTier(t, "id", v))}</span>, <span key={`${t}-b`}>{input(draft.tiers[t]?.fallbackId, (v) => setTier(t, "fallbackId", v))}</span>])}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
          <span style={{ fontWeight: 700 }}>Escalation (one-way: never lowers a tier)</span>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>Router confidence below {input(draft.escalation.lowConfidenceBelow, (v) => setEsc("lowConfidenceBelow", Number(v)), "60px")} → one tier up</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>More than {input(draft.escalation.maxToolsBeforeEscalate, (v) => setEsc("maxToolsBeforeEscalate", Number(v)), "60px")} tools in a turn → one tier up</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>Approved (authoritative) text → at least {pick(draft.escalation.authoritativeFloor, (v) => setEsc("authoritativeFloor", v))}</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>Conflicting sources → {pick(draft.escalation.conflictTo, (v) => setEsc("conflictTo", v))}</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>User asks for care → {pick(draft.escalation.careTo, (v) => setEsc("careTo", v))}</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.escalation.retryOnFailure} onChange={(e) => setEsc("retryOnFailure", e.target.checked)} /> Retry a failed first attempt one tier up</label>
        </div>
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, borderTop: `1px solid ${C.divider}`, paddingTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, flex: 1 }}><input type="checkbox" checked={lockAll} onChange={async (e) => { setLockAll(e.target.checked); await api("/api/settings/skip-confirm-lock", { method: "PUT", body: JSON.stringify({ all: e.target.checked }) }); }} /> Lock “Skip confirmation for low-risk actions” off for everyone</label>
          {msg && <span role="status" style={{ fontSize: 12.5, color: msg.error ? C.danger : C.ok }}>{msg.text}</span>}
          <Button variant="primary" size="sm" onClick={() => void save()}>Save routing</Button>
        </div>
      </div>
    </section>
  );
}
