"use client";

// Users on a phone (Tier 2 › list that opens a detail): approve someone who is waiting. Waiting people first with a
// 44 px Approve (portal.users.approve); the detail offers make admin / remove admin (portal.users.set-admin) and a
// password reset (portal.users.password-reset), as the server allows them (`can`). You cannot change yourself.
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Chips, T2Detail, T2Groups, T2Page, type Tone } from "@/components/m/tier2";
import { dayTime, getJson, useAction, useResource } from "@/lib/m/t2";

type User = { id: string; email: string; displayName?: string | null; isAdmin: boolean; isDeveloper: boolean; isApproved: boolean; createdAt?: string; lastSignInAt?: string | null };
type Data = { users?: User[]; callerIsDeveloper?: boolean; callerId?: string; can?: { approve?: boolean; setAdmin?: boolean; setDeveloper?: boolean; passwordReset?: boolean } };
const roleOf = (u: User): { label: string; tone: Tone } => u.isDeveloper ? { label: "Developer", tone: "sens" } : u.isAdmin ? { label: "Admin", tone: "info" } : !u.isApproved ? { label: "Waiting", tone: "warn" } : { label: "User", tone: "neutral" };

export default function UsersPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openId = search.get("id");
  const r = useResource<Data>("/api/admin/users", { fallback: "The server did not answer." });
  const act = useAction("That did not go through. Try again.");
  const [filter, setFilter] = useState<"all" | "waiting" | "admins">("all");
  const [said, setSaid] = useState<string | null>(null);
  const users = useMemo(() => (r.data?.users ?? []).slice().sort((a, b) => Number(a.isApproved) - Number(b.isApproved) || (a.displayName || a.email).localeCompare(b.displayName || b.email)), [r.data]);
  const picked = openId ? users.find((u) => u.id === openId) : null;
  usePhonePage({ title: picked ? (picked.displayName || picked.email) : "Users", subtitle: picked ? picked.email : users.length ? `${users.length} people` : null, back: picked ? () => router.replace("/m/users") : null, tab: "more", tabs: !picked });
  const waiting = users.filter((u) => !u.isApproved), admins = users.filter((u) => u.isAdmin || u.isDeveloper);
  const shown = filter === "waiting" ? waiting : filter === "admins" ? admins : users;
  const can = r.data?.can ?? {}; const me = r.data?.callerId; const callerDev = Boolean(r.data?.callerIsDeveloper);
  const mayAct = (u: User) => u.id !== me && (callerDev || !u.isDeveloper);
  const post = (key: string, body: Record<string, unknown>, done: string) => act.run(key, async () => { await getJson("/api/admin/users", { json: body }); setSaid(done); await r.reload(); });
  const reset = (u: User) => act.run("reset", async () => { await getJson("/api/admin/users/password-reset", { json: { userId: u.id } }); setSaid(`A reset link is on its way to ${u.email}.`); });
  if (r.status === 401 || r.status === 403) return <MError title="Users is for admins" icon="users">Ask an admin if someone is waiting for access.</MError>;

  if (picked) { const role = roleOf(picked); const ok = mayAct(picked); return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      {said && <div role="status" className="rounded-[12px] border border-cw-success-border bg-cw-success-tint px-3.5 py-3 text-[14px] text-cw-text">{said}</div>}
      {act.failed && <MError title="Not done." icon="users" onRetry={act.clear}>{act.failed}</MError>}
      <T2Detail title={picked.displayName || picked.email} rows={[{ k: "Email", v: picked.email, mono: true }, { k: "Role", v: role.label }, { k: "Last signed in", v: picked.lastSignInAt ? dayTime(picked.lastSignInAt) : "Never", mono: Boolean(picked.lastSignInAt) }, { k: "Joined", v: dayTime(picked.createdAt), mono: true }]}
        actions={[...(!picked.isApproved && can.approve && ok ? [{ label: "Approve", kind: "primary" as const, onClick: () => void post("approve", { userId: picked.id, isApproved: true }, `${picked.displayName || picked.email} can sign in now.`), busy: act.busy === "approve", disabled: act.busy !== null }] : []),
          ...(picked.isApproved && can.setAdmin && ok && !picked.isDeveloper ? [picked.isAdmin ? { label: "Remove admin", kind: "danger" as const, onClick: () => void post("admin", { userId: picked.id, isAdmin: false }, "No longer an admin."), busy: act.busy === "admin", disabled: act.busy !== null } : { label: "Make admin", onClick: () => void post("admin", { userId: picked.id, isAdmin: true }, "Now an admin."), busy: act.busy === "admin", disabled: act.busy !== null }] : []),
          ...(can.passwordReset && ok ? [{ label: "Send a password reset", onClick: () => void reset(picked), busy: act.busy === "reset", disabled: act.busy !== null }] : [])]} />
      {picked.id === me && <span className="px-0.5 text-[13px] text-cw-text-muted">This is you. Your own role and password are changed from Profile, or by another admin.</span>}
      {picked.isDeveloper && !callerDev && <span className="px-0.5 text-[13px] text-cw-text-muted">Developers are changed by developers.</span>}
    </div>
  ); }
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={users.length === 0} emptyCopy={["No users", "People who ask for access appear here."]} errorCopy={["Couldn’t load users", "Try again in a moment."]} onRetry={r.reload}
      top={<T2Chips value={filter} onChange={setFilter} chips={[{ k: "all", label: "All", n: users.length }, { k: "waiting", label: "Waiting", n: waiting.length }, { k: "admins", label: "Admins", n: admins.length }]} />}>
      {said && <div role="status" className="rounded-[12px] border border-cw-success-border bg-cw-success-tint px-3.5 py-3 text-[14px] text-cw-text">{said}</div>}
      {act.failed && <MError title="Not done." icon="users" onRetry={act.clear}>{act.failed}</MError>}
      <T2Groups groups={[
        { h: "WAITING", count: waiting.length, tone: waiting.length ? "warning" : undefined, rows: (filter === "admins" ? [] : waiting).map((u) => ({ key: u.id, title: u.displayName || u.email, sub: `${u.displayName ? `${u.email} · ` : ""}asked ${dayTime(u.createdAt)}`, href: `/m/users?id=${encodeURIComponent(u.id)}`, action: can.approve && mayAct(u) ? { label: "Approve", kind: "primary", onClick: () => void post(`approve-${u.id}`, { userId: u.id, isApproved: true }, `${u.displayName || u.email} can sign in now.`), busy: act.busy === `approve-${u.id}`, disabled: act.busy !== null } : undefined })) },
        { h: "USERS", count: shown.filter((u) => u.isApproved).length, rows: shown.filter((u) => u.isApproved).map((u) => { const role = roleOf(u); return { key: u.id, title: u.displayName || u.email, sub: `${u.displayName ? `${u.email} · ` : ""}${u.lastSignInAt ? `seen ${dayTime(u.lastSignInAt)}` : "never signed in"}`, badge: [role.label, role.tone], href: `/m/users?id=${encodeURIComponent(u.id)}` }; }) },
      ]} />
    </T2Page>
  );
}
