// The panel's special states (§E12): first run, signed out, site not on the list, requesting, approved →
// enable, loading, offline, page changed, long selection, capture failed, and the quick-action explanation.
import { useState } from "react";
import { C, mono } from "@/components/agent/ui/tokens";
import { Button, Icon } from "@/components/agent/ui/primitives";
import { CONSOLE_HOST, CONSOLE_ORIGIN, LIMITS, SHORTCUTS } from "~/shared/config";
import { hmZ } from "~/shared/api";
import type { SessionState, SiteRequest } from "~/shared/protocol";

const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, ...extra });
const Title = ({ icon, color, children, right }: { icon: string; color: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name={icon} size={15} color={color} /><span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0 }}>{children}</span>{right}</div>
);
const Body = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}>{children}</div>;
const Row = ({ children }: { children: React.ReactNode }) => <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{children}</div>;

/** S1 — first run. Two steps done by the installation; the user acts only on the microphone. */
export function FirstRun({ session, mic, onAllowMic, onSkipMic }: { session: SessionState; mic: "pending" | "allowed" | "skipped" | "asking" | "denied"; onAllowMic: () => void; onSkipMic: () => void }) {
  const done = { bg: C.okWash, border: C.okBorder, dot: C.okDot, dotFg: C.surface };
  const todo = { bg: C.surface, border: C.border, dot: C.primaryTint2, dotFg: C.primaryHover };
  const info = { bg: C.surface, border: C.border, dot: C.hover, dotFg: C.body };
  const signedIn = session.status === "signed-in";
  const sites = session.sites?.approved.length ?? 0;
  const Step = ({ s, icon, title, body, action }: { s: typeof done; icon: string; title: string; body: React.ReactNode; action?: React.ReactNode }) => (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 11, padding: "10px 12px", display: "flex", gap: 11, alignItems: "flex-start" }}>
      <span style={{ width: 22, height: 22, borderRadius: "50%", background: s.dot, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={12} color={s.dotFg} /></span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span><span style={{ fontSize: 11.5, lineHeight: 1.45, color: C.muted }}>{body}</span>{action && <div style={{ marginTop: 6 }}>{action}</div>}</div>
    </div>
  );
  return (
    <div data-state="first-run" style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 4 }}>
      <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.01em" }}>Clearway in any tab</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.muted }}>Ask about what's on screen without switching to the console. The agent only sees what you send it.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {signedIn ? <Step s={done} icon="check" title={`Signed in as ${session.user?.name ?? "you"}`} body={`From your console session on ${CONSOLE_HOST}.`} /> : <SignedOut session={session} compact onOpenConsole={() => chrome.tabs.create({ url: `${CONSOLE_ORIGIN}/login` })} onConnect={() => {}} />}
        <Step s={done} icon="check" title={`${sites} site${sites === 1 ? "" : "s"} approved by Clearway`} body="Leon, company mail, AIP portals and handlers. On other sites you can capture or paste." />
        <Step s={mic === "allowed" ? done : todo} icon={mic === "allowed" ? "check" : "mic"} title="Microphone" body={mic === "allowed" ? "Allowed for the extension. Pages never get microphone access." : mic === "denied" ? "Chrome blocked the microphone for the extension. Allow it in the extension's site settings, or skip voice for now." : "Asked once, for the extension, not per site. Audio is transcribed and discarded."}
          action={mic !== "allowed" ? <Row><Button variant="primary" size="sm" onClick={onAllowMic} disabled={mic === "asking"} spinning={mic === "asking"}>Allow microphone</Button><Button variant="ghost" size="sm" onClick={onSkipMic}>Not now</Button></Row> : undefined} />
        <Step s={info} icon="keyboard" title="Shortcuts" body={<>{SHORTCUTS.panel} panel · {SHORTCUTS.talk} talk · {SHORTCUTS.capture} capture · {SHORTCUTS.selection} ask about selection. Change them in Chrome.</>} />
      </div>
    </div>
  );
}

