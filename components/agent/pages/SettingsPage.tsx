"use client";

// Ops Agent → Settings (portal redesign, stage 3 — "Page Agent Settings"; design spec §12): five tabs, split by who a
// setting affects. Your preferences (only you) · Model tiers · Capabilities (and the keyboard shortcuts, which apply to
// everyone) · Access & sites · Flight intake — the last four are the organisation's, for admins. A tab shows only when
// the agent says this person may see it. This month's usage sits in the page header. ?tab=<id> opens a tab.
// There is no "don't ask" mode: the write switch removes the capability; confirmation is not configurable.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import MaskIcon from "@/components/portal/Icon";
import { Button, Card, ErrorState, SkeletonRows, Toggle } from "@/components/kit";
import { Keycap } from "../ui/primitives";
import { PersonalSettings, RoutingSettings, SettingRow, agentApi, type Routing } from "./SettingsPersonal";
import { BIND_DEFAULTS, bindFromEvent, label as bindLabel, platform, publishKeybinds, type BindAction, type KeybindConfig, type Platform } from "../ui/keybinds";
import AgentStyles from "../ui/AgentStyles";
import IntakeSettingsCard from "../intake/IntakeSettingsCard";
import { apiMessage } from "../ui/errorText";

type Capability = { key: string; label: string; description: string; enabled: boolean };
type Person = { userId: string; email: string; name: string; read: string; wall: string; sendEmail: string; approveKb: string };
type BindActionRow = { key: BindAction; label: string; description: string };
type SiteCounts = { approved: number; pending: number };
type Usage = { month: string; spendEur: number; capEur: number; replies: number; toolCalls: number; heaviest: { email: string; eur: number } | null; model: string | null; voice: boolean };
type TabId = "prefs" | "models" | "caps" | "access" | "intake";

