"use client";

// Dashboard layout (platform design, DASHBOARD screen): Recently used
// full-width on top, then Service status + Server health side by side,
// then the Changelog. Server health is ADMIN-ONLY: probed with the same
// existing /api/admin/status check the Shell uses (audit rule — never
// reimplemented), and the region is hidden entirely for non-admins
// (fail closed: probe failure = not admin).
import { useEffect, useState } from "react";
import RecentsCard from "./RecentsCard";
import ServiceStatusCard from "./ServiceStatusCard";
import ServerHealthCard from "./ServerHealthCard";
import ChangelogCard from "./ChangelogCard";

export default function DashboardRegions() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/admin/status", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : { isAdmin: false }))
      .then((d) => setIsAdmin(Boolean(d?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  return (
    <div className="flex flex-col gap-[18px]">
      <RecentsCard />
      <div
        className={
          isAdmin
            ? "grid items-start gap-[18px] xl:grid-cols-[1fr_1fr]"
            : "grid items-start gap-[18px]"
        }
      >
        <ServiceStatusCard />
        {isAdmin && <ServerHealthCard />}
      </div>
      <ChangelogCard />
    </div>
  );
}
