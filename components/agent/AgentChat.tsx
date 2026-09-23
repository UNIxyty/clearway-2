"use client";

// The agent's full page — the panel's "expand" destination.
//
// It is the SAME component as the panel, in fullPage mode, carrying the
// conversation: history is server-side, so ?c=<id> continues the exact thread
// the user was reading in the panel rather than starting a fresh one.
//
// A user without a grant sees a plain not-found. Not a disabled page, not an
// explanation — the agent does not exist for them.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PortalShell from "@/components/portal/Shell";
import AgentPanel from "@/components/agent/panel/AgentPanel";
import { useAgentContext } from "@/components/agent/panel/useAgentContext";
import { C } from "@/components/agent/panel/tokens";

export default function AgentChat() {
  const [availability, setAvailability] = useState<"checking" | "yes" | "no">("checking");
  const context = useAgentContext();
  const params = useSearchParams();
  const conversationId = params?.get("c") ?? null;

  useEffect(() => {
    fetch("/api/assistant/availability", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => setAvailability(d?.available ? "yes" : "no"))
      .catch(() => setAvailability("no"));
  }, []);

  if (availability !== "yes") {
    return (
      <PortalShell crumb="" title="Not found" subtitle="">
        <div style={{ margin: "0 auto", maxWidth: 620, padding: "64px 32px", textAlign: "center", fontSize: 13.5, color: C.muted }}>
          {availability === "checking" ? "" : "This page does not exist."}
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell crumb="Assistant" title="" subtitle="" wide>
      <div style={{ height: "calc(100vh - 54px)", display: "flex", flexDirection: "column" }}>
        <AgentPanel open fullPage context={context} onClose={() => {}} initialConversationId={conversationId} />
      </div>
    </PortalShell>
  );
}
