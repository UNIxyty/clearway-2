import { Suspense } from "react";
import FullPageChat from "@/components/agent/pages/FullPageChat";

export const dynamic = "force-dynamic";

// The full-page chat (design spec §7). useSearchParams needs a Suspense
// boundary, or Next de-opts the route to client rendering (React #418/#422).
export default function AgentPage() {
  return <Suspense fallback={null}><FullPageChat /></Suspense>;
}
