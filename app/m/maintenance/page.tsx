"use client";

// Maintenance on a phone (Tier 2 › form, built with Tier 1 care): the one urgent admin action. A status card, then
// the switch: switching the portal OFF keeps the typed confirm (type OFF) and signs everyone out; switching it back
// on is one tap. The same calls as the desk (portal.maintenance.enable / .disable, the server decides who may).
import { useState } from "react";
import { usePhonePage } from "@/components/m/chrome";
import { InputSheet } from "@/components/m/pick";
import { MButton, MError } from "@/components/m/ui";
import { T2Form, T2Page } from "@/components/m/tier2";
import { dayTime, getJson, useAction, useResource } from "@/lib/m/t2";

type State = { enabled: boolean; message?: string | null; eta_text?: string | null; updated_at?: string | null; since?: string | null; by?: string | null; lastEnded?: { at?: string; by?: string } | null; can?: { enable?: boolean; disable?: boolean; clearCache?: boolean } };

export default function MaintenancePhonePage() {
  usePhonePage({ title: "Maintenance", subtitle: "The whole portal", tab: "more" });
  const r = useResource<State>("/api/admin/maintenance", { poll: 15_000, fallback: "The server did not answer." });
  const act = useAction("The switch did not go through. Try again.");
  const [confirming, setConfirming] = useState(false);
  const s = r.data;
  const switchOff = (typed: string) => { if (typed.trim().toUpperCase() !== "OFF") { return; } void act.run("off", async () => { await getJson("/api/admin/maintenance", { json: { enabled: true, message: null, eta_text: null } }); setConfirming(false); await r.reload(); }); };
  const switchOn = () => act.run("on", async () => { await getJson("/api/admin/maintenance", { json: { enabled: false, message: null, eta_text: null } }); await r.reload(); });
  if (r.status === 401 || r.status === 403) return <MError title="Maintenance is for admins" icon="power">Ask an admin if the portal needs switching off.</MError>;
  return (
    <T2Page loading={r.loading && !s} error={r.error && !s ? r.error : null} empty={false} emptyCopy={["", ""]} errorCopy={["Couldn’t read the portal’s state", "Don’t switch anything until this loads."]} onRetry={r.reload}>
      {r.error && s && <MError stale title="Not updating." onRetry={r.reload}>Showing the state from the last read.</MError>}
      {act.failed && <MError title="Not switched." icon="power" onRetry={act.clear}>{act.failed}</MError>}
      {s && (
        <T2Form groups={[{ key: "portal", h: "PORTAL", rows: [], status: s.enabled
            ? { tone: "bad", title: "Portal is off", line: `Everyone sees the maintenance page. Since ${dayTime(s.since ?? s.updated_at)}${s.by ? ` by ${s.by}` : ""}.${s.message ? ` “${s.message}”` : ""}${s.eta_text ? ` Back: ${s.eta_text}.` : ""}` }
            : { tone: "ok", title: "Portal is on", line: `Everyone can sign in.${s.lastEnded?.at ? ` Last switched on ${dayTime(s.lastEnded.at)}${s.lastEnded.by ? ` by ${s.lastEnded.by}` : ""}.` : ""}` },
          note: s.enabled ? "Switching on opens the portal on the next page load for everyone." : "Switching off signs everyone out, stops the wall console and shows a maintenance page. You’ll type OFF to confirm. The ops-room screen keeps running on its own data.",
          ...(s.enabled ? {} : { danger: s.can?.enable ? { label: "Switch the portal off", onClick: () => setConfirming(true), disabled: act.busy !== null } : undefined }) }]} />
      )}
      {s?.enabled && (s.can?.disable ? <MButton kind="primary" icon="power" onClick={() => void switchOn()} disabled={act.busy !== null}>{act.busy === "on" ? "Switching on…" : "Switch the portal on"}</MButton> : <span className="px-0.5 text-[13px] text-cw-text-muted">Switching it on needs the maintenance permission.</span>)}
      {s && !s.enabled && !s.can?.enable && <span className="px-0.5 text-[13px] text-cw-text-muted">Switching the portal off is a developer action.</span>}
      <InputSheet open={confirming} onClose={() => setConfirming(false)} title="Switch the portal off?" subtitle="Everyone is signed out. The wall console stops. The maintenance page shows until it is switched on again." label="Type OFF to confirm" value="" placeholder="OFF" onSave={switchOff} busy={act.busy === "off"} failed={act.failed} saveLabel="Switch off" autoComplete="off" />
    </T2Page>
  );
}
