"use client";

// A flight's passengers on a phone (mobile Stage 4): the one shared viewer (shared/passenger-viewer.jsx) in the
// phone shell — names first, hold a passenger for one second to see their document, which covers the list, closes
// after 30 seconds and is logged with the viewer's name. The data comes from the agent's two endpoints and is never
// cached here. Nothing of a passenger is in the URL: the flight id is the wall's, the passenger id Leon's contact nid.
import { useMemo } from "react";
import { useParams } from "next/navigation";
import MaskIcon from "@/components/portal/Icon";
import { useIdentity } from "@/components/portal/Shell";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import PassengerViewer from "@/shared/passenger-viewer.jsx";
import { AGENT_BASE } from "@/components/agent/types";
import { ShownError } from "@/lib/error-text";
import { useWallBoard } from "@/lib/m/wall";

async function agentJson<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${AGENT_BASE}/api${path}`, { credentials: "same-origin", cache: "no-store", ...init });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) { const e = new ShownError(typeof j?.message === "string" ? j.message : `The agent answered ${r.status}.`) as ShownError & { shown: boolean; status: number }; e.shown = true; e.status = r.status; throw e; }
  return j as T;
}

export default function PassengersPhonePage() {
  const { id } = useParams<{ id: string }>();
  const flightId = decodeURIComponent(String(id));
  const { display, email, hasAgent, agentKnown } = useIdentity();
  const { flights } = useWallBoard();
  const f = useMemo(() => (flights ?? []).find((x) => x.id === flightId) ?? null, [flights, flightId]);
  usePhonePage({ title: "Passengers", subtitle: f ? `${f.callsign} · ${f.adep} → ${f.ades}` : null, monoSubtitle: true, back: `/m/flights/${encodeURIComponent(flightId)}`, tab: "flights", actions: [{ icon: "scroll-text", label: "Who viewed documents", href: "/m/activity?filter=changes" }] });
  const api = useMemo(() => ({
    list: () => agentJson<unknown>(`/flights/${encodeURIComponent(flightId)}/passengers`),
    reveal: (pid: string) => agentJson<unknown>(`/flights/${encodeURIComponent(flightId)}/passengers/${encodeURIComponent(pid)}/reveal`, { method: "POST" }),
  }), [flightId]);
  const icon = (name: string, size: number, color?: string) => <MaskIcon name={name} size={size} color={color ?? "currentColor"} />;
  if (agentKnown && !hasAgent) return <MError title="Passengers need the Ops Agent" icon="users">The passenger list is read through the agent, which is not enabled for you. Ask an admin.</MError>;
  return (
    <div className="flex min-h-full flex-col px-4 pb-6 pt-3">
      <PassengerViewer api={api} viewer={{ name: display || email || "Viewer" }} phone icon={icon} />
    </div>
  );
}
