"use client";

// Admin → Permissions (portal redesign, stage 3 — "Page Permissions"): what each role may do (docs/permissions.md).
// Actions down, roles across, grouped as in lib/permissions/catalogue.mjs under the three services. Groups fold, and
// a folded group shows how much of it each role holds; the role's cell in a group row grants or takes away the whole
// group. Every click is one change on the server, logged with who and when; the server refuses anything that would
// lock everyone out, and granting something hard to undo is confirmed first.
import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import MaskIcon from "@/components/portal/Icon";
import {
  Badge, Button, Callout, Card, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState, NoMatchState, SearchInput, Segmented, SkeletonRows, TableCard, errorDetail, type Column,
} from "@/components/kit";

type Action = { key: string; label: string; default?: string[]; hard?: string; requires?: string; auto?: boolean; read?: boolean };
type Group = { key: string; label: string; service: string; actions: Action[] };
type Cell = { allowed: boolean | null; default: boolean; pinned: boolean; at: string | null; by: string | null };
type LogRow = { id: number; at: string; actor_email: string | null; role: string; action: string; allowed: boolean; previous: boolean | null; via: string };
type State = { roles: string[]; roleLabels: Record<string, string>; groups: Group[]; manage: string; grants: Record<string, Record<string, Cell>>; log: LogRow[]; me: { email: string | null; role: string } };
type Change = { role: string; action: string; allowed: boolean };

