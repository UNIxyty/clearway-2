"use client";

// Content-region-only loading skeleton for shell-wrapped routes (item 3 of
// the post-deploy polish): a sidebar-shaped left spacer (sized from the
// persisted collapse state so it lines up with the real sidebar that mounts
// a moment later) plus shimmering content blocks. NEVER a full-screen
// spinner — the point is that the chrome appears stable while only the
// content region loads.

import { useState } from "react";

const COLLAPSE_KEY = "cw-shell-collapsed"; // must match components/portal/Shell.tsx

export default function RouteSkeleton() {
  const [collapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  return (
    <div className="flex min-h-screen bg-cw-page font-sans">
      {/* sidebar-shaped spacer (desktop only, like the real sidebar) */}
      <div
        className={
          "hidden flex-none border-r border-cw-border bg-cw-sidebar lg:block " +
          (collapsed ? "w-[68px]" : "w-[248px]")
        }
      />
      {/* content region shimmer */}
      <div className="min-w-0 flex-1">
        <div className="border-b border-cw-border bg-white/60 px-8 pb-[15px] pt-4">
          <div className="h-3 w-28 animate-pulse rounded bg-[#eceef1]" />
          <div className="mt-3 h-7 w-56 animate-pulse rounded-md bg-[#eceef1]" />
        </div>
        <div className="px-8 py-7">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-40 animate-pulse rounded-[14px] border border-cw-border bg-white" />
            <div className="h-40 animate-pulse rounded-[14px] border border-cw-border bg-white [animation-delay:120ms]" />
            <div className="h-64 animate-pulse rounded-[14px] border border-cw-border bg-white [animation-delay:240ms] lg:col-span-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
