"use client";

// Error cards (design spec §4.16). Each says what failed, what the agent did
// and did not conclude, and what to do next. A failed tool never produces a
// guessed answer for the part it could not read — the card is the gap.

import { mono } from "../ui/tokens";
import { Button, Icon, IconTile } from "../ui/primitives";
import { cw } from "@/lib/portal-tokens";

export type ErrorKind = "tool_failed" | "permission_denied" | "source_unavailable" | "model_unavailable" | "offline";

const KINDS: Record<ErrorKind, { label: string; icon: string; fg: string; tint: string; border: string }> = {
  tool_failed: { label: "Tool failed", icon: "plug-zap", fg: cw.warningText, tint: cw.warningTint, border: cw.warningBorder },
  permission_denied: { label: "Permission denied", icon: "lock", fg: cw.dangerText, tint: cw.dangerTint, border: cw.dangerBorder },
  source_unavailable: { label: "Source unavailable", icon: "cloud-off", fg: cw.warningText, tint: cw.warningTint, border: cw.warningBorder },
  model_unavailable: { label: "Model unavailable", icon: "circle-off", fg: cw.textMuted, tint: cw.bgHover, border: cw.border },
  offline: { label: "Offline", icon: "wifi-off", fg: cw.textMuted, tint: cw.bgPage, border: cw.border },
};

/** Map a tool error code / message to the four designed kinds. */
export function kindFor(error: string | null | undefined, message?: string | null): ErrorKind {
  const e = `${error ?? ""} ${message ?? ""}`;
  if (/NO_PERMISSION|403|forbidden/i.test(e)) return "permission_denied";
  if (/SERVICE_UNAVAILABLE|cached|EAD|timeout|unavailable/i.test(e) && /source|EAD|cached|AIP/i.test(e)) return "source_unavailable";
  if (/model|529|overloaded|throttl/i.test(e)) return "model_unavailable";
  return "tool_failed";
}

export function ErrorCard({
  kind, title, body, diagnostic, actions = [], panel = false,
}: {
  kind: ErrorKind; title: string; body: string; diagnostic?: string | null;
  actions?: Array<{ label: string; onClick?: () => void; href?: string; primary?: boolean }>;
  panel?: boolean;
}) {
  const k = KINDS[kind];
  return (
    <div role="alert" style={{ background: kind === "offline" ? cw.bgPage : cw.bgSurface, border: `1px solid ${k.border}`, borderRadius: 12, padding: panel ? 12 : "14px 16px", display: "flex", gap: 12 }}>
      <IconTile icon={k.icon} fg={k.fg} bg={k.tint} size={panel ? 26 : 30} iconSize={panel ? 14 : 16} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: panel ? 12 : 14, fontWeight: 700, color: panel ? k.fg : cw.text }}>{title}</div>
        {!panel && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: k.fg, textTransform: "uppercase" }}>{k.label}</div>}
        <div style={{ fontSize: panel ? 13 : 13.5, lineHeight: 1.55, color: cw.textBody }}>{body}</div>
        {diagnostic && <div style={{ ...mono({ fontSize: 11.5 }), color: cw.textMuted, whiteSpace: "pre-wrap" }}>{diagnostic}</div>}
        {actions.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            {actions.map((a) => a.href
              ? <a key={a.label} href={a.href} style={{ textDecoration: "none" }}><Button variant={a.primary ? "primary" : "secondary"} size="sm">{a.label}</Button></a>
              : <Button key={a.label} variant={a.primary ? "primary" : "secondary"} size="sm" onClick={a.onClick}>{a.label}</Button>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Offline (§4.16 panel variant) with the queued-question row. */
export function OfflineCard({ queued, panel = true }: { queued?: string[] | null; panel?: boolean }) {
  return (
    <div style={{ background: cw.bgPage, border: `1px solid ${cw.border}`, borderRadius: 12, padding: panel ? 12 : "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: cw.textMuted }}><Icon name="wifi-off" size={13} color={cw.textMuted} />Offline</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: cw.textBody }}>You&apos;re offline. Earlier replies stay readable; new questions queue and send when the connection returns. Nothing that changes data is queued.</div>
      {(queued ?? []).map((q, i) => (
        <div key={i} style={{ border: `1px dashed ${cw.borderControl}`, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: cw.textBody, display: "flex", gap: 8 }}>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>&ldquo;{q}&rdquo;</span><span style={{ fontWeight: 600 }}>Queued</span>
        </div>
      ))}
    </div>
  );
}
