// Extension settings (§E13): only what belongs to this browser. Everything organisation-wide stays in the console.
import { useEffect, useState } from "react";
import { C, mono } from "@/components/agent/ui/tokens";
import { Button, Icon, IconButton, Keycap, Toggle } from "@/components/agent/ui/primitives";
import { CONSOLE_ORIGIN } from "~/shared/config";
import type { SessionState, Settings as SettingsT } from "~/shared/protocol";
import { post } from "./useExtension";

const LABELS: Record<string, string> = { _execute_action: "Open the panel", "voice-toggle": "Talk", "capture-region": "Capture region", "ask-selection": "Ask about selection" };
const ORDER = ["_execute_action", "voice-toggle", "capture-region", "ask-selection"];
const pretty = (s: string) => s.replace("Alt", "⌥").replace("Shift", "⇧").replace("Command", "⌘").replace("MacCtrl", "⌃").replace("Ctrl", "⌃").replace(/\+/g, "") || "—";

export function SettingsView({ session, settings, setSettings, onBack, onDisconnect, micLevel }: { session: SessionState; settings: SettingsT; setSettings: (p: Partial<SettingsT>) => void; onBack: () => void; onDisconnect: () => void; micLevel: number | null }) {
  const [commands, setCommands] = useState<chrome.commands.Command[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [testing, setTesting] = useState(false);
  useEffect(() => { chrome.commands.getAll().then(setCommands).catch(() => {}); }, []);
  useEffect(() => { if (micLevel === -1) setTesting(false); }, [micLevel]);
  const approved = session.sites?.approved ?? []; const requests = (session.sites?.requests ?? []).filter((r) => r.status === "pending");
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.divider}`, display: "flex", flexDirection: "column", gap: 9 }}><div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: C.faint }}>{title}</div>{children}</div>;
  const RowEl = ({ label, desc, control, monoLabel = false }: { label: string; desc?: string; control?: React.ReactNode; monoLabel?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ ...(monoLabel ? mono({ fontSize: 12.5 }) : { fontSize: 13, fontWeight: 600 }), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>{desc && <span style={{ fontSize: 11.5, lineHeight: 1.45, color: C.muted }}>{desc}</span>}</div>
      {control}
    </div>
  );
  const Link = ({ label, onClick }: { label: string; onClick: () => void }) => <button type="button" onClick={onClick} className="ag-focus" style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.primaryHover, background: "transparent", border: "none", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}>{label}</button>;
  const Tag = ({ text, fg, bg }: { text: string; fg: string; bg: string }) => <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: fg, background: bg, borderRadius: 5, padding: "2px 6px" }}>{text}</span>;
  return (
    <div data-view="settings" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ height: 48, flex: "none", display: "flex", alignItems: "center", gap: 6, padding: "0 8px 0 10px", borderBottom: `1px solid ${C.divider}` }}><IconButton icon="arrow-left" title="Back" onClick={onBack} /><span style={{ fontSize: 14.5, fontWeight: 700 }}>Extension settings</span></div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <Group title="SHORTCUTS">
          {ORDER.map((name) => { const c = commands.find((x) => x.name === name); return <RowEl key={name} label={LABELS[name]} control={<Keycap>{pretty(c?.shortcut ?? "")}</Keycap>} />; })}
          <RowEl label="Change shortcuts" desc="Chrome manages these at chrome://extensions/shortcuts." control={<Link label="Open ↗" onClick={() => chrome.tabs.create({ url: "chrome://extensions/shortcuts" })} />} />
        </Group>
        <Group title="ON THIS COMPUTER">
          <RowEl label='Show "Ask Clearway" when I select text' control={<Toggle on={settings.pill} onChange={(v) => setSettings({ pill: v })} label="Selection pill" />} />
          <RowEl label="System notifications" desc="Confirmations waiting and finished jobs, when Chrome isn't focused." control={<Toggle on={settings.notifications} onChange={(v) => setSettings({ notifications: v })} label="System notifications" />} />
          <RowEl label="Microphone" desc={settings.mic === "allowed" ? "Allowed for the extension." : settings.mic === "skipped" ? "Not asked yet. Press ⌥⇧Space or Test to allow it once." : "Not allowed yet."} control={testing ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.muted }}><span style={{ width: 60, height: 6, borderRadius: 3, background: C.hover, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.round(Math.max(0, Math.min(1, micLevel ?? 0)) * 100)}%`, background: C.primary, transition: "width 80ms linear" }} /></span>5 s</span> : <Link label="Test" onClick={() => { setTesting(true); post({ type: "panel.mic-test" }); setTimeout(() => chrome.runtime.sendMessage({ target: "offscreen", type: "mic.test" }).catch(() => setTesting(false)), 400); setTimeout(() => setTesting(false), 6500); }} />} />
        </Group>
        <Group title="SITES · SET BY CLEARWAY">
          {(showAll ? approved : approved.slice(0, 3)).map((s) => <RowEl key={s.host} label={s.host + (s.includeSubdomains ? " (+ subdomains)" : "")} monoLabel control={<Tag text="APPROVED" fg={C.ok} bg={C.okTint} />} />)}
          {approved.length > 3 && !showAll && <RowEl label={`+ ${approved.length - 3} more`} control={<Link label="Show all" onClick={() => setShowAll(true)} />} />}
          {approved.length === 0 && <span style={{ fontSize: 12.5, color: C.muted }}>No sites approved yet.</span>}
          {requests.map((r) => <RowEl key={r.id} label={r.host} monoLabel control={<Tag text="REQUESTED" fg={C.primaryHover} bg={C.primaryTint2} />} />)}
        </Group>
        <Group title="ACCOUNT">
          <RowEl label={session.user?.name ?? "Not signed in"} desc="From your console session." control={session.status === "signed-in" ? <Link label="Disconnect" onClick={onDisconnect} /> : undefined} />
          <RowEl label="Agent settings, reply mode, roles" control={<Link label="Console ↗" onClick={() => chrome.tabs.create({ url: `${CONSOLE_ORIGIN}/agent/settings` })} />} />
        </Group>
        <div style={{ padding: "12px 14px", fontSize: 11.5, color: C.faint, display: "flex", gap: 6, alignItems: "flex-start" }}><Icon name="info" size={12} color={C.faint} style={{ marginTop: 2 }} /><span>Web search, write actions, email, approving sites and the Activity log stay in the console. Chrome doesn't allow an "open automatically" setting.</span></div>
        <div style={{ padding: "0 14px 14px" }}><Button variant="ghost" size="xs" onClick={onBack}>Back to the thread</Button></div>
      </div>
    </div>
  );
}