/** S2 — signed out (and the disconnected / unreachable variants). */
export function SignedOut({ session, onOpenConsole, onConnect, compact = false }: { session: SessionState; onOpenConsole: () => void; onConnect: () => void; compact?: boolean }) {
  const disconnected = session.status === "disconnected"; const unreachable = session.status === "unreachable";
  return (
    <div data-state={session.status} style={card()}>
      <Title icon={unreachable ? "cloud-off" : "log-out"} color={C.body}>{disconnected ? "Disconnected from Clearway" : unreachable ? "Can't reach Clearway" : "Sign in to Clearway"}</Title>
      <Body>{disconnected ? `You disconnected the extension. Your console session is untouched — connect again to carry on as ${session.user?.name ?? "yourself"}.` : unreachable ? `${CONSOLE_HOST} didn't answer${session.error ? ` (${session.error})` : ""}. The panel keeps trying.` : `The extension uses your console sign-in. Sign in at ${CONSOLE_HOST} and this panel connects on its own.`}</Body>
      <Row>{disconnected ? <Button variant="primary" size="sm" onClick={onConnect}>Connect</Button> : <Button variant="primary" size="sm" onClick={onOpenConsole}>Open console sign-in</Button>}{!disconnected && !compact && <Button variant="ghost" size="sm" onClick={onConnect}>Check again</Button>}</Row>
      {!disconnected && <div style={{ fontSize: 11.5, color: C.faint }}>Nothing you select or capture is kept while you're signed out.</div>}
    </div>
  );
}

/** S3 — the site is not on the list. */
export function NotOnList({ host, onRequest, onCapture }: { host: string; onRequest: () => void; onCapture: () => void }) {
  return (
    <div data-state="not-on-list" style={card()}>
      <Title icon="circle-slash" color={C.warn}>{host} isn't on Clearway's site list</Title>
      <Body>The agent can't read selections or pages here. You can still capture a region ({SHORTCUTS.capture} or right-click), paste text, or ask something general.</Body>
      <Row><Button variant="primary" size="sm" onClick={onRequest}>Request this site</Button><Button variant="secondary" size="sm" onClick={onCapture}>Capture region</Button></Row>
    </div>
  );
}

/** S4 — requesting a site: confirmation-style card; "Why" is required, 10–200 characters. */
export function RequestSite({ host, title, admins, onSend, onCancel, busy, error }: { host: string; title: string; admins: { name: string; email: string }[]; onSend: (reason: string, includeSubdomains: boolean) => void; onCancel: () => void; busy: boolean; error: string | null }) {
  const [reason, setReason] = useState(title.slice(0, 200));
  const [subs, setSubs] = useState(false);
  const ok = reason.trim().length >= 10 && reason.trim().length <= 200;
  const label = (k: string, v: React.ReactNode) => (<><span style={{ color: C.muted }}>{k}</span><span style={{ minWidth: 0 }}>{v}</span></>);
  return (
    <div data-state="request-site" style={{ background: C.surface, border: `1.5px solid ${C.primary}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ background: C.primaryTint3, borderBottom: `1px solid ${C.primaryLine}`, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}><Icon name="send" size={15} color={C.primaryHover} /><span style={{ fontSize: 14, fontWeight: 700, color: C.primaryHover }}>Request {host}</span></div>
      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "64px minmax(0,1fr)", rowGap: 9, columnGap: 12, fontSize: 13 }}>
        {label("Site", <span style={mono()}>{host}</span>)}
        {label("Scope", <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} />{subs ? `This site and its subdomains (*.${host})` : `This site only (not *.${host})`}</label>)}
        {label("Why", <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} aria-label="Why you need this site" maxLength={200} style={{ width: "100%", border: `1px solid ${ok || !reason ? C.borderControl : C.warnBorder}`, borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.4, outline: "none" }} />)}
        {label("Goes to", <span>Clearway admins{admins.length ? `: ${admins.map((a) => a.name).join(", ")}` : ""}</span>)}
      </div>
      {error && <div role="alert" style={{ padding: "0 12px 8px", fontSize: 12.5, color: C.danger }}>{error}</div>}
      <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.divider}`, background: C.page, display: "flex", alignItems: "center", gap: 8 }}>
        <Button variant="primary" size="sm" onClick={() => onSend(reason.trim(), subs)} disabled={!ok || busy} spinning={busy}>Send request</Button><span style={{ flex: 1 }} /><Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
      <div style={{ padding: "0 12px 10px", background: C.page, fontSize: 11.5, color: C.faint }}>Admins approve in the console under Admin → Agent sites. {reason.trim().length < 10 ? "Say why in at least 10 characters." : ""}</div>
    </div>
  );
}

export function RequestSent({ request }: { request: SiteRequest }) {
  return <div data-state="request-sent" style={card({ background: C.page, borderStyle: "dashed" })}><Title icon="clock" color={C.primaryHover}>Request sent · you'll see a badge when it's decided</Title><Body>{request.host} · sent {hmZ(request.requestedAt)}. Admins approve in the console under Admin → Agent sites.</Body></div>;
}
export function RequestDeclined({ request }: { request: SiteRequest }) {
  return <div data-state="request-declined" style={card()}><Title icon="circle-slash" color={C.muted}>Request declined{request.decidedBy ? ` by ${request.decidedBy}` : ""}</Title>{request.note ? <Body>“{request.note}”</Body> : null}<div style={{ fontSize: 11.5, color: C.faint }}>{request.host} · {request.decidedAt ? hmZ(request.decidedAt) : ""}. You can still capture a region here.</div></div>;
}

/** S4b — approved by the organisation; Chrome still asks the user. Two steps, by design. */
export function ApprovedEnable({ host, approvedBy, approvedAt, onEnable, denied }: { host: string; approvedBy: string | null; approvedAt: string | null; onEnable: () => void; denied: boolean }) {
  return (
    <div data-state="approved-enable" style={card()}>
      <Title icon="circle-check" color={C.okDot} right={approvedAt ? <span style={{ ...mono({ fontSize: 11 }), color: C.faint }}>{hmZ(approvedAt)}</span> : null}>{host} approved</Title>
      <Body>Approved{approvedBy ? ` by ${approvedBy}` : ""}. Chrome will ask you to allow access to this one site.{denied ? " You didn't allow it — the button is still here when you're ready." : ""}</Body>
      <Row><Button variant="primary" size="sm" onClick={onEnable}>Enable on this site</Button></Row>
    </div>
  );
}

/** S5 — loading: the connecting chip and four skeleton lines. */
export function Loading() {
  return (
    <div data-state="loading" aria-busy style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 10px" }}><span className="ag-pulse-1000" style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary }} />Connecting to Clearway…</span>
      {[80, 62, 90, 48].map((w) => <div key={w} className="ag-pulse-1200" style={{ height: 12, width: `${w}%`, borderRadius: 4, background: C.hover }} />)}
    </div>
  );
}

export function Banner({ icon, title, body, tone = "neutral" }: { icon: string; title: string; body: React.ReactNode; tone?: "neutral" | "warn" }) {
  const fg = tone === "warn" ? C.warn : C.body, bg = tone === "warn" ? C.warnTint : C.hover, border = tone === "warn" ? C.warnBorder : C.border;
  return <div role="status" style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}><Icon name={icon} size={15} color={fg} style={{ marginTop: 2 }} /><div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.body }}><b style={{ color: fg }}>{title}</b> {body}</div></div>;
}
/** S6 — offline (§3 rule 11: questions queue, nothing that changes data does). */
export const OfflineBanner = ({ queued }: { queued: number }) => <Banner icon="wifi-off" title="You're offline." body={<>Earlier replies stay readable. Questions queue and send when you're back; captures and selections are kept with them. Nothing that changes data is queued.{queued ? ` ${queued} queued.` : ""}</>} />;
/** S9 — the page changed while an answer streams. */
export const PageChanged = ({ title, at }: { title: string; at: string }) => <Banner icon="history" tone="warn" title="You've moved on from the page this answer is about." body={<>It's about the selection you sent from “{title}” at {hmZ(at)}. The page you're on now hasn't been shared.</>} />;

/** S10 — a very long selection, before anything is sent. */
export function LongSelection({ chars, onPage, onTrim, onCancel, canPage }: { chars: number; onPage: () => void; onTrim: () => void; onCancel: () => void; canPage: boolean }) {
  return (
    <div data-state="long-selection" style={card({ border: `1px solid ${C.warnBorder}` })}>
      <Title icon="triangle-alert" color={C.warn} right={<span style={{ ...mono({ fontSize: 11 }), color: C.warn }}>{chars.toLocaleString("en-GB")} chars</span>}>That's a long selection</Title>
      <Body>The agent reads up to {LIMITS.selectionChars.toLocaleString("en-GB")} characters of a selection. For this much, send the page instead: it keeps the headings, so answers can say where things are.</Body>
      <Row>{canPage && <Button variant="primary" size="sm" onClick={onPage}>Send the page instead</Button>}<Button variant="secondary" size="sm" onClick={onTrim}>Send first {LIMITS.selectionChars.toLocaleString("en-GB")}</Button><Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button></Row>
      {!canPage && <div style={{ fontSize: 11.5, color: C.faint }}>Sending the page needs an approved site.</div>}
    </div>
  );
}

/** S11 — capture failed. */
export function CaptureFailed({ reason, diagnostic, onPaste, onAttach, onRetry, onDismiss }: { reason: string; diagnostic: string; onPaste: () => void; onAttach: () => void; onRetry: () => void; onDismiss: () => void }) {
  const changed = reason === "tab-changed"; const upload = reason === "upload"; const gesture = reason === "no-gesture";
  return (
    <div data-state="capture-failed" style={{ background: C.surface, border: `1px solid ${C.dangerBorder}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: C.dangerTint, borderBottom: `1px solid ${C.dangerBorder}`, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.danger }}><Icon name="scan" size={13} color={C.danger} />CAPTURE FAILED<span style={{ flex: 1 }} /><button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ border: "none", background: "transparent", cursor: "pointer", display: "inline-flex" }}><Icon name="x" size={12} color={C.danger} /></button></div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{changed ? "The tab changed before the capture finished" : upload ? "The capture couldn't be sent" : gesture ? "Capture from the page, not from here" : "Couldn't capture this tab"}</span>
        <Body>{changed ? "Try again once the page has settled." : upload ? "The image didn't reach Clearway. Try again, or paste a screenshot." : gesture ? `Chrome only lets the extension capture a tab after you act on it: press ${SHORTCUTS.capture} on the page, right-click → Capture region, or open the panel from the toolbar icon on that tab.` : "Chrome doesn't let extensions capture chrome:// pages or the Web Store. Take a screenshot and paste it here, or attach the file."}</Body>
        <span style={{ ...mono({ fontSize: 11 }), color: C.faint, overflowWrap: "anywhere" }}>{diagnostic}</span>
        <Row>{changed || upload ? <Button variant="primary" size="sm" onClick={onRetry}>Try again</Button> : gesture ? <Button variant="primary" size="sm" onClick={onDismiss}>OK</Button> : <Button variant="primary" size="sm" onClick={onPaste}>Paste a screenshot</Button>}{!gesture && <Button variant="secondary" size="sm" onClick={onAttach}>Attach a file</Button>}</Row>
      </div>
    </div>
  );
}

/** §E7 — the first time an address is recognised: say what was used, and that the page was not read. */
export function RecognisedCard({ body }: { body: string }) {
  return <div data-state="recognised" style={card({ background: C.page })}><Title icon="link" color={C.muted}>Recognised from the address only</Title><Body>{body}</Body></div>;
}
