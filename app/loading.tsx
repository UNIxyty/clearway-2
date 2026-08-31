// Root-level route loading UI: content-region skeleton with a sidebar-shaped
// spacer (see components/portal/RouteSkeleton.tsx). Segment-level variants
// exist for /dashboard and /aip.
import RouteSkeleton from "@/components/portal/RouteSkeleton";

export default function RootLoading() {
  return <RouteSkeleton />;
}
