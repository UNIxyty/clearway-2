"use client";

// Agent settings, two of its tabs (portal redesign, stage 3 — "Page Agent Settings"):
//  - Your preferences (every agent user): default model tier, and "Skip confirmation for low-risk actions"
//    (off by default; lists exactly which actions qualify and which always confirm; shows an admin lock).
//  - Model tiers (admins): the tier → model mapping and the escalation rules, saved to the organisation's
//    settings and applied on the next turn — no deploy. Edits collect in a draft; a save bar counts them and
//    offers Discard / Save routing. The skip-confirmation lock (turn it off for everyone) saves at once.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AGENT_BASE } from "../types";
import { Button, Card, Checkbox, Select, Segmented, SkeletonRows, TextInput, Toggle } from "@/components/kit";
import { apiMessage } from "../ui/errorText";

type Prefs = { defaultTier: string | null; skipConfirm: boolean; skipConfirmRequested: boolean; skipLocked: boolean; skipLockedForAll: boolean };
type Catalogue = { qualified: { tool: string; why: string }[]; alwaysConfirm: { tool: string; why: string }[] };
type TierCfg = { id: string | null; fallbackId: string | null; source?: string };
type Escalation = { lowConfidenceBelow: number; maxToolsBeforeEscalate: number; authoritativeFloor: string; conflictTo: string; careTo: string; retryOnFailure: boolean };
export type Routing = { tiers: Record<string, TierCfg>; escalation: Escalation; canEdit: boolean };

export async function agentApi(path: string, init: RequestInit = {}) {
  const r = await fetch(`${AGENT_BASE}${path}`, { credentials: "same-origin", cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } }).catch(() => null);
  const b = r ? await r.json().catch(() => null) : null;
  return { ok: Boolean(r?.ok && b?.ok !== false), status: r?.status ?? 0, body: b };
}

