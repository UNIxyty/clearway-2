"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserIcon, SettingsIcon, BarChartIcon, LogOutIcon, BellIcon, ShieldCheckIcon } from "lucide-react";

export default function UserBadge() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });

    fetch("/api/user/preferences")
      .then((res) => res.json())
      .then((data) => {
        if (data.preferences?.display_name) {
          setDisplayName(data.preferences.display_name);
        }
      })
      .catch(() => {});

    fetch("/api/admin/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { isAdmin: false }))
      .then((data) => setIsAdmin(Boolean(data?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const displayText = displayName || email || "User";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2 hover:bg-card/90 transition-colors"
        >
          <div className="flex items-center justify-center size-7 rounded-full bg-primary/10 border border-primary/20">
            <UserIcon className="size-4 text-primary" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium leading-tight">{displayText}</div>
            <div className="text-xs text-muted-foreground">Account</div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayText}</p>
            {displayName && email && (
              <p className="text-xs leading-none text-muted-foreground">{email}</p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/profile")}>
          <UserIcon className="mr-2 size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <SettingsIcon className="mr-2 size-4" />
          AI Model Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings/notifications")}>
          <BellIcon className="mr-2 size-4" />
          Notification Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/stats")}>
          <BarChartIcon className="mr-2 size-4" />
          Stats
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onClick={() => router.push("/admin/maintenance")}>
            <ShieldCheckIcon className="mr-2 size-4" />
            Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOutIcon className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

