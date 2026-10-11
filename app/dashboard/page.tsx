// The post-login landing page (portal redesign, stage 3 — "Page Dashboard"): blocks each person arranges for
// themselves (components/portal/dashboard/Dashboard). Every block loads on its own, client-side, with auto-refresh.

import Dashboard from "@/components/portal/dashboard/Dashboard";

export default function DashboardPage() {
  return <Dashboard />;
}
