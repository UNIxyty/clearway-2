"use client";

// Admin → Permissions: what each role may do (docs/permissions.md). Actions down, roles across, grouped as in
// lib/permissions/catalogue.mjs. Every click is one change on the server, logged with who and when; the server refuses
// anything that would lock everyone out. Built from the existing portal pieces; it will be redesigned with the rest.
import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import MaskIcon from "@/components/portal/Icon";
import { PButton, PCard, PChip, PMono } from "@/components/portal/ui";

type Action = { key: string; label: string; default?: string[]; hard?: string; requires?: string; auto?: boolean; read?: boolean };
type Group = { key: string; label: string; service: string; actions: Action[] };
type Cell = { allowed: boolean | null; default: boolean; pinned: boolean; at: string | null; by: string | null };
type LogRow = { id: number; at: string; actor_email: string | null; role: string; action: string; allowed: boolean; previous: boolean | null; via: string };
type State = { roles: string[]; roleLabels: Record<string, string>; groups: Group[]; manage: string; grants: Record<string, Record<string, Cell>>; log: LogRow[]; me: { email: string | null; role: string } };
type Change = { role: string; action: string; allowed: boolean };

const SERVICE_LABEL: Record<string, string> = { portal: "Portal", agent: "OPS agent & intake", wall: "Digital Wall console" };
const on = (c: Cell | undefined) => c?.allowed === true || c?.pinned === true;
const drifted = (c: Cell | undefined) => !!c && !c.pinned && (c.allowed ?? false) !== c.default;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function PermissionsPage() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ title: string; items: { label: string; hard: string }[]; changes: Change[] } | null>(null);
  const [logQ, setLogQ] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/permissions", { cache: "no-store" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { setError(body.error || `Could not load permissions (${r.status}).`); return; }
    setState(body); setError(null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const actionsByKey = useMemo(() => new Map((state?.groups ?? []).flatMap((g) => g.actions.map((a) => [a.key, a] as const))), [state]);
  const driftCount = useMemo(() => {
    if (!state) return 0;
    let n = 0;
    for (const role of state.roles) for (const a of actionsByKey.keys()) if (drifted(state.grants[role]?.[a])) n += 1;
    return n;
  }, [state, actionsByKey]);

  // A cell the server would refuse to switch off, and why (shown, and the box is disabled).
  function lockedOff(role: string, action: string): string | null {
    if (!state) return null;
    const c = state.grants[role]?.[action];
    if (c?.pinned) return `${state.roleLabels[role]} always keeps this — it is how anyone gets back in.`;
    if (action === state.manage && role === state.me.role && on(c)) return "You cannot take this away from your own role.";
    return null;
  }

  async function send(changes: Change[]) {
    if (!changes.length) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/permissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setError(body.error || `Not saved (${r.status}).`); return; }
      setState((s) => (s ? { ...s, grants: body.grants ?? s.grants, log: body.log ?? s.log } : s));
    } finally { setBusy(false); }
  }

  // Granting something hard to undo is confirmed first, with what it does.
  function request(changes: Change[], title: string) {
    const hard = changes.filter((c) => c.allowed && actionsByKey.get(c.action)?.hard).map((c) => ({ label: `${actionsByKey.get(c.action)!.label} → ${state!.roleLabels[c.role]}`, hard: actionsByKey.get(c.action)!.hard! }));
    if (hard.length) setConfirm({ title, items: hard, changes });
    else void send(changes);
  }

  function toggleCell(role: string, action: Action) {
    const c = state!.grants[role]?.[action.key];
    const next = !on(c);
    if (!next && lockedOff(role, action.key)) return;
    request([{ role, action: action.key, allowed: next }], `Grant “${action.label}” to ${state!.roleLabels[role]}?`);
  }

  function toggleGroup(role: string, group: Group) {
    const allOn = group.actions.every((a) => on(state!.grants[role]?.[a.key]));
    const next = !allOn;
    const changes = group.actions
      .filter((a) => on(state!.grants[role]?.[a.key]) !== next)
      .filter((a) => next || !lockedOff(role, a.key))
      .map((a) => ({ role, action: a.key, allowed: next }));
    request(changes, `Grant everything in ${group.label} to ${state!.roleLabels[role]}?`);
  }

  const match = (a: Action) => !q.trim() || `${a.label} ${a.key}`.toLowerCase().includes(q.trim().toLowerCase());
  const visible = (a: Action) => match(a) && (!onlyChanged || state!.roles.some((r) => drifted(state!.grants[r]?.[a.key])));

  return (
    <PortalShell title="Permissions" crumb="/admin/permissions" subtitle="What each role may do, across the portal, the OPS agent, flight intake and the wall console.">
      <div className="space-y-5 px-8 py-6">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!state ? (
          !error && <p className="text-sm text-cw-muted">Loading…</p>
        ) : (
          <>
            <PCard className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 text-sm">
              <span>You are <b>{state.roleLabels[state.me.role] ?? state.me.role}</b>{state.me.email ? <> · <PMono>{state.me.email}</PMono></> : null}</span>
              <span className={driftCount ? "font-semibold text-amber-700" : "text-cw-muted"}>
                {driftCount ? `${driftCount} cell${driftCount === 1 ? "" : "s"} changed from the defaults` : "Exactly the defaults"}
              </span>
              <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Show only what changed</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an action…" aria-label="Find an action" className="ml-auto h-9 w-64 rounded-lg border border-[#d6d8dc] px-3 text-sm" />
              <span className="basis-full text-[12.5px] leading-relaxed text-cw-muted">
                Each change takes effect within 10 seconds and is logged below with your name. Every server checks these
                permissions itself; hiding a button is not what stops anyone. Changed cells are tinted, with the default
                beside them. <MaskIcon name="triangle-alert" size={12} color="#b45309" /> marks what is hard to undo.
              </span>
            </PCard>

            {(["portal", "agent", "wall"] as const).map((service) => {
              const groups = state.groups.filter((g) => g.service === service && g.actions.some(visible));
              if (!groups.length) return null;
              return (
                <PCard key={service} className="overflow-x-auto p-0">
                  <table className="w-full min-w-[760px] border-collapse text-sm" aria-label={`Permissions — ${SERVICE_LABEL[service]}`}>
                    <thead>
                      <tr className="border-b border-[#eceef1] bg-[#fafbfc] text-left">
                        <th className="px-5 py-3 text-[13px] font-bold">{SERVICE_LABEL[service]}</th>
                        {state.roles.map((r) => <th key={r} className="w-28 px-2 py-3 text-center text-[12px] font-semibold uppercase tracking-wide text-cw-muted">{state.roleLabels[r]}</th>)}
                      </tr>
                    </thead>
                    {groups.map((g) => (
                      <tbody key={g.key} aria-label={g.label}>
                        <tr className="border-t border-[#eceef1] bg-[#f6f7f9]">
                          <td className="px-5 py-2 text-[12.5px] font-bold uppercase tracking-wide text-[#475569]">{g.label}</td>
                          {state.roles.map((r) => {
                            const n = g.actions.filter((a) => on(state.grants[r]?.[a.key])).length;
                            const all = n === g.actions.length;
                            return (
                              <td key={r} className="px-2 py-2 text-center">
                                <button type="button" disabled={busy} onClick={() => toggleGroup(r, g)} aria-label={`${all ? "Take away" : "Grant"} everything in ${g.label} for ${state.roleLabels[r]}`}
                                  className="rounded-md border border-[#d6d8dc] bg-white px-2 py-[3px] text-[11.5px] font-semibold text-[#334155] hover:bg-[#eef4ff] disabled:opacity-50">
                                  {all ? "All" : n ? `${n}/${g.actions.length}` : "None"}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                        {g.actions.filter(visible).map((a) => (
                          <tr key={a.key} className="border-t border-[#f1f2f4] align-top">
                            <td className="px-5 py-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-[#1f2329]">{a.label}</span>
                                {state.roles.some((r) => state.grants[r]?.[a.key]?.allowed === null && !state.grants[r]?.[a.key]?.pinned) && <PChip color="#7c3aed" bg="#f3e8ff">new — off until granted</PChip>}
                                {a.auto && <PChip color="#475569" bg="#eef1f5">automatic</PChip>}
                                {a.read && <PChip color="#475569" bg="#eef1f5">a view, not a change</PChip>}
                              </div>
                              {a.hard && <div className="mt-1 flex gap-1.5 text-[12.5px] leading-snug text-amber-800"><span className="mt-[2px] flex-none"><MaskIcon name="triangle-alert" size={12} color="#b45309" /></span><span><b>Hard to undo.</b> {a.hard}</span></div>}
                              {a.requires && <div className="mt-1 text-[12px] text-cw-muted">Only takes effect for a role that also has “{actionsByKey.get(a.requires)?.label}”.</div>}
                              <PMono className="mt-0.5 block text-[11px] text-cw-faint">{a.key}</PMono>
                            </td>
                            {state.roles.map((r) => {
                              const c = state.grants[r]?.[a.key];
                              const lock = on(c) ? lockedOff(r, a.key) : null;
                              const changed = drifted(c);
                              const title = [lock, changed ? `Changed from the default (${c!.default ? "on" : "off"})` : null, c?.by && c.by !== "default (seed)" ? `Last set by ${c.by}, ${fmt(c.at)}` : null].filter(Boolean).join(" · ");
                              return (
                                <td key={r} className="px-2 py-2.5 text-center" style={changed ? { background: "#fff7e6" } : undefined} title={title || undefined}>
                                  <label className="inline-flex cursor-pointer items-center gap-1">
                                    <input type="checkbox" checked={on(c)} disabled={busy || !!lock} onChange={() => toggleCell(r, a)}
                                      aria-label={`${a.label} — ${state.roleLabels[r]}`} className="h-4 w-4 accent-[#2563eb]" />
                                    {c?.pinned && <MaskIcon name="lock" size={11} color="#64748b" />}
                                  </label>
                                  {changed && <div className="text-[10.5px] leading-tight text-amber-700">default {c!.default ? "on" : "off"}</div>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </table>
                </PCard>
              );
            })}

            <PCard className="p-0">
              <div className="flex flex-wrap items-center gap-3 border-b border-[#eceef1] px-5 py-3">
                <MaskIcon name="history" size={15} color="#475569" />
                <span className="font-bold">History</span>
                <span className="text-[12.5px] text-cw-muted">Every change, newest first. Nobody can edit or delete a row.</span>
                <input value={logQ} onChange={(e) => setLogQ(e.target.value)} placeholder="Filter by person, role or action…" aria-label="Filter the history" className="ml-auto h-8 w-64 rounded-lg border border-[#d6d8dc] px-3 text-sm" />
              </div>
              {state.log.length === 0 ? (
                <p className="px-5 py-4 text-sm text-cw-muted">No changes yet: every role has exactly the defaults it started with.</p>
              ) : (
                <table className="w-full text-sm" aria-label="Permission history">
                  <tbody>
                    {state.log.filter((l) => !logQ.trim() || `${l.actor_email} ${l.role} ${l.action} ${actionsByKey.get(l.action)?.label ?? ""}`.toLowerCase().includes(logQ.trim().toLowerCase())).slice(0, 300).map((l) => (
                      <tr key={l.id} className="border-t border-[#f1f2f4]">
                        <td className="whitespace-nowrap px-5 py-2 text-cw-muted">{fmt(l.at)}</td>
                        <td className="px-2 py-2">{l.actor_email ?? "—"}{l.via !== "screen" ? <span className="text-cw-muted"> ({l.via})</span> : null}</td>
                        <td className="px-2 py-2"><b className={l.allowed ? "text-green-700" : "text-red-700"}>{l.allowed ? "granted" : "took away"}</b></td>
                        <td className="px-2 py-2">{actionsByKey.get(l.action)?.label ?? l.action}</td>
                        <td className="px-2 py-2 text-cw-muted">{l.allowed ? "to" : "from"} {state.roleLabels[l.role] ?? l.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PCard>
          </>
        )}
      </div>

      {confirm && (
        <div role="dialog" aria-modal="true" aria-label="Confirm" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <PCard className="w-full max-w-lg space-y-3 p-5">
            <div className="text-[16px] font-bold">{confirm.title}</div>
            <p className="text-sm text-cw-muted">Hard to undo — read before granting:</p>
            <ul className="space-y-2">
              {confirm.items.map((i) => (
                <li key={i.label} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900"><b>{i.label}.</b> {i.hard}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <PButton onClick={() => setConfirm(null)}>Cancel</PButton>
              <PButton variant="primary" onClick={() => { const c = confirm.changes; setConfirm(null); void send(c); }}>Grant</PButton>
            </div>
          </PCard>
        </div>
      )}
    </PortalShell>
  );
}
