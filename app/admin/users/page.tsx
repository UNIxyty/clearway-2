"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import PortalShell from "@/components/portal/Shell";
import { PCard, PButton, PChip, PMono, PTh } from "@/components/portal/ui";

type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  isDeveloper: boolean;
  isApproved: boolean;
  createdAt: string | null;
};

const ROLE_BADGE: Record<string, { color: string; bg: string }> = {
  developer: { color: "#7c3aed", bg: "#f3e8ff" },
  admin: { color: "#1d4ed8", bg: "#eef4ff" },
  user: { color: "#475569", bg: "#eef1f5" },
  pending: { color: "#c2703b", bg: "#fdf1e8" },
};

function RoleBadge({ label }: { label: string }) {
  const c = ROLE_BADGE[label] ?? ROLE_BADGE.user;
  return (
    <PChip color={c.color} bg={c.bg} className="uppercase tracking-wide text-[10px]">
      {label}
    </PChip>
  );
}

function roleLabel(u: AdminUserRow) {
  if (u.isDeveloper) return "developer";
  if (u.isAdmin) return "admin";
  if (!u.isApproved) return "pending";
  return "user";
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [callerIsDeveloper, setCallerIsDeveloper] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || "Failed to load users");
        setUsers(payload.users ?? []);
        setCallerIsDeveloper(Boolean(payload.callerIsDeveloper));
      })
      .catch((e) => setError((e as Error).message || "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  async function updateRole(
    target: AdminUserRow,
    patch: { isAdmin?: boolean; isDeveloper?: boolean; isApproved?: boolean }
  ) {
    setUpdatingUserId(target.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.id, ...patch }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to update");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === target.id
            ? {
                ...u,
                isAdmin: patch.isAdmin !== undefined ? patch.isAdmin : u.isAdmin,
                isDeveloper: patch.isDeveloper !== undefined ? patch.isDeveloper : u.isDeveloper,
                isApproved: patch.isApproved !== undefined ? patch.isApproved : u.isApproved,
              }
            : u,
        ).sort((a, b) => {
          if (a.isDeveloper !== b.isDeveloper) return a.isDeveloper ? -1 : 1;
          if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
          if (a.isApproved !== b.isApproved) return a.isApproved ? 1 : -1;
          return String(a.email || "").localeCompare(String(b.email || ""), undefined, { sensitivity: "base" });
        }),
      );
    } catch (e) {
      setError((e as Error).message || "Failed to update");
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <PortalShell>
      <div className="max-w-[1560px] px-[30px] pb-10 pt-[26px]">
        <div className="mb-4">
          <PButton
            type="button"
            variant="quiet"
            size="sm"
            onClick={() => router.push("/admin/maintenance")}
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </PButton>
        </div>

        <h1 className="m-0 mb-[5px] text-[26px] font-extrabold tracking-[-0.02em]">Users</h1>
        <p className="m-0 mb-5 text-[15px] text-[#6c7079]">
          Approve new accounts and manage roles. Admins can grant/revoke Admin. Only Developers can grant/revoke Developer.
        </p>

        {error && (
          <div className="mb-4 rounded-[10px] border border-[#f0d4d4] bg-[#fdf2f2] px-3.5 py-2.5 text-sm text-[#a12a2e]">
            {error}
          </div>
        )}

        <PCard className="overflow-hidden">
          {loading ? (
            <p className="m-0 px-[18px] py-5 text-sm text-[#6c7079]">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="m-0 px-[18px] py-5 text-sm text-[#6c7079]">No users found.</p>
          ) : (
            <>
              <div className="hidden grid-cols-[110px_1.2fr_1.4fr_auto] items-center gap-3.5 border-b border-[#eef0f2] bg-[#fbfbfc] px-[18px] py-2.5 md:grid">
                <PTh>ROLE</PTh>
                <PTh>USER</PTh>
                <PTh>EMAIL</PTh>
                <PTh className="text-right">ACTIONS</PTh>
              </div>
              <div className="max-h-[560px] overflow-y-auto">
                {users.map((u) => {
                  const busy = updatingUserId === u.id;
                  const isDevProtected = u.isDeveloper && !callerIsDeveloper;
                  return (
                    <div
                      key={u.id}
                      className="grid grid-cols-1 items-center gap-2 border-b border-[#f2f3f5] px-[18px] py-3 last:border-b-0 md:grid-cols-[110px_1.2fr_1.4fr_auto] md:gap-3.5"
                    >
                      <div>
                        <RoleBadge label={roleLabel(u)} />
                      </div>
                      <p className="m-0 min-w-0 truncate text-sm font-semibold text-[#17181c]">
                        {u.displayName || u.email || "Unknown user"}
                      </p>
                      <PMono className="min-w-0 truncate text-[12.5px] text-[#6c7079]">
                        {u.email || "No email"}
                      </PMono>

                      <div className="flex shrink-0 justify-end gap-1.5">
                        {/* Approve button — shown for pending users */}
                        {!u.isApproved && !u.isDeveloper && !u.isAdmin && (
                          <PButton
                            type="button"
                            size="sm"
                            variant="primary"
                            disabled={busy}
                            onClick={() => updateRole(u, { isApproved: true })}
                          >
                            {busy ? "…" : "Approve"}
                          </PButton>
                        )}

                        {/* Admin toggle — available to admins and devs, blocked if target is dev and caller isn't */}
                        {!u.isDeveloper && u.isApproved && (
                          <PButton
                            type="button"
                            size="sm"
                            variant={u.isAdmin ? "secondary" : "primary"}
                            disabled={busy || isDevProtected}
                            onClick={() => updateRole(u, { isAdmin: !u.isAdmin })}
                          >
                            {busy ? "…" : u.isAdmin ? "Remove admin" : "Make admin"}
                          </PButton>
                        )}

                        {/* Developer toggle — only shown to developers */}
                        {callerIsDeveloper && (
                          <PButton
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => updateRole(u, { isDeveloper: !u.isDeveloper })}
                          >
                            {busy ? "…" : u.isDeveloper ? "Remove dev" : "Make dev"}
                          </PButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </PCard>
      </div>
    </PortalShell>
  );
}
