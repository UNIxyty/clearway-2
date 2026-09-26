// The tab bar (§E5): which site, its status, what can be sent from it — and the line that says nothing is
// shared until the user sends it. Replaces the console's context chip, which would be untrue here.
import { useEffect, useState } from "react";
import { C, mono } from "@/components/agent/ui/tokens";
import { Icon } from "@/components/agent/ui/primitives";
import type { QuickAction, SiteStatus, TabInfo } from "~/shared/protocol";
import { hmZ } from "~/shared/api";
import { SHORTCUTS } from "~/shared/config";

const STATUS: Record<SiteStatus, { label: string; icon: string; fg: string; bg: string; border: string }> = {
  approved: { label: "Approved site", icon: "circle-check", fg: C.ok, bg: C.okTint, border: C.okBorder },
  "not-on-list": { label: "Not on the list", icon: "circle-slash", fg: C.warn, bg: C.warnTint, border: C.warnBorder },
  requested: { label: "Requested", icon: "clock", fg: C.primaryHover, bg: C.primaryTint2, border: C.primaryBorder },
  "approved-pending-enable": { label: "Requested", icon: "clock", fg: C.primaryHover, bg: C.primaryTint2, border: C.primaryBorder },
  chrome: { label: "Chrome page", icon: "circle-off", fg: C.muted, bg: C.hover, border: C.border },
  unknown: { label: "Chrome page", icon: "circle-off", fg: C.muted, bg: C.hover, border: C.border },
};

export type QuickRow = { eyebrow: string; entity: string; actions: QuickAction[]; onAction: (a: QuickAction) => void } | null;

export function TabBar({ tab, selectionHas, requestedAt, onSend, quick, blockedNote }: { tab: TabInfo; selectionHas: boolean; requestedAt?: string | null; onSend: (kind: "selection" | "region" | "page") => void; quick: QuickRow; blockedNote?: string | null }) {
  const st = STATUS[tab.status];
  const [fade, setFade] = useState(false);
  useEffect(() => { setFade(true); const t = setTimeout(() => setFade(false), 100); return () => clearTimeout(t); }, [tab.host, tab.path]); // X13
  const label = tab.status === "requested" || tab.status === "approved-pending-enable" ? `Requested${requestedAt ? ` ${hmZ(requestedAt)}` : ""}` : st.label;
  const approved = tab.status === "approved";
  const send = (kind: "selection" | "region" | "page", icon: string, label: string, disabled = false) => (
    <button key={kind} type="button" disabled={disabled} onClick={() => onSend(kind)} className="ag-focus"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: disabled ? C.faint : C.ink, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 7, padding: "5px 8px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, fontFamily: "inherit" }}>
      <Icon name={icon} size={12} color={disabled ? C.faint : C.body} />{label}
    </button>
  );
  return (
    <div data-tab-bar style={{ background: C.page, borderBottom: `1px solid ${C.divider}`, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, opacity: fade ? 0.4 : 1, transition: "opacity 100ms cubic-bezier(0.2,0,0,1)" }}>
        {tab.favIconUrl && !tab.favIconUrl.startsWith("chrome") ? <img src={tab.favIconUrl} alt="" width={15} height={15} style={{ borderRadius: 3, flex: "none" }} /> : <span style={{ width: 15, height: 15, borderRadius: 3, background: C.hover, flex: "none" }} />}
        <span title={tab.url} style={{ ...mono({ fontSize: 12 }), color: C.body, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab.host || tab.url}{tab.path}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: st.fg, background: st.bg, border: `1px solid ${st.border}`, borderRadius: 999, padding: "2px 8px 2px 6px", whiteSpace: "nowrap", flex: "none" }}><Icon name={st.icon} size={11} color={st.fg} />{label}</span>
      </div>
      {approved ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.faint, marginRight: 2 }}>SEND</span>
            {send("selection", "scan-text", "Selection", !selectionHas)}{send("region", "scan", "Region", tab.captureWorks === false)}{send("page", "file-text", "Page")}
          </div>
          <div style={{ fontSize: 11.5, color: C.faint }}>{tab.captureWorks === false ? `Nothing on this page is shared until you send it. Capture with ${SHORTCUTS.capture} or right-click → Capture region.` : "Nothing on this page is shared until you send it."}</div>
        </>
      ) : (
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.muted }}>
          {blockedNote ?? (tab.status === "chrome" || tab.status === "unknown" ? "Chrome doesn't let extensions read or capture its own pages." : `Clearway can't read this site. Capture still works with ${SHORTCUTS.capture} or right-click.`)}
        </div>
      )}
      {quick && quick.actions.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 9, display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: C.faint }}>{quick.eyebrow} · <span style={{ ...mono({ fontSize: 10.5, fontWeight: 700 }), color: C.body }}>{quick.entity}</span> · FROM THE ADDRESS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {quick.actions.map((a, i) => {
              const write = a.kind === "write";
              return <button key={a.id} type="button" onClick={() => quick.onAction(a)} className="ag-focus ag-fade-150" style={{ animationDelay: `${i * 30}ms`, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: write ? C.primaryHover : C.ink, background: C.surface, border: `1px solid ${write ? C.primaryBorder : C.borderControl}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}><Icon name={a.icon} size={12} color={write ? C.primaryHover : C.body} />{a.label}{write && !a.label.endsWith("…") ? "…" : ""}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
