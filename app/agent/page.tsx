import { Suspense } from "react";
import AgentChat from "@/components/agent/AgentChat";

export const dynamic = "force-dynamic";

export default function AgentPage() {
  // AgentChat reads ?c=<conversation id> with useSearchParams, which requires a
  // Suspense boundary — without one Next de-opts the whole route to client
  // rendering and hydration reports React #418/#422.
  return (
    <Suspense fallback={null}>
      <AgentChat />
    </Suspense>
  );
}