const TABS: Array<{ id: TabId; label: string; icon: string; admin: boolean }> = [
  { id: "prefs", label: "Your preferences", icon: "user", admin: false },
  { id: "models", label: "Model tiers", icon: "cpu", admin: true },
  { id: "caps", label: "Capabilities", icon: "toggle-right", admin: true },
  { id: "access", label: "Access & sites", icon: "shield", admin: true },
  { id: "intake", label: "Flight intake", icon: "plane-landing", admin: true },
];
const CAP_ICON: Record<string, string> = { web: "globe", webSearch: "globe", voice: "mic", write: "pencil", writes: "pencil", sendEmail: "send", email: "send", autoApprove: "file-check", highKnowledge: "brain", reasoning: "brain" };
const capIcon = (key: string) => CAP_ICON[key] ?? (/voice/i.test(key) ? "mic" : /web|search/i.test(key) ? "globe" : /mail/i.test(key) ? "send" : /write/i.test(key) ? "pencil" : /approv/i.test(key) ? "file-check" : /model|reason|knowledge/i.test(key) ? "brain" : "toggle-right");
const eur = (n: number) => `€${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const initialsOf = (s: string) => s.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
const ACCESS = {
  yes: { icon: "check", text: "Yes", cls: "text-cw-success-text" },
  ask: { icon: "hand", text: "Asks", cls: "text-cw-warning-text" },
  no: { icon: "minus", text: "No", cls: "text-cw-text-muted" },
} as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("prefs");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [caps, setCaps] = useState<Capability[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [sites, setSites] = useState<SiteCounts | null>(null);
  const [routing, setRouting] = useState<Routing | null>(null);
  const [intake, setIntake] = useState(false);
  const [binds, setBinds] = useState<KeybindConfig | null>(null);
  const [bindActions, setBindActions] = useState<BindActionRow[]>([]);
  const [bindError, setBindError] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("tab");
    if (want && TABS.some((t) => t.id === want)) setTab(want as TabId);
  }, []);
  const pickTab = (id: TabId) => {
    setTab(id);
    const u = new URL(window.location.href); u.searchParams.set("tab", id); window.history.replaceState(null, "", u);
  };

  const load = useCallback(async () => {
    setState("loading");
    const [s, p, u, x, r, i] = await Promise.all([agentApi("/api/settings"), agentApi("/api/settings/permissions"), agentApi("/api/usage"), agentApi("/api/extension/sites/admin"), agentApi("/api/settings/routing"), agentApi("/api/intake/settings")]);
    // Organisation settings are optional for this person: each part shows when the agent answers it, and is left out on 401/403.
    if (s.status !== 401 && s.status !== 403 && !s.ok) { setLoadError(apiMessage(s.body, s.status ? "The agent did not answer. Try again in a few minutes." : "The agent could not be reached. Check your connection and try again.")); setState("error"); return; }
    if (s.ok) { setCaps(s.body.capabilities); setCanEdit(Boolean(s.body.canEdit)); if (s.body.keybinds) setBinds(s.body.keybinds); if (s.body.keybindActions) setBindActions(s.body.keybindActions); }
    setPeople(p.ok ? p.body.people : null);
    setUsage(u.ok ? u.body.usage : null);
    setSites(x.ok ? { approved: (x.body.approved ?? []).length, pending: (x.body.requests ?? []).filter((q: { status: string }) => q.status === "pending").length } : null);
    setRouting(r.ok && r.body?.canEdit ? r.body : null);
    setIntake(i.ok);
    setState("ready");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(cap: Capability, next: boolean) {
    if (!canEdit || saving) return;
    setSaving(cap.key); setCapError(null);
    const prev = caps;
    setCaps((list) => (list ?? []).map((c) => (c.key === cap.key ? { ...c, enabled: next } : c)));
    const { ok, body } = await agentApi("/api/settings", { method: "PATCH", body: JSON.stringify({ key: cap.key, enabled: next }) });
    if (!ok) { setCaps(prev); setCapError(apiMessage(body, `Couldn't change “${cap.label}”. Try again.`)); } else setCaps(body.capabilities);
    setSaving(null);
  }
  async function saveBinds(next: KeybindConfig) {
    if (!canEdit) return;
    const prev = binds; setBinds(next); setBindError(null);
    const { ok, body } = await agentApi("/api/settings", { method: "PATCH", body: JSON.stringify({ keybinds: next }) });
    if (!ok) { setBinds(prev); setBindError(apiMessage(body, "That shortcut couldn't be saved. Try again.")); } else { setBinds(body.keybinds); publishKeybinds(body.keybinds); }
  }

  const visible = TABS.filter((t) => t.id === "prefs" || (t.id === "models" && routing) || (t.id === "caps" && (caps || binds)) || (t.id === "access" && (people || sites)) || (t.id === "intake" && intake));
  const current = visible.some((t) => t.id === tab) ? tab : "prefs";
  const pct = usage ? Math.min(100, Math.round((usage.spendEur / Math.max(usage.capEur, 0.01)) * 100)) : 0;

  return (
    <PortalShell crumb="Ops Agent" title="Agent settings" subtitle="Your own preferences, and organisation settings for Admins."
      headerRight={usage ? (
        <div aria-label="Usage this month" className="flex flex-wrap items-center gap-3.5 rounded-[12px] border border-cw-border bg-cw-bg-surface px-3.5 py-2.5">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-cw-text-muted">{usage.month}</div>
            <div className="text-[15px] font-bold text-cw-text"><span className="font-mono">{eur(usage.spendEur)}</span> <span className="text-[12.5px] font-normal text-cw-text-muted">of {eur(usage.capEur)} cap</span></div>
          </div>
          <span role="progressbar" aria-label="Spend against the cap" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="block h-1.5 w-[120px] overflow-hidden rounded-sm bg-cw-bg-active"><span className={`block h-full ${pct >= 100 ? "bg-cw-danger" : "bg-cw-primary"}`} style={{ width: `${Math.max(pct, 1)}%` }} /></span>
          <span className="text-[12.5px] text-cw-text-muted">{usage.replies.toLocaleString("en-GB")} replies · {usage.toolCalls.toLocaleString("en-GB")} tool calls</span>
        </div>
      ) : undefined}>
      <AgentStyles />
      <div className="grid items-start gap-6 min-[900px]:grid-cols-[220px_minmax(0,1fr)]" style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        <div role="tablist" aria-label="Settings" aria-orientation="vertical" className="flex flex-wrap gap-0.5 min-[900px]:sticky min-[900px]:top-[calc(var(--cw-topbar)+28px)] min-[900px]:flex-col">
          {visible.map((t) => {
            const on = t.id === current;
            return (
              <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={on} aria-controls={`panel-${t.id}`} tabIndex={on ? 0 : -1} onClick={() => pickTab(t.id)}
                onKeyDown={(e) => { const i = visible.findIndex((v) => v.id === t.id); const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0; if (!d) return; e.preventDefault(); const n = visible[(i + d + visible.length) % visible.length]; pickTab(n.id); document.getElementById(`tab-${n.id}`)?.focus(); }}
                className={`flex h-9 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-[8px] border-none px-3 font-sans text-[14px] outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)] ${on ? "bg-cw-bg-active font-bold text-cw-text" : "bg-transparent font-medium text-cw-text-body hover:bg-cw-bg-hover"}`}>
                <MaskIcon name={t.icon} size={16} color={on ? "var(--cw-text-link)" : "var(--cw-text-muted)"} />
                <span className="flex-1 text-left">{t.label}</span>
                {t.admin && <span className="text-[10px] font-bold tracking-[0.06em] text-cw-text-muted">ADMIN</span>}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`} className="flex min-w-0 flex-col gap-5">
          {state === "loading" ? <Card padded={false}><SkeletonRows rows={5} avatar={false} label="Loading agent settings" /></Card>
            : state === "error" ? <Card padded={false}><ErrorState title="Couldn't load agent settings" detail={<>The agent keeps running with its last saved settings. <span className="font-mono">{loadError}</span></>} onRetry={() => void load()} /></Card>
            : current === "prefs" ? (
              <>
                <PersonalSettings />
                {!canEdit && <p className="m-0 text-[13px] text-cw-text-muted">Organisation settings — models, capabilities, access and flight intake — are for admins. Ask an admin if you need one changed.</p>}
              </>
            ) : current === "models" && routing ? <RoutingSettings routing={routing} onSaved={setRouting} />
            : current === "caps" ? (
              <>
                {caps && (
                  <Card title="Capabilities" description="Organisation-wide. Off removes the ability for everyone, whatever their role allows." padded={false}>
                    {caps.map((cap, i) => (
                      <div key={cap.key} className={`grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 px-5 py-4 ${i < caps.length - 1 ? "border-b border-cw-divider" : ""}`}>
                        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-cw-border bg-cw-bg-sunken"><MaskIcon name={capIcon(cap.key)} size={16} color="var(--cw-text-muted)" /></span>
                        <div className="min-w-0"><div className="text-[14px] font-semibold text-cw-text">{cap.label}</div><div className="mt-0.5 text-[13px] leading-normal text-cw-text-muted">{cap.description}</div></div>
                        <Toggle checked={cap.enabled} disabled={!canEdit || saving === cap.key} ariaLabel={cap.label} onChange={(next) => void toggle(cap, next)} />
                      </div>
                    ))}
                    {!canEdit && <p className="m-0 border-t border-cw-divider px-5 py-3 text-[13px] text-cw-text-muted">Read-only: only admins can change these.</p>}
                    {capError && <p role="alert" className="m-0 border-t border-cw-divider px-5 py-3 text-[13px] text-cw-danger-text">{capError}</p>}
                  </Card>
                )}
                {binds && (
                  <Card title="Keyboard shortcuts" description="For everyone in the organisation." padded={false}
                    actions={canEdit ? <Button variant="quiet" size="sm" onClick={() => void saveBinds({ ...binds, shared: { ...BIND_DEFAULTS }, mac: { ...BIND_DEFAULTS }, windows: { ...BIND_DEFAULTS } })}>Reset to defaults</Button> : undefined}>
                    <SettingRow title="Separate shortcuts for Mac and Windows" hint="Off: one set for everyone — ⌘ on a Mac stands for Ctrl on Windows. On: each platform has its own keys.">
                      <Toggle checked={binds.perPlatform} disabled={!canEdit} ariaLabel="Separate shortcuts for Mac and Windows" onChange={(on) => void saveBinds({ ...binds, perPlatform: on })} />
                    </SettingRow>
                    <div className={`grid h-8 items-center gap-4 border-b border-cw-border bg-cw-bg-sunken px-5 text-[11px] font-bold uppercase tracking-[0.06em] text-cw-text-muted ${binds.perPlatform ? "grid-cols-[minmax(0,1fr)_150px_150px]" : "grid-cols-[minmax(0,1fr)_170px]"}`}>
                      <span>Action</span>{binds.perPlatform ? <><span>Mac</span><span>Windows</span></> : <span>Shortcut</span>}
                    </div>
                    {(bindActions.length ? bindActions : (Object.keys(BIND_DEFAULTS) as BindAction[]).map((k) => ({ key: k, label: k, description: "" }))).map((a) => (
                      <div key={a.key} className={`grid min-h-14 items-center gap-4 border-b border-cw-divider px-5 py-2 ${binds.perPlatform ? "grid-cols-[minmax(0,1fr)_150px_150px]" : "grid-cols-[minmax(0,1fr)_170px]"}`}>
                        <div className="min-w-0"><div className="text-[14px] font-semibold text-cw-text">{a.label}</div><div className="text-[12.5px] text-cw-text-muted">{a.description}</div></div>
                        {binds.perPlatform
                          ? <><BindRecorder action={a.label} value={binds.mac[a.key]} os="mac" style="literal" disabled={!canEdit} onChange={(v) => void saveBinds({ ...binds, mac: { ...binds.mac, [a.key]: v } })} /><BindRecorder action={a.label} value={binds.windows[a.key]} os="windows" style="literal" disabled={!canEdit} onChange={(v) => void saveBinds({ ...binds, windows: { ...binds.windows, [a.key]: v } })} /></>
                          : <BindRecorder action={a.label} value={binds.shared[a.key]} os={platform()} style="mod" disabled={!canEdit} onChange={(v) => void saveBinds({ ...binds, shared: { ...binds.shared, [a.key]: v } })} />}
                      </div>
                    ))}
                    <p className="m-0 px-5 py-3 text-[12.5px] text-cw-text-muted">Esc always cancels or closes and can&apos;t be changed. A shortcut needs a modifier key.{bindError && <span role="alert" className="text-cw-danger-text"> {bindError}</span>}</p>
                  </Card>
                )}
              </>
            ) : current === "access" ? (
              <>
                {people && (
                  <Card title="Who can do what" description={<>The agent never has more access than the person asking. Roles are set in <a href="/admin/users" className="font-semibold text-cw-text-link no-underline">Admin → Users</a>.</>} padded={false}>
                    <div role="table" aria-label="Who can do what">
                      <div role="row" className="grid h-8 grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] items-center gap-3 border-b border-cw-border bg-cw-bg-sunken px-5 text-[11px] font-bold uppercase tracking-[0.06em] text-cw-text-muted">
                        {["Person", "Read", "Wall", "Email", "Approve KB"].map((h) => <span key={h} role="columnheader">{h}</span>)}
                      </div>
                      {people.map((p) => (
                        <div role="row" key={p.userId} className="grid min-h-12 grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] items-center gap-3 border-b border-cw-divider px-5 text-[13.5px]">
                          <span role="cell" className="flex min-w-0 items-center gap-2.5">
                            <span aria-hidden className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border border-cw-border bg-cw-bg-sunken text-[10.5px] font-bold text-cw-text-body">{initialsOf(p.name || p.email)}</span>
                            <span className="truncate font-mono text-[12.5px] text-cw-text" title={p.email}>{p.name && p.name !== p.email ? p.name : p.email}</span>
                          </span>
                          {[p.read, p.wall, p.sendEmail, p.approveKb].map((v, i) => { const a = ACCESS[v === "yes" ? "yes" : v === "ask" ? "ask" : "no"]; return <span role="cell" key={i} className={`flex items-center gap-1.5 text-[13px] font-semibold ${a.cls}`}><MaskIcon name={a.icon} size={14} />{a.text}</span>; })}
                        </div>
                      ))}
                      {people.length === 0 && <p className="m-0 px-5 py-3 text-[13px] text-cw-text-muted">No one has been granted the agent yet.</p>}
                    </div>
                    <div className="flex flex-wrap gap-4 px-5 py-3 text-[12.5px] text-cw-text-muted">
                      <span><strong className="font-semibold text-cw-text-body">Yes</strong> runs after a confirmation card</span>
                      <span><strong className="font-semibold text-cw-text-body">Asks</strong> drafts and waits for someone allowed</span>
                      <span><strong className="font-semibold text-cw-text-body">No</strong> refuses</span>
                    </div>
                  </Card>
                )}
                {sites && (
                  <section aria-label="Sites" className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-cw-border bg-cw-bg-surface px-5 py-4 shadow-cw-1">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-cw-border bg-cw-bg-sunken"><MaskIcon name="globe" size={16} color="var(--cw-text-muted)" /></span>
                    <div className="min-w-[220px] flex-1">
                      <div className="text-[14px] font-semibold text-cw-text">Chrome extension sites · <span className="font-mono">{sites.approved}</span> approved, <span className={`font-mono ${sites.pending ? "text-cw-warning-text" : ""}`}>{sites.pending}</span> waiting</div>
                      <div className="text-[13px] text-cw-text-muted">On an approved site the extension can read a selection or the page when someone sends it.</div>
                    </div>
                    <a href="/admin/agent-sites" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-cw-border-control bg-cw-bg-surface px-3 text-[13px] font-semibold text-cw-text no-underline outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">Manage sites<MaskIcon name="arrow-right" size={14} /></a>
                  </section>
                )}
                {usage && (
                  <p className="m-0 text-[13px] leading-normal text-cw-text-muted">
                    At the cap the agent stops replying and says so; the console is unaffected. Model: <span className="font-mono">{usage.model ?? "—"}</span> · voice {usage.voice ? "on" : "off"}.{usage.heaviest ? <> Heaviest user this month: <span className="font-mono">{usage.heaviest.email}</span>, {eur(usage.heaviest.eur)}.</> : null}
                  </p>
                )}
              </>
            ) : current === "intake" ? <IntakeSettingsCard /> : null}
        </div>
      </div>
    </PortalShell>
  );
}

/** Click, press the keys, done. Listens on the window while recording (the button need not keep focus); a bare key gets a hint, Esc cancels. */
function BindRecorder({ action, value, os, style, disabled, onChange }: { action: string; value: string; os: Platform; style: "mod" | "literal"; disabled?: boolean; onChange: (bind: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setRecording(false); setNote(null); return; }
      if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return; // wait for the key that completes the chord
      const next = bindFromEvent(e, style, os);
      if (!next) { setNote(os === "mac" ? "Add ⌘, ⌃ or ⌥ to that key" : "Add Ctrl, Alt or Win to that key"); return; }
      onChange(next); setRecording(false); setNote(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, style, os, onChange]);
  if (disabled) return <span className="flex h-8 items-center justify-center rounded-[8px] border border-cw-border bg-cw-bg-sunken font-mono text-[12.5px] text-cw-text-body"><Keycap standalone>{bindLabel(value, os)}</Keycap></span>;
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" aria-label={`Change the shortcut for ${action} (${os === "mac" ? "Mac" : os === "windows" ? "Windows" : "all"})`} onClick={() => { setRecording((r) => !r); setNote(null); }}
        className={`flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border px-2.5 font-sans text-[12.5px] outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)] ${recording ? "border-cw-primary bg-cw-primary-tint shadow-[0_0_0_3px_var(--cw-focus-halo)]" : "border-cw-border-control bg-cw-bg-surface hover:bg-cw-bg-hover"}`}>
        {recording ? <span className="font-semibold text-cw-text-link">Press keys…</span> : <Keycap standalone>{bindLabel(value, os)}</Keycap>}
      </button>
      {recording && <span className={`text-[11px] ${note ? "text-cw-warning-text" : "text-cw-text-muted"}`}>{note ?? "Esc cancels"}</span>}
    </span>
  );
}
