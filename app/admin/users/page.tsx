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
  createdAt: string | null;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || "Failed to load users");
        setUsers(payload.users ?? []);
      })
      .catch((e) => setError((e as Error).message || "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  async function updateAdmin(target: AdminUserRow, nextAdmin: boolean) {
    setUpdatingUserId(target.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.id, isAdmin: nextAdmin }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to update admin");
      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, isAdmin: nextAdmin } : u)),
      );
    } catch (e) {
      setError((e as Error).message || "Failed to update admin");
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
            <CardTitle className="text-base">Admin Users</CardTitle>
            <CardDescription>
              Grant or revoke admin rights for other users.
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
              <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {u.displayName || u.email || "Unknown user"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email || "No email"} {u.isAdmin ? "· Admin" : "· User"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={u.isAdmin ? "outline" : "default"}
                      disabled={updatingUserId === u.id}
                      onClick={() => {
                        void updateAdmin(u, !u.isAdmin);
                      }}
                    >
                      {updatingUserId === u.id
                        ? "Saving…"
                        : u.isAdmin
                          ? "Remove admin"
                          : "Make admin"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

