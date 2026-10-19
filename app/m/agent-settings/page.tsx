"use client";

// Agent settings on a phone (Tier 2 › form): your own preferences as toggles (agent.settings.own), the capabilities
// for admins (agent.settings.manage), and the model routing as a read-only row — the routing table is wide and is
// changed on a desk.
import { useMemo } from "react";
import { useIdentity } from "@/components/portal/Shell";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Form, T2Page, type T2FormGroup } from "@/components/m/tier2";
import { agentUrl, getJson, useAction, useResource } from "@/lib/m/t2";

type Me = { prefs?: { defaultTier?: string | null; skipConfirm?: boolean; skipConfirmRequested?: boolean; skipLocked?: boolean; skipLockedForAll?: boolean }; lowRiskActions?: string[] };
type Org = { capabilities?: Array<{ key: string; label: string; description?: string; enabled: boolean }>; canEdit?: boolean };
type Routing = { tiers?: unknown[]; canEdit?: boolean };

export default function AgentSettingsPhonePage() {
  usePhonePage({ title: "Agent settings", tab: "agent" });
  const { role } = useIdentity();
  const me = useResource<Me>(agentUrl("/settings/me"), { fallback: "The agent did not answer." });
  const org = useResource<Org>(agentUrl("/settings"), { fallback: "The agent did not answer." });
  const routing = useResource<Routing>(role === "admin" ? agentUrl("/settings/routing") : null);
  const act = useAction("Not saved. Try again.");
  const setMine = (patch: Record<string, unknown>) => act.run("me", async () => { await getJson(agentUrl("/settings/me"), { method: "PATCH", json: patch }); await me.reload(); });
  const setCap = (key: string, enabled: boolean) => act.run(key, async () => { await getJson(agentUrl("/settings"), { method: "PATCH", json: { key, enabled } }); org.setData((d) => (d ? { ...d, capabilities: (d.capabilities ?? []).map((c) => (c.key === key ? { ...c, enabled } : c)) } : d)); });
  const groups = useMemo<T2FormGroup[]>(() => {
    const p = me.data?.prefs ?? {};
    const skipLocked = Boolean(p.skipLocked || p.skipLockedForAll);
    const g: T2FormGroup[] = [{ key: "mine", h: "YOURS", rows: [
      { key: "skip", title: "Skip the confirm for low-risk actions", sub: skipLocked ? "Locked by an admin: every action asks" : (me.data?.lowRiskActions?.length ? `${me.data.lowRiskActions.length} actions count as low risk` : "Reading and drafting, never sending"), toggle: { on: Boolean(p.skipConfirm) && !skipLocked, onChange: (v) => void setMine({ skipConfirm: v }), disabled: skipLocked || act.busy !== null } },
      { key: "tier", title: "Default model", sub: p.defaultTier ? `Tier ${p.defaultTier}` : "The agent chooses per question", readOnly: true },
    ], note: "What you ask the agent to change still shows you the change before it is made, unless you skip the confirm for low-risk actions." }];
    if (org.data?.capabilities?.length) g.push({ key: "caps", h: "CAPABILITIES", rows: org.data.capabilities.map((c) => ({ key: c.key, title: c.label, sub: c.description, toggle: { on: c.enabled, onChange: (v) => void setCap(c.key, v), disabled: !org.data?.canEdit || act.busy !== null } })), note: org.data.canEdit ? "For everyone who uses the agent." : "Shown as an admin set them." });
    if (role === "admin") g.push({ key: "routing", h: "MODEL ROUTING", rows: [{ key: "table", title: "Routing table", sub: routing.data?.tiers ? `${routing.data.tiers.length} tiers · read-only on the phone` : "Read-only on the phone", readOnly: true }], note: "The routing table is wide. Change it on a wider screen." });
    return g;
  }, [me.data, org.data, routing.data, role, act.busy]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <T2Page loading={me.loading && !me.data} error={me.error && !me.data ? me.error : null} empty={false} emptyCopy={["Agent not set up", "Ask an admin to turn it on."]} errorCopy={["Couldn’t load settings", "Nothing has changed."]} onRetry={me.reload}>
      {act.failed && <MError title="Not saved." icon="sliders-horizontal" onRetry={act.clear}>{act.failed}</MError>}
      <T2Form groups={groups} />
    </T2Page>
  );
}