/** One setting: what it is on the left, its control on the right. */
export function SettingRow({ title, hint, children, last = false }: { title: ReactNode; hint?: ReactNode; children?: ReactNode; last?: boolean }) {
  return (
    <div className={`grid items-center gap-x-5 gap-y-3 px-5 py-[18px] md:grid-cols-[minmax(0,1fr)_auto] ${last ? "" : "border-b border-cw-divider"}`}>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-cw-text">{title}</div>
        {hint && <div className="mt-0.5 max-w-[520px] text-[13px] leading-normal text-cw-text-muted">{hint}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

const TIERS = [{ value: "auto", label: "Automatic" }, { value: "fast", label: "Fast · Haiku" }, { value: "standard", label: "Standard · Sonnet" }, { value: "reasoning", label: "Reasoning · Opus" }];

export function PersonalSettings() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  useEffect(() => { void agentApi("/api/settings/me").then(({ ok, body }) => { if (ok) { setPrefs(body.prefs); setCat(body.lowRiskActions); } else setMsg(apiMessage(body, "Couldn't load your preferences. Try again.")); }); }, []);
  async function save(patch: Record<string, unknown>) {
    setMsg(null);
    const { ok, body } = await agentApi("/api/settings/me", { method: "PATCH", body: JSON.stringify(patch) });
    if (ok) setPrefs(body.prefs); else setMsg(apiMessage(body, "Couldn't save. Try again."));
  }
  return (
    <Card title="Your preferences" description="Only affect you." padded={false}>
      {!prefs ? (msg ? <p role="alert" className="m-0 p-5 text-[13px] text-cw-danger-text">{msg}</p> : <SkeletonRows rows={2} avatar={false} label="Loading your preferences" />) : (
        <>
          <SettingRow title="Default model" hint={<>Automatic lets the router choose per request. A fixed tier is a floor — the agent may still escalate a turn, never lower it. Type <span className="font-mono text-[12.5px]">/model reasoning</span> to choose for one turn.</>}>
            <Segmented label="Default model" size="sm" value={prefs.defaultTier ?? "auto"} onChange={(v) => void save({ defaultTier: v === "auto" ? null : v })} options={TIERS} />
          </SettingRow>
          <SettingRow last title="Skip confirmation for low-risk actions" hint={<>
            Off by default. Only actions that can be undone run without a card; each is logged as auto-confirmed, with Undo in the reply. Voice never skips a confirmation.
            {prefs.skipLocked && <strong className="font-semibold text-cw-warning-text"> {prefs.skipLockedForAll ? "An admin has turned this off for everyone." : "An admin has turned this off for your account."}</strong>}
            {cat && <> <button type="button" onClick={() => setShowActions((s) => !s)} aria-expanded={showActions} className="cursor-pointer rounded-[4px] border-none bg-transparent p-0 font-sans text-[13px] font-semibold text-cw-text-link outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">{showActions ? "Hide the list" : "Which actions qualify"}</button></>}
          </>}>
            <Toggle checked={prefs.skipConfirm} disabled={prefs.skipLocked} ariaLabel="Skip confirmation for low-risk actions" onChange={(next) => void save({ skipConfirm: next })} />
          </SettingRow>
          {cat && showActions && (
            <div className="grid gap-5 border-t border-cw-divider bg-cw-bg-sunken px-5 py-4 text-[12.5px] md:grid-cols-2">
              {([["May skip (can be undone)", cat.qualified], ["Always confirms", cat.alwaysConfirm]] as const).map(([h, list]) => (
                <div key={h}><div className="mb-1.5 font-bold text-cw-text">{h}</div>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{list.map((q) => <li key={q.tool}><span className="font-mono text-[12px] text-cw-text">{q.tool}</span><br /><span className="text-cw-text-muted">{q.why}</span></li>)}</ul>
                </div>
              ))}
            </div>
          )}
          {msg && <p role="alert" className="m-0 border-t border-cw-divider px-5 py-3 text-[13px] text-cw-danger-text">{msg}</p>}
        </>
      )}
    </Card>
  );
}

const TIER_ROWS = ["router", "fast", "standard", "reasoning", "embeddings", "rerank"];
const LEVELS = ["fast", "standard", "reasoning"].map((t) => ({ value: t, label: t }));

export function RoutingSettings({ routing, onSaved }: { routing: Routing; onSaved: (r: Routing) => void }) {
  const base = useMemo(() => ({ tiers: routing.tiers, escalation: routing.escalation }), [routing]);
  const [draft, setDraft] = useState(base);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [lockAll, setLockAll] = useState(false);
  useEffect(() => setDraft(base), [base]);
  const setTier = (t: string, k: "id" | "fallbackId", v: string) => setDraft((d) => ({ ...d, tiers: { ...d.tiers, [t]: { ...d.tiers[t], [k]: v } } }));
  const setEsc = (k: keyof Escalation, v: unknown) => setDraft((d) => ({ ...d, escalation: { ...d.escalation, [k]: v } }));
  // What differs from what is saved: one count per changed field.
  const changed = new Set<string>();
  for (const t of TIER_ROWS) for (const k of ["id", "fallbackId"] as const) if ((draft.tiers[t]?.[k] ?? "") !== (base.tiers[t]?.[k] ?? "")) changed.add(`${t}.${k}`);
  for (const k of Object.keys(draft.escalation) as Array<keyof Escalation>) if (String(draft.escalation[k]) !== String(base.escalation[k])) changed.add(`esc.${k}`);
  const dirty = changed.size;

  async function save() {
    setMsg(null); setSaving(true);
    const { ok, body } = await agentApi("/api/settings/routing", { method: "PUT", body: JSON.stringify({ tiers: Object.fromEntries(TIER_ROWS.map((t) => [t, { id: draft.tiers[t]?.id || null, fallbackId: draft.tiers[t]?.fallbackId || null }])), escalation: draft.escalation }) });
    setSaving(false);
    if (ok) { onSaved({ ...routing, tiers: body.tiers, escalation: body.escalation }); setMsg({ text: "Saved. Applies from the next message.", error: false }); }
    else setMsg({ text: apiMessage(body, "Couldn't save. Try again."), error: true });
  }
  const field = (t: string, k: "id" | "fallbackId", label: string) => {
    const diff = changed.has(`${t}.${k}`);
    return <TextInput mono aria-label={label} value={draft.tiers[t]?.[k] ?? ""} placeholder={k === "id" ? (t === "rerank" ? "Not set — reranking off" : "Not set") : "None"} onChange={(e) => setTier(t, k, e.target.value)}
      className={`!h-[34px] !text-[12.5px] ${diff ? "!border-cw-diff-border !bg-cw-diff-tint" : ""}`} />;
  };
  const num = (k: "lowConfidenceBelow" | "maxToolsBeforeEscalate", label: string) => (
    <span className="w-16"><TextInput mono aria-label={label} inputMode="decimal" value={String(draft.escalation[k])} onChange={(e) => setEsc(k, Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
      className={`!h-8 text-center !text-[13px] ${changed.has(`esc.${k}`) ? "!border-cw-diff-border !bg-cw-diff-tint" : ""}`} /></span>
  );
  const pick = (k: "authoritativeFloor" | "conflictTo" | "careTo", label: string) => <span className="w-[130px]"><Select size="sm" label={label} value={draft.escalation[k]} onChange={(v) => setEsc(k, v)} options={LEVELS} /></span>;

  return (
    <>
      <Card title="Model tiers" description="Which model answers at each tier, and what to use when it is unavailable. Applies on the next message; no deploy." padded={false}>
        <div role="table" aria-label="Model tiers">
          <div role="row" className="grid h-8 grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b border-cw-border bg-cw-bg-sunken px-5 text-[11px] font-bold uppercase tracking-[0.06em] text-cw-text-muted">
            <span role="columnheader">Tier</span><span role="columnheader">Model ID</span><span role="columnheader">Fallback, if it is unavailable</span>
          </div>
          {TIER_ROWS.map((t) => (
            <div role="row" key={t} className="grid min-h-[52px] grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b border-cw-divider px-5 last:border-b-0">
              <span role="cell" className="text-[14px] font-semibold text-cw-text">{t}</span>
              <span role="cell">{field(t, "id", `${t} model ID`)}</span>
              <span role="cell">{field(t, "fallbackId", `${t} fallback model ID`)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Escalation" description="One-way: a turn can move up a tier, never down." padded={false}>
        <div className="flex flex-col text-[14px] text-cw-text">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-cw-divider px-5 py-3">Router confidence below {num("lowConfidenceBelow", "Router confidence threshold")} <span className="text-cw-text-muted">→ one tier up</span></div>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-cw-divider px-5 py-3">More than {num("maxToolsBeforeEscalate", "Tools before escalating")} <span className="text-cw-text-muted">tools in a turn → one tier up</span></div>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-cw-divider px-5 py-3">Approved (authoritative) text → at least {pick("authoritativeFloor", "Tier for approved text")}</div>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-cw-divider px-5 py-3">Conflicting sources → {pick("conflictTo", "Tier for conflicting sources")}</div>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-cw-divider px-5 py-3">User asks for care → {pick("careTo", "Tier when the user asks for care")}</div>
          <div className="flex flex-col gap-3 px-5 py-3.5">
            <Checkbox checked={draft.escalation.retryOnFailure} onChange={(on) => setEsc("retryOnFailure", on)} label="Retry a failed first attempt one tier up" />
            <Checkbox checked={lockAll} onChange={async (on) => { setLockAll(on); await agentApi("/api/settings/skip-confirm-lock", { method: "PUT", body: JSON.stringify({ all: on }) }); }}
              label="Lock “Skip confirmation for low-risk actions” off for everyone" hint="Saves at once." />
          </div>
        </div>
      </Card>
      {(dirty > 0 || msg) && (
        <div role="status" className="sticky bottom-4 z-[4] flex flex-wrap items-center gap-2.5 rounded-[12px] border border-cw-border bg-cw-bg-raised py-2.5 pl-4 pr-3 shadow-cw-pop">
          {dirty > 0 ? <><span aria-hidden className="h-2 w-2 rounded-full bg-cw-diff" /><span className="flex-1 text-[14px] font-semibold text-cw-text">{dirty} unsaved {dirty === 1 ? "change" : "changes"}</span></>
            : <span className={`flex-1 text-[13.5px] ${msg?.error ? "text-cw-danger-text" : "text-cw-success-text"}`}>{msg?.text}</span>}
          {dirty > 0 && msg?.error && <span className="text-[13px] text-cw-danger-text">{msg.text}</span>}
          {dirty > 0 && <><Button variant="quiet" size="sm" onClick={() => { setDraft(base); setMsg(null); }}>Discard</Button><Button variant="primary" size="sm" loading={saving} loadingLabel="Saving…" onClick={() => void save()}>Save routing</Button></>}
        </div>
      )}
    </>
  );
}
