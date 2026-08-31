// The post-login landing page (audit §5.2 — "/" now lands somewhere neutral
// instead of the search tool). Phase 3 wires the design's four dashboard
// regions to live data (§6): Recently used (search_events), Service status
// (/api/service-checks), Server health (admin-only, /api/admin/metrics) and
// the Changelog (/api/dashboard/changelog). All data fetching is client-side
// in the region components with auto-refresh.

import PortalShell from "@/components/portal/Shell";
import DashboardRegions from "@/components/portal/dashboard/DashboardRegions";

export default function DashboardPage() {
  return (
    <PortalShell
      title="Dashboard"
      crumb="/dashboard"
      subtitle="Everything worth knowing about the platform, in one screen."
    >
      <div className="px-4 py-6 pb-12 sm:px-[30px]">
        <div className="mx-auto w-full max-w-[1560px]">
          <DashboardRegions />
        </div>
      </div>
    </PortalShell>
  );
}
