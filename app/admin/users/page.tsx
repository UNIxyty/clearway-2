"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";

type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  isDeveloper: boolean;
  isApproved: boolean;
  createdAt: string | null;
};

const ROLE_BADGE: Record<string, string> = {
  developer: "bg-violet-500/15 text-violet-600 border-violet-400/30",
  admin: "bg-blue-500/15 text-blue-600 border-blue-400/30",
  user: "bg-muted/60 text-muted-foreground border-border/50",
  pending: "bg-amber-500/15 text-amber-600 border-amber-400/30",
};

function RoleBadge({ label }: { label: string }) {
  const cls = ROLE_BADGE[label] ?? ROLE_BADGE.user;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
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
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/admin/maintenance")}>
            <ArrowLeftIcon className="size-4 mr-1" />
            Back
          </Button>
        </div>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Users</CardTitle>
            <CardDescription>
              Approve new accounts and manage roles. Admins can grant/revoke Admin. Only Developers can grant/revoke Developer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading users…</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users found.</p>
            ) : (
              <div className="max-h-[560px] overflow-y-auto space-y-2 pr-1">
                {users.map((u) => {
                  const busy = updatingUserId === u.id;
                  const isDevProtected = u.isDeveloper && !callerIsDeveloper;
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/70 px-3 py-2"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <RoleBadge label={roleLabel(u)} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {u.displayName || u.email || "Unknown user"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {u.email || "No email"}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-1.5">
                        {/* Approve button — shown for pending users */}
                        {!u.isApproved && !u.isDeveloper && !u.isAdmin && (
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            disabled={busy}
                            onClick={() => updateRole(u, { isApproved: true })}
                          >
                            {busy ? "…" : "Approve"}
                          </Button>
                        )}

                        {/* Admin toggle — available to admins and devs, blocked if target is dev and caller isn't */}
                        {!u.isDeveloper && u.isApproved && (
                          <Button
                            type="button"
                            size="sm"
                            variant={u.isAdmin ? "outline" : "default"}
                            disabled={busy || isDevProtected}
                            onClick={() => updateRole(u, { isAdmin: !u.isAdmin })}
                          >
                            {busy ? "…" : u.isAdmin ? "Remove admin" : "Make admin"}
                          </Button>
                        )}

                        {/* Developer toggle — only shown to developers */}
                        {callerIsDeveloper && (
                          <Button
                            type="button"
                            size="sm"
                            variant={u.isDeveloper ? "outline" : "secondary"}
                            disabled={busy}
                            onClick={() => updateRole(u, { isDeveloper: !u.isDeveloper })}
                          >
                            {busy ? "…" : u.isDeveloper ? "Remove dev" : "Make dev"}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
