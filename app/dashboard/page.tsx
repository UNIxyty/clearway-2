// The post-login landing page (audit §5.2 — "/" now lands somewhere neutral
// instead of the search tool). Phase 2 ships the frame with the design's four
// dashboard regions as placeholders; Phase 3 wires in the data (§6).

import PortalShell from "@/components/portal/Shell";
import { PCard, PSectionTitle } from "@/components/portal/ui";

const REGIONS = [
  {
    id: "recent",
    title: "Recently used",
    body: "Your recently opened airports and services will appear here.",
  },
  {
    id: "status",
    title: "Service status",
    body: "Per-country AIP service health at a glance.",
  },
  {
    id: "health",
    title: "Server health",
    body: "CPU, memory, disk and container states from the host.",
  },
  {
    id: "changelog",
    title: "Changelog",
    body: "Who changed what across the platform, most recent first.",
  },
] as const;

export default function DashboardPage() {
  return (
    <PortalShell
      title="Dashboard"
      crumb="/dashboard"
      subtitle="Everything worth knowing about the platform, in one screen."
    >
      <div className="px-4 py-6 pb-12 sm:px-[30px]">
        <div className="mx-auto grid w-full max-w-[1560px] gap-5 md:grid-cols-2">
          {REGIONS.map((region) => (
            <PCard key={region.id} className="p-[22px]">
              <PSectionTitle className="mb-3">{region.title}</PSectionTitle>
              <p className="m-0 text-sm leading-relaxed text-[#9aa0a8]">{region.body}</p>
              <p className="m-0 mt-3 text-[12.5px] font-medium text-[#c3c7cd]">Wired in Phase 3.</p>
            </PCard>
          ))}
        </div>
      </div>
    </PortalShell>
  );
}