const SERVICES = [
  { id: "portal", label: "Portal", icon: "layout-grid" },
  { id: "agent", label: "Ops agent & flight intake", icon: "bot" },
  { id: "wall", label: "Digital Wall console", icon: "monitor" },
] as const;
const on = (c: Cell | undefined) => c?.allowed === true || c?.pinned === true;
const drifted = (c: Cell | undefined) => !!c && !c.pinned && (c.allowed ?? false) !== c.default;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const utc = (iso: string) => { const d = new Date(iso); return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.toISOString().slice(11, 16)}Z`; };

export default function PermissionsPage() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<"all" | "changed">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ title: string; items: { label: string; hard: string }[]; changes: Change[] } | null>(null);
  const [logQ, setLogQ] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch("/api/admin/permissions", { cache: "no-store" }).catch(() => null);
    const body = r ? await r.json().catch(() => ({})) : {};
    if (r?.status === 403) { setForbidden(true); return; }
    if (!r || !r.ok) { setError({ title: "Couldn't load permissions", detail: errorDetail(r?.status ?? "network", "GET", "/api/admin/permissions") + (body.error ? ` · ${body.error}` : "") }); return; }
    setState(body);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const actionsByKey = useMemo(() => new Map((state?.groups ?? []).flatMap((g) => g.actions.map((a) => [a.key, a] as const))), [state]);
  const total = actionsByKey.size;
  const driftCount = useMemo(() => {
    if (!state) return 0;
    let n = 0;
    for (const role of state.roles) for (const a of actionsByKey.keys()) if (drifted(state.grants[role]?.[a])) n += 1;
    return n;
  }, [state, actionsByKey]);
  const differs = (a: Action) => !!state && state.roles.some((r) => drifted(state.grants[r]?.[a.key]));
  const changedActions = useMemo(() => [...actionsByKey.values()].filter(differs).length, [actionsByKey, state]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setBusy(true); setSaveError(null);
    try {
      const r = await fetch("/api/admin/permissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setSaveError(body.error || `Not saved (${r.status}).`); return; }
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
    const next = !on(state!.grants[role]?.[action.key]);
    if (!next && lockedOff(role, action.key)) return;
    request([{ role, action: action.key, allowed: next }], `Grant “${action.label}” to ${state!.roleLabels[role]}?`);
  }
  function toggleGroup(role: string, group: Group) {
    const allOn = group.actions.every((a) => on(state!.grants[role]?.[a.key]));
    const next = !allOn;
    const changes = group.actions.filter((a) => on(state!.grants[role]?.[a.key]) !== next).filter((a) => next || !lockedOff(role, a.key)).map((a) => ({ role, action: a.key, allowed: next }));
    request(changes, `Grant everything in ${group.label} to ${state!.roleLabels[role]}?`);
  }

  const query = q.trim().toLowerCase();
  const match = (a: Action) => !query || `${a.label} ${a.key}`.toLowerCase().includes(query);
  const visible = (a: Action) => match(a) && (show === "all" || differs(a));
  const filtering = Boolean(query) || show === "changed";
  const shownCount = [...actionsByKey.values()].filter(visible).length;
  // While searching or filtering, every group with a match is open; otherwise the person's own choice.
  const isOpen = (g: Group) => filtering || open.has(g.key);
  const toggleOpen = (key: string) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const roles = state?.roles ?? [];
  const cols = { gridTemplateColumns: `minmax(0,1fr) repeat(${Math.max(roles.length, 3)}, 112px)` };

  const logRows = useMemo(() => (state?.log ?? []).filter((l) => !logQ.trim() || `${l.actor_email} ${state?.roleLabels[l.role] ?? l.role} ${l.action} ${actionsByKey.get(l.action)?.label ?? ""}`.toLowerCase().includes(logQ.trim().toLowerCase())), [state, logQ, actionsByKey]);
  const logCols: Column<LogRow>[] = [
    { id: "at", header: "When (UTC)", width: "150px", sortValue: (l) => l.at, cell: (l) => <span className="font-mono text-[12px]" title={fmt(l.at)}>{utc(l.at)}</span> },
    { id: "who", header: "Who", sortValue: (l) => l.actor_email ?? "", cell: (l) => <span className="block max-w-[280px] truncate">{l.actor_email ?? "—"}{l.via !== "screen" ? <span className="text-cw-text-muted"> ({l.via})</span> : null}</span> },
    { id: "change", header: "Change", width: "120px", cell: (l) => <Badge tone={l.allowed ? "success" : "danger"} dot={false}>{l.allowed ? "granted" : "took away"}</Badge> },
    { id: "action", header: "Action", sortValue: (l) => actionsByKey.get(l.action)?.label ?? l.action, cell: (l) => <span className="text-cw-text">{actionsByKey.get(l.action)?.label ?? l.action}</span> },
    { id: "role", header: "Role", width: "120px", sortValue: (l) => l.role, cell: (l) => <span>{l.allowed ? "to" : "from"} {state?.roleLabels[l.role] ?? l.role}</span> },
  ];

  return (
    <PortalShell title="Permissions" subtitle="What each role may do across the portal, the Ops agent, flight intake and the wall console. A change takes effect within 10 seconds and is logged under your name. Every server checks these itself — hiding a button is not what stops anyone.">
      <div className="flex flex-col gap-5 pb-10" style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        {saveError && <Callout tone="danger" title="Not saved" action={<Button size="sm" variant="quiet" onClick={() => setSaveError(null)}>Dismiss</Button>}>{saveError}</Callout>}

        {forbidden ? <TableCard><EmptyState icon="lock" title="Permissions is for whoever manages them">Your role can't see or change what each role may do. Someone with “Manage permissions (this screen)” can.</EmptyState></TableCard> : <>
        <TableCard>
          {/* Toolbar: find, show all / only what differs, fold. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-cw-divider px-4 py-3">
            <SearchInput size="sm" value={q} onValueChange={setQ} placeholder="Find an action or key" aria-label="Find an action" count={query ? `${shownCount} of ${total}` : undefined} className="w-[300px] max-w-full" />
            <Segmented size="sm" label="Show" value={show} onChange={setShow} options={[
              { value: "all", label: <span className="inline-flex items-center gap-1.5">All<span className="font-mono text-[11.5px] font-medium">{total || ""}</span></span>, text: "All" },
              { value: "changed", label: <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-[7px] w-[7px] rounded-[2px] bg-cw-diff" />Differs from default<span className="font-mono text-[11.5px] font-medium">{changedActions}</span></span>, text: "Differs from default" },
            ]} />
            <span className="flex-1" />
            <Button size="sm" variant="quiet" icon="chevrons-up-down" disabled={!state || filtering} onClick={() => setOpen(new Set(state!.groups.map((g) => g.key)))}>Expand all</Button>
            <Button size="sm" variant="quiet" icon="chevrons-down-up" disabled={!state || filtering} onClick={() => setOpen(new Set())}>Collapse all</Button>
          </div>
          {state && filtering && (
            <div role="status" className="flex flex-wrap items-center gap-2.5 border-b border-cw-primary-tint-border bg-cw-bg-selected px-4 py-2 text-[13px] text-cw-text">
              <MaskIcon name="filter" size={15} color="var(--cw-text-link)" />
              <strong>Showing {shownCount} of {total} actions</strong>
              <span className="text-cw-text-body">· {[query && `matching “${q.trim()}”`, show === "changed" && "that differ from the default"].filter(Boolean).join(" and ")}</span>
              <button type="button" onClick={() => { setQ(""); setShow("all"); }} className="ml-auto cursor-pointer rounded-[6px] border-none bg-transparent px-1 font-sans text-[13px] font-semibold text-cw-text-link outline-none hover:underline focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">Show everything</button>
            </div>
          )}
          {/* Legend */}
          {state && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-cw-divider px-4 py-2.5 text-[12.5px] text-cw-text-body">
              <span>You are <strong className="text-cw-text">{state.roleLabels[state.me.role] ?? state.me.role}</strong>{state.me.email ? <span className="font-mono text-[12px] text-cw-text-muted"> · {state.me.email}</span> : null}</span>
              <span className={driftCount ? "font-semibold text-cw-diff-text" : ""}>{driftCount ? `${driftCount} cell${driftCount === 1 ? "" : "s"} changed from the defaults` : "Exactly the defaults"}</span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="h-4 w-[22px] rounded-[4px] border border-cw-diff-border bg-cw-diff-tint" />Differs from the default — the default is written beneath</span>
              <span className="flex items-center gap-1.5"><MaskIcon name="triangle-alert" size={13} color="var(--cw-warning)" />Hard to undo</span>
              <span className="flex items-center gap-1.5"><MaskIcon name="eye" size={13} color="var(--cw-text-muted)" />A view, not a change (logged)</span>
            </div>
          )}

          {error ? (
            <ErrorState title={error.title} detail={<>Nothing has changed — every role keeps what it had.<br />{error.detail}</>} onRetry={() => void load()} />
          ) : !state ? (
            <SkeletonRows rows={10} avatar={false} label="Loading permissions" />
          ) : shownCount === 0 ? (
            query ? (
              <NoMatchState title={<>No actions match “{q.trim()}”{show === "changed" ? " among those that differ" : ""}</>} clearLabel="Clear search" onClear={() => setQ("")}>
                Search looks at action names and keys, like <span className="font-mono">wall.operators.delete</span>. The change log below is not affected.
              </NoMatchState>
            ) : (
              <NoMatchState title="Nothing differs from the defaults" clearLabel="Show everything" onClear={() => setShow("all")}>Every role holds exactly what it started with.</NoMatchState>
            )
          ) : (
            <table aria-label="Permissions" className="w-full border-separate border-spacing-0 text-left">
              {/* The role header sticks under the top bar (§3.1). */}
              <thead className="sticky top-[var(--cw-topbar)] z-[3]">
                <tr className="grid" style={cols}>
                  <th scope="col" className="flex h-10 items-center border-b border-cw-border bg-cw-bg-sunken pl-4 text-[11px] font-bold uppercase tracking-[0.06em] text-cw-text-muted">Action</th>
                  {roles.map((r) => <th key={r} scope="col" className="flex h-10 items-center justify-center border-b border-cw-border bg-cw-bg-sunken text-[11px] font-bold uppercase tracking-[0.06em] text-cw-text">{state.roleLabels[r]}</th>)}
                </tr>
              </thead>
              {SERVICES.map((svc) => {
                const groups = state.groups.filter((g) => g.service === svc.id && g.actions.some(visible));
                if (!groups.length) return null;
                const n = state.groups.filter((g) => g.service === svc.id).reduce((s, g) => s + g.actions.length, 0);
                return [
                  <tbody key={`${svc.id}-area`} aria-label={`${svc.label} area`}>
                    <tr className="grid" style={cols}>
                      <th scope="rowgroup" colSpan={roles.length + 1} className="col-span-full flex h-10 items-center gap-2.5 border-b border-cw-border bg-cw-bg-page pl-4 text-[13px] font-extrabold text-cw-text">
                        <MaskIcon name={svc.icon} size={15} color="var(--cw-text-muted)" />{svc.label}<span className="font-mono text-[12px] font-normal text-cw-text-muted">{n} actions · {state.groups.filter((g) => g.service === svc.id).length} groups</span>
                      </th>
                    </tr>
                  </tbody>,
                  ...groups.map((g) => {
                    const expanded = isOpen(g);
                    const gDiff = g.actions.filter(differs).length;
                    const gHard = g.actions.filter((a) => a.hard).length;
                    const rows = g.actions.filter(visible);
                    return (
                      <tbody key={g.key} aria-label={g.label}>
                        <tr className="grid border-b border-cw-divider" style={cols}>
                          <td className="flex min-w-0 items-center">
                            <button type="button" aria-expanded={expanded} disabled={filtering} onClick={() => toggleOpen(g.key)}
                              className="flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 border-none bg-transparent pl-4 pr-2 text-left font-sans outline-none hover:bg-cw-bg-hover focus-visible:shadow-[inset_0_0_0_2px_var(--cw-focus)] disabled:cursor-default disabled:hover:bg-transparent">
                              <MaskIcon name={expanded ? "chevron-down" : "chevron-right"} size={15} color="var(--cw-text-muted)" />
                              <span className="whitespace-nowrap text-[14px] font-bold text-cw-text">{g.label}</span>
                              <span className="whitespace-nowrap text-[12.5px] text-cw-text-muted">{g.actions.length} action{g.actions.length === 1 ? "" : "s"}</span>
                              {gDiff > 0 && <span className="inline-flex h-5 items-center gap-1 rounded-[5px] bg-cw-diff-tint px-1.5 text-[11.5px] font-semibold text-cw-diff-text"><span aria-hidden className="h-1.5 w-1.5 rounded-[2px] bg-cw-diff" />{gDiff} differ</span>}
                              {gHard > 0 && <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-cw-warning-text"><MaskIcon name="triangle-alert" size={12} color="var(--cw-warning)" />{gHard}</span>}
                            </button>
                          </td>
                          {roles.map((r) => {
                            const held = g.actions.filter((a) => on(state.grants[r]?.[a.key])).length;
                            const all = held === g.actions.length;
                            return (
                              <td key={r} className="flex items-center justify-center">
                                <button type="button" disabled={busy} onClick={() => toggleGroup(r, g)} aria-label={`${all ? "Take away" : "Grant"} everything in ${g.label} for ${state.roleLabels[r]}`} title={`${held} of ${g.actions.length} held · click to ${all ? "take away" : "grant"} all`}
                                  className="flex h-8 cursor-pointer items-center gap-2 rounded-[8px] border-none bg-transparent px-2 font-sans outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)] disabled:cursor-wait">
                                  <span aria-hidden className="flex h-1 w-9 overflow-hidden rounded-[2px] bg-cw-bg-active"><span className={all ? "bg-cw-success" : "bg-cw-primary"} style={{ width: `${(held / g.actions.length) * 100}%` }} /></span>
                                  <span className={`min-w-[28px] text-left font-mono text-[12px] font-medium ${all ? "text-cw-success-text" : held ? "text-cw-text" : "text-cw-text-muted"}`}>{all ? "All" : held ? `${held}/${g.actions.length}` : "None"}</span>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                        {expanded && rows.map((a) => (
                          <tr key={a.key} className="grid border-b border-cw-divider" style={cols}>
                            <td className="flex min-w-0 flex-col justify-center gap-0.5 py-2.5 pl-11 pr-4">
                              <span className="flex flex-wrap items-center gap-2 text-[14px] text-cw-text">
                                {a.label}
                                {a.read && <span title="A view, not a change — logged"><MaskIcon name="eye" size={13} color="var(--cw-text-muted)" /></span>}
                                {roles.some((r) => state.grants[r]?.[a.key]?.allowed === null && !state.grants[r]?.[a.key]?.pinned) && <Badge tone="diff" dot={false}>new — off until granted</Badge>}
                                {a.auto && <Badge tone="neutral" dot={false}>automatic</Badge>}
                              </span>
                              {a.hard && <span className="flex gap-1.5 text-[12.5px] leading-snug text-cw-warning-text"><span className="mt-[3px] flex-none"><MaskIcon name="triangle-alert" size={12} color="var(--cw-warning)" /></span><span><strong className="font-semibold">Hard to undo.</strong> {a.hard}</span></span>}
                              {a.requires && <span className="text-[12px] text-cw-text-muted">Only takes effect for a role that also has “{actionsByKey.get(a.requires)?.label}”.</span>}
                              <span className="font-mono text-[11.5px] text-cw-text-muted">{a.key}</span>
                            </td>
                            {roles.map((r) => {
                              const c = state.grants[r]?.[a.key];
                              const lock = on(c) ? lockedOff(r, a.key) : null;
                              const changed = drifted(c);
                              const title = [lock, changed ? `Changed from the default (${c!.default ? "on" : "off"})` : null, c?.by && c.by !== "default (seed)" ? `Last set by ${c.by}, ${fmt(c.at)}` : null].filter(Boolean).join(" · ");
                              return (
                                <td key={r} title={title || undefined} className={`flex flex-col items-center justify-center gap-1 ${changed ? "bg-cw-diff-tint shadow-[inset_0_0_0_1px_var(--cw-diff-border)]" : ""}`}>
                                  <span className="inline-flex items-center gap-1">
                                    <Checkbox checked={on(c)} disabled={busy || !!lock} onChange={() => toggleCell(r, a)} ariaLabel={`${a.label} — ${state.roleLabels[r]}`} />
                                    {c?.pinned && <MaskIcon name="lock" size={11} color="var(--cw-text-muted)" />}
                                  </span>
                                  {changed && <span className="text-[10.5px] font-semibold leading-tight text-cw-diff-text">default {c!.default ? "on" : "off"}</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    );
                  }),
                ];
              })}
            </table>
          )}
        </TableCard>

        {/* Change log (§3.1): below the matrix. */}
        <Card title="Change log" icon="history" description="Every change, newest first. Nobody can edit or delete a row." padded={false}
          actions={<SearchInput size="sm" value={logQ} onValueChange={setLogQ} placeholder="Person, role or action" aria-label="Filter the change log" className="w-[240px]" />}>
          {state ? (
            <DataTable label="Permission history" density="dense" columns={logCols} rows={logRows} rowKey={(l) => String(l.id)}
              filtered={Boolean(logQ.trim())} onClearFilters={() => setLogQ("")} noMatchTitle={<>No changes match “{logQ.trim()}”</>}
              empty={{ icon: "history", title: "No changes yet", body: "Every role has exactly the defaults it started with." }} />
          ) : error ? null : <SkeletonRows rows={4} avatar={false} label="Loading the change log" />}
        </Card>
        </>}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)} title={confirm?.title ?? ""} confirmLabel="Grant" icon="triangle-alert"
        body={confirm && <>
          <span className="block">Hard to undo — read before granting:</span>
          <span className="mt-2 flex flex-col gap-2">
            {confirm.items.map((i) => <span key={i.label} className="block rounded-[8px] border border-cw-warning-border bg-cw-warning-tint px-3 py-2 text-[13px] leading-snug text-cw-warning-text"><strong>{i.label}.</strong> {i.hard}</span>)}
          </span>
        </>}
        onCancel={() => setConfirm(null)} onConfirm={() => { const c = confirm!.changes; setConfirm(null); void send(c); }} />
    </PortalShell>
  );
}
