import { Suspense } from "react";
import FullPageChat from "@/components/agent/pages/FullPageChat";

export const dynamic = "force-dynamic";

// /agent/t/{id}: one thread on the full page — where "Expand" from the panel
// lands (design spec §6.12), carrying the same server-side conversation.
export default function ThreadPage({ params }: { params: { id: string } }) {
  return <Suspense fallback={null}><FullPageChat conversationId={params.id} /></Suspense>;
}
