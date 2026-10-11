"use client";

// Admin → Users (portal redesign, stage 3 — "Page Users"): approve new accounts, manage roles, send a password reset.
// Role tabs and the filter bar narrow the list; whenever anything is filtered the strip says how many are hidden. The
// table scrolls with the page. Each action is offered only to someone allowed to do it (the API says, from
// Admin → Permissions) and checked again on the server: nobody changes their own role, and an admin cannot act on a
// developer's account.
import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import {
  Button, ConfirmDialog, DataTable, EmptyState, FilterBar, FilteredStrip, RoleBadge, TableCard, errorDetail, filterReasons, useToast, type Column, type MenuItem,
} from "@/components/kit";

type UserRow = { id: string; email: string | null; displayName: string | null; isAdmin: boolean; isDeveloper: boolean; isApproved: boolean; createdAt: string | null; lastSignInAt: string | null };
type Can = { approve: boolean; setAdmin: boolean; setDeveloper: boolean; passwordReset: boolean };
type Role = "developer" | "admin" | "pending" | "user";
type Patch = { isAdmin?: boolean; isDeveloper?: boolean; isApproved?: boolean };

const roleOf = (u: UserRow): Role => (u.isDeveloper ? "developer" : u.isAdmin ? "admin" : !u.isApproved ? "pending" : "user");
const ORDER: Record<Role, number> = { developer: 0, admin: 1, pending: 2, user: 3 };
const nameOf = (u: UserRow) => u.displayName || u.email || "Unknown user";
const initials = (u: UserRow) => nameOf(u).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const DAY = 86400000;
function signedIn(iso: string | null) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return "now";
  if (ms < 3600000) return `${Math.floor(ms / 60000)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / 3600000)}h ago`;
  if (ms < 2 * DAY) return "yesterday";
  if (ms < 7 * DAY) return `${Math.floor(ms / DAY)} days ago`;
  const d = new Date(iso);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}${d.getUTCFullYear() !== new Date().getUTCFullYear() ? ` ${d.getUTCFullYear()}` : ""}`;
}
const recency = (iso: string | null) => { if (!iso) return "never"; const ms = Date.now() - new Date(iso).getTime(); return ms < DAY ? "day" : ms < 7 * DAY ? "week" : ms < 30 * DAY ? "month" : "older"; };

const TABS: Array<{ id: string; label: string; roles: Role[] }> = [
  { id: "all", label: "All", roles: [] },
  { id: "pending", label: "Pending", roles: ["pending"] },
  { id: "admins", label: "Admins", roles: ["admin", "developer"] },
  { id: "users", label: "Users", roles: ["user"] },
];

export default function AdminUsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [can, setCan] = useState<Can>({ approve: false, setAdmin: false, setDeveloper: false, passwordReset: false });
  const [callerIsDeveloper, setCallerIsDeveloper] = useState(false);
  const [callerId, setCallerId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ user: UserRow; patch: Patch; title: string; body: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    const res = await fetch("/api/admin/users", { cache: "no-store" }).catch(() => null);
    const payload = res ? await res.json().catch(() => ({})) : {};
    if (res?.status === 403) { setForbidden(true); setState("ready"); return; }
    if (!res || !res.ok) { setLoadError(errorDetail(res?.status ?? "network", "GET", "/api/admin/users") + (payload?.error ? ` · ${payload.error}` : "")); setState("error"); return; }
    setUsers(payload.users ?? []);
    setCallerIsDeveloper(Boolean(payload.callerIsDeveloper));
    setCallerId(payload.callerId ?? null);
    setCan({ approve: false, setAdmin: false, setDeveloper: false, passwordReset: false, ...(payload.can ?? {}) });
    setState("ready");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function update(target: UserRow, patch: Patch, undoable = true) {
    setBusy(target.id);
    try {
      const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: target.id, ...patch }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { toast.show({ tone: "danger", title: `Couldn't update ${nameOf(target)}`, body: payload?.error || `The server said ${res.status}.` }); return; }
      const before = { isAdmin: target.isAdmin, isDeveloper: target.isDeveloper, isApproved: target.isApproved };
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, ...patch } : u)));
      const what = patch.isApproved ? "is approved" : patch.isAdmin === true ? "is now an Admin" : patch.isAdmin === false ? "is no longer an Admin" : patch.isDeveloper === true ? "is now a Developer" : patch.isDeveloper === false ? "is no longer a Developer" : "was updated";
      const undo: Patch = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof Patch]]));
      toast.show({ tone: "success", title: `${nameOf(target)} ${what}`, body: "Takes effect within 10 seconds.", ...(undoable ? { action: { label: "Undo", onClick: () => void update({ ...target, ...patch }, undo, false) } } : {}) });
    } finally { setBusy(null); }
  }

  async function sendReset(targets: UserRow[]) {
    let sent = 0; const failed: string[] = [];
    setBusy("reset");
    for (const u of targets) {
      const res = await fetch("/api/admin/users/password-reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: u.id }) }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok) sent += 1; else failed.push(`${nameOf(u)}: ${body.error ?? `failed (${res?.status ?? "network"})`}`);
    }
    setBusy(null);
    if (sent) toast.show({ tone: "success", title: sent === 1 && targets.length === 1 ? `Password reset sent to ${targets[0].email}` : `Password reset sent to ${sent} ${sent === 1 ? "person" : "people"}`, body: "The email links to a page where they choose a new password." });
    if (failed.length) toast.show({ tone: "danger", title: `Couldn't send ${failed.length} reset email${failed.length === 1 ? "" : "s"}`, body: failed.slice(0, 2).join(" · "), action: { label: "Retry", onClick: () => void sendReset(targets.filter((t) => failed.some((f) => f.startsWith(`${nameOf(t)}:`)))) } });
    if (sent && !failed.length) setSelected(new Set());
  }

  const protectedRow = (u: UserRow) => u.isDeveloper && !callerIsDeveloper;
  const menuFor = (u: UserRow): MenuItem[] => {
    const r = roleOf(u); const me = u.id === callerId; const items: MenuItem[] = [];
    if (!protectedRow(u) && !me) {
      if (can.setAdmin && r === "user") items.push({ id: "admin", label: "Make admin", icon: "shield", onSelect: () => void update(u, { isAdmin: true }) });
      if (can.setDeveloper && callerIsDeveloper && (r === "user" || r === "admin")) items.push({ id: "dev", label: "Make developer", icon: "terminal", onSelect: () => void update(u, { isDeveloper: true }) });
    }
    if (can.passwordReset && !protectedRow(u) && u.email) items.push({ id: "reset", label: "Send password reset", icon: "key-round", onSelect: () => void sendReset([u]) });
    items.push({ id: "copy", label: "Copy user ID", icon: "copy", onSelect: () => { void navigator.clipboard?.writeText(u.id); toast.show({ tone: "info", title: "User ID copied", body: u.id }); } });
    if (!protectedRow(u) && !me) {
      if (can.setAdmin && r === "admin") items.push({ id: "rm-admin", label: "Remove admin…", icon: "shield-off", danger: true, onSelect: () => setConfirm({ user: u, patch: { isAdmin: false }, title: `Remove Admin from ${nameOf(u)}?`, body: "They keep their account and can still sign in as a User. They lose Admin pages straight away.", label: "Remove Admin" }) });
      if (can.setDeveloper && callerIsDeveloper && r === "developer") items.push({ id: "rm-dev", label: "Remove developer…", icon: "shield-off", danger: true, onSelect: () => setConfirm({ user: u, patch: { isDeveloper: false }, title: `Remove Developer from ${nameOf(u)}?`, body: "They keep their account and any Admin role. They lose the Developer pages and can no longer manage permissions unless their role allows it.", label: "Remove Developer" }) });
    }
    return items;
  };

  // Filters
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => users.filter((u) => (!query || `${u.displayName ?? ""} ${u.email ?? ""}`.toLowerCase().includes(query)) && (!roles.length || roles.includes(roleOf(u))) && (!seen.length || seen.includes(recency(u.lastSignInAt)))), [users, query, roles, seen]);
  const filtered = Boolean(query) || roles.length > 0 || seen.length > 0;
  const clearAll = () => { setQ(""); setRoles([]); setSeen([]); };
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, t.roles.length ? users.filter((u) => t.roles.includes(roleOf(u))).length : users.length])), [users]);
  const activeTab = TABS.find((t) => t.roles.length === roles.length && t.roles.every((r) => roles.includes(r)))?.id ?? null;

  const columns: Column<UserRow>[] = [
    { id: "user", header: "User", sortValue: (u) => nameOf(u).toLowerCase(), cell: (u) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-cw-border bg-cw-bg-sunken text-[11px] font-bold text-cw-text-body">{initials(u)}</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{nameOf(u)}{u.id === callerId && <span className="font-medium text-cw-text-muted"> · you</span>}</span>
          <span className="truncate font-mono text-[12px] text-cw-text-muted">{u.email || "No email"}</span>
        </span>
      </span>
    ) },
    { id: "role", header: "Role", width: "130px", sortValue: (u) => ORDER[roleOf(u)], cell: (u) => <RoleBadge role={roleOf(u)} /> },
    { id: "status", header: "Status", width: "190px", cell: (u) => (u.isApproved || u.isAdmin || u.isDeveloper
      ? <span className="flex items-center gap-1.5 text-[13px] text-cw-text-body"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cw-success" />Active</span>
      : <span className="flex items-center gap-1.5 text-[13px] text-cw-warning-text"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cw-warning" />Waiting for approval</span>) },
    { id: "seen", header: "Last sign-in", width: "130px", sortValue: (u) => (u.lastSignInAt ? -new Date(u.lastSignInAt).getTime() : Number.MAX_SAFE_INTEGER), cell: (u) => <span className="font-mono text-[12.5px] text-cw-text-body" title={u.lastSignInAt ?? "Never signed in"}>{signedIn(u.lastSignInAt)}</span> },
    { id: "approve", header: <span className="sr-only">Approve</span>, width: "110px", align: "right", cell: (u) => (roleOf(u) === "pending" && can.approve ? <Button size="sm" variant="primary" icon="check" loading={busy === u.id} loadingLabel="Approving…" onClick={() => void update(u, { isApproved: true })}>Approve</Button> : null) },
  ];

  return (
    <PortalShell title="Users" subtitle="Approve new accounts and manage roles. Admins can grant or remove Admin. Only Developers can grant or remove Developer."
      headerRight={state === "ready" && !forbidden ? (
        <div role="tablist" aria-label="Show" className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const on = activeTab === t.id;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => setRoles(t.roles)}
                className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-[8px] border px-3 font-sans text-[13px] font-semibold outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)] ${on ? "border-cw-ink bg-cw-ink text-cw-on-ink" : "border-cw-border-control bg-cw-bg-surface text-cw-text-body hover:bg-cw-bg-hover"}`}>
                {t.label}<span className="font-mono text-[11.5px] font-medium opacity-85">{counts[t.id]}</span>
              </button>
            );
          })}
        </div>
      ) : undefined}>
      <div className="pb-10" style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        {forbidden ? <TableCard><EmptyState icon="lock" title="Users is for Admins">Your role can't approve accounts or change roles. An admin can, under Admin → Users.</EmptyState></TableCard> : (
        <TableCard>
          <DataTable
            label="Users"
            columns={columns}
            rows={shown}
            rowKey={(u) => u.id}
            state={state}
            error={{ title: "Couldn't load users", detail: loadError, onRetry: () => void load() }}
            defaultSort={{ id: "role", dir: "asc" }}
            selectable={can.passwordReset}
            selected={selected}
            onSelectedChange={setSelected}
            bulkActions={(keys) => <Button size="sm" icon="key-round" loading={busy === "reset"} loadingLabel="Sending…" onClick={() => void sendReset(users.filter((u) => keys.includes(u.id) && !protectedRow(u) && u.email))}>Send password reset</Button>}
            rowMenu={menuFor}
            filtered={filtered}
            onClearFilters={clearAll}
            noMatchTitle={query ? <>No users match “{q.trim()}”</> : "No users match these filters"}
            noMatchBody="Search looks at names and email addresses."
            empty={{ icon: "users", title: "No accounts yet", body: "People appear here when they sign up; new accounts wait for approval." }}
            toolbar={<>
              <FilterBar search={q} onSearch={setQ} searchPlaceholder="Search name or email" count={<>Sorted by <strong className="font-semibold text-cw-text">role</strong>, then name</>}
                filters={[
                  { id: "role", label: "Role", icon: "shield", options: [{ value: "developer", label: "Developer" }, { value: "admin", label: "Admin" }, { value: "user", label: "User" }, { value: "pending", label: "Pending" }], values: roles, onChange: setRoles, counts: { developer: users.filter((u) => roleOf(u) === "developer").length, admin: users.filter((u) => roleOf(u) === "admin").length, user: users.filter((u) => roleOf(u) === "user").length, pending: users.filter((u) => roleOf(u) === "pending").length } },
                  { id: "seen", label: "Last sign-in", icon: "clock", options: [{ value: "day", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" }, { value: "older", label: "Earlier" }, { value: "never", label: "Never" }], values: seen, onChange: setSeen },
                ]} />
              {filtered && state === "ready" && <FilteredStrip shown={shown.length} total={users.length} reasons={filterReasons((roles.length ? 1 : 0) + (seen.length ? 1 : 0), Boolean(query))} onClear={clearAll} noun={users.length - shown.length === 1 ? "person" : "people"} />}
            </>}
          />
        </TableCard>
        )}
      </div>
      <ConfirmDialog open={Boolean(confirm)} danger icon="user-x" title={confirm?.title ?? ""} body={confirm?.body} confirmLabel={confirm?.label ?? ""} busy={Boolean(confirm && busy === confirm.user.id)} busyLabel="Removing…"
        onCancel={() => setConfirm(null)} onConfirm={async () => { const c = confirm!; await update(c.user, c.patch); setConfirm(null); }} />
    </PortalShell>
  );
}
