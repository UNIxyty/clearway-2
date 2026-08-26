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
import {
  UserIcon,
  BarChartIcon,
  LogOutIcon,
  BellIcon,
  ShieldCheckIcon,
  ArchiveRestoreIcon,
  UsersIcon,
  TrophyIcon,
  MonitorIcon,
  SlidersHorizontalIcon,
  BookOpenIcon,
} from "lucide-react";

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
          className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#e6e7ea] bg-white py-[5px] pl-[7px] pr-[11px] transition-colors hover:bg-[#f5f6f7]"
        >
          <span className="flex h-[29px] w-[29px] items-center justify-center rounded-full bg-[#2563eb] text-xs font-bold text-white">
            {/* Same derivation as the console's initialsOf — one rule, both apps. */}
            {(displayText || "?")
              .split(/[\s@.]+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0])
              .join("")
              .toUpperCase() || "??"}
          </span>
          <div className="text-left leading-[1.15]">
            <div className="text-[13px] font-semibold text-[#17181c]">{displayText}</div>
            <div className="text-[11px] text-[#9aa0a8]">Account</div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[262px] rounded-[14px] border-[#e6e7ea] bg-white p-[7px] font-sans shadow-[0_16px_44px_rgba(16,18,22,.16)]">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayText}</p>
            {displayName && email && (
              <p className="text-xs leading-none text-muted-foreground">{email}</p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={() => router.push("/profile")}>
          <UserIcon className="mr-2 size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={() => router.push("/settings/notifications")}>
          <BellIcon className="mr-2 size-4" />
          Notification Settings
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={() => router.push("/stats")}>
          <BarChartIcon className="mr-2 size-4" />
          Stats
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={() => window.location.assign("/pickem")}>
          <TrophyIcon className="mr-2 size-4" />
          Pickem
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={() => window.location.assign("/pickem/admin")}>
            <ShieldCheckIcon className="mr-2 size-4" />
            Pickem Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-[11px] pb-[7px] pt-2 text-[10.5px] font-bold uppercase tracking-[0.13em] text-[#9aa0a8]">
          Digital Wall
        </DropdownMenuLabel>
        {/* Wall surfaces live behind the gateway (not Next routes) — full navigation, same tab. */}
        <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={() => window.location.assign("/digital-wall/timeline/")}>
          <MonitorIcon className="mr-2 size-4" />
          Digital Wall
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={() => window.location.assign("/digital-wall/console/flights")}>
          <SlidersHorizontalIcon className="mr-2 size-4" />
          Digital Wall Console
        </DropdownMenuItem>
        {/* New tab, matching the console's Guide pill. */}
        <DropdownMenuItem
          onClick={() => window.open("/digital-wall/guide/", "_blank", "noopener,noreferrer")}
        >
          <BookOpenIcon className="mr-2 size-4" />
          Guide
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={() => router.push("/admin/airports/deleted")}>
          <ArchiveRestoreIcon className="mr-2 size-4" />
          Deleted airports
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={() => router.push("/admin/users")}>
            <UsersIcon className="mr-2 size-4" />
            Admin users
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={() => router.push("/admin/maintenance")}>
            <ShieldCheckIcon className="mr-2 size-4" />
            Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-[#3a3d44] focus:bg-[#f5f6f7] focus:text-[#17181c]" onClick={signOut}>
          <LogOutIcon className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

