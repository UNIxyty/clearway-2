"use client";

// The side panel as a page, for hosts that are not the portal shell — today the
// wall console (a separate app) frames it at /agent/panel (design spec §6.14:
// the agent is available on the console, never on the wall display). Same
// origin, same session cookie, same AgentPanel; the host talks to it with the
// four postMessage types listed in opsboard-react/src/components/console/AgentDock.jsx.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useIdentity } from "@/components/portal/Shell";
import AgentPanel from "../panel/AgentPanel";
import AgentStyles from "../ui/AgentStyles";
import { C } from "../ui/tokens";
import type { AgentContext } from "../types";
import { matches as matchesBind, useKeybinds } from "../ui/keybinds";

function parseContext(raw: string | null): AgentContext | null {
  if (!raw) return null;
  try { const c = JSON.parse(raw); return c && typeof c === "object" && typeof c.label === "string" ? (c as AgentContext) : null; } catch { return null; }
}

export default function EmbeddedPanel() {
  const params = useSearchParams();
  const { initials, hasAgent } = useIdentity();
  const kb = useKeybinds();
  const openBind = kb.binds.open, os = kb.os;
  const [context, setContext] = useState<AgentContext | null>(() => parseContext(params.get("context")));
  const openWith = useMemo(() => params.get("open") || null, [params]);
  const tell = (msg: Record<string, unknown>) => { if (window.parent !== window) window.parent.postMessage(msg, window.location.origin); };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "cw-agent-context") setContext(parseContext(JSON.stringify(e.data.context)));
      if (e.data.type === "cw-agent-voice") window.dispatchEvent(new CustomEvent("cw-agent-voice", { detail: { on: Boolean(e.data.on) } }));
    };
    const onKey = (e: KeyboardEvent) => { if (matchesBind(e, openBind, os)) { e.preventDefault(); tell({ type: "cw-agent-toggle" }); } };
    window.addEventListener("message", onMessage); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("message", onMessage); window.removeEventListener("keydown", onKey); };
  }, [openBind, os]);

  // No grant → nothing renders, and the host is told so it hides its dock.
  useEffect(() => { if (!hasAgent) return; }, [hasAgent]);
  if (!hasAgent) return null;

  return (
    <div style={{ height: "100vh", display: "flex", background: C.surface, fontFamily: "inherit" }}>
      <AgentStyles />
      <AgentPanel open embedded onClose={() => tell({ type: "cw-agent-closed" })} context={context} initials={initials} initialConversationId={openWith} />
    </div>
  );
}
