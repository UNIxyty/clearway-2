// The passenger viewer — ONE implementation, two places (mobile Stage 4, 2026-10-20): the portal's phone page
// (/m/flights/[id]/passengers) and the wall console's Flights panel both render this. Plain React, no framework
// imports; colours only through the portal's tokens (--cw-*, --ca-sens-*), so it follows light and dark in both.
//
// The rules it keeps (the build brief, "not negotiable"):
//   1. Masked by default: the list shows names, nationality and sex; nothing else is on the page.
//   2. One passenger at a time: the open one covers (phone) or expands (desk); opening another closes the first.
//   3. Revealing is a permission and is logged — the endpoint's job; this only asks, and says so on the screen.
//   4. Fetched on reveal: document fields arrive only from api.reveal(), never with the list, never hidden by CSS.
//   5. Nothing of a passenger reaches a URL, a log line or an error message from here.
//   6. Copy all details is a reveal: it calls the same api.reveal() and so is logged the same way.
// Plus: the view closes itself after `seconds` (30 everywhere — intake's reveal was brought to the same number),
// the watermark carries the viewer's name and the UTC time, and when the app leaves the foreground names blur and
// any open document closes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const hhmmss = (d) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
const SEX = { M: "M", F: "F", MALE: "M", FEMALE: "F" };

/** @param {{ api: { list: () => Promise<any>, reveal: (id: string) => Promise<any> }, viewer: { name: string }, phone?: boolean, icon: (name: string, size: number, color?: string) => any, seconds?: number, onState?: (s: string) => void }} props */
export default function PassengerViewer({ api, viewer, phone = false, icon, seconds = 30, onState }) {
  const [state, setState] = useState("loading"); // loading · ready · empty · error
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null); // { passenger, shownAt, left }
  const [opening, setOpening] = useState(null); // id being fetched
  const [revealError, setRevealError] = useState(null);
  const [hold, setHold] = useState(null); // id being held (phone)
  const [away, setAway] = useState(false);
  const [copied, setCopied] = useState(false);
  const holdTimer = useRef(null), tick = useRef(null);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try { const d = await api.list(); setData(d); setState((d.passengers ?? []).length ? "ready" : "empty"); }
    catch (e) { setError(e && e.shown ? e.message : "Couldn’t load passengers."); setState("error"); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onState?.(state); }, [state, onState]);

  const hide = useCallback(() => { setOpen(null); setCopied(false); if (tick.current) clearInterval(tick.current); tick.current = null; }, []);
  // The countdown: one second at a time, then the view closes itself.
  useEffect(() => {
    if (!open) return undefined;
    tick.current = setInterval(() => setOpen((o) => (o ? (o.left <= 1 ? null : { ...o, left: o.left - 1 }) : o)), 1000);
    return () => { if (tick.current) clearInterval(tick.current); tick.current = null; };
  }, [open?.passenger?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the foreground: names blur, the open document closes, the app switcher shows the cover.
  useEffect(() => {
    // The app switcher photographs the page as it leaves the foreground. Setting the attribute here is synchronous —
    // the stylesheet below blurs the list and hides the document in the same frame — and only then does React catch
    // up. pagehide / freeze / visibilitychange(hidden) / blur: whichever a phone fires first wins.
    const gone = () => { document.documentElement.setAttribute("data-pax-away", "1"); setAway(true); hide(); };
    const onVis = () => { if (document.visibilityState !== "visible") gone(); };
    document.addEventListener("visibilitychange", onVis); window.addEventListener("blur", gone);
    window.addEventListener("pagehide", gone); document.addEventListener("freeze", gone);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("blur", gone); window.removeEventListener("pagehide", gone); document.removeEventListener("freeze", gone); document.documentElement.removeAttribute("data-pax-away"); };
  }, [hide]);
  const back = useCallback(() => { document.documentElement.removeAttribute("data-pax-away"); setAway(false); }, []);

  const reveal = useCallback(async (p) => {
    setOpening(p.id); setRevealError(null);
    try { const r = await api.reveal(p.id); setOpen({ passenger: { ...p, ...r.passenger }, shownAt: r.shownAt ? new Date(r.shownAt) : new Date(), left: r.seconds ?? seconds }); }
    catch (e) { setRevealError(e && e.shown ? e.message : "Couldn’t open the document. Nothing was shown."); }
    finally { setOpening(null); }
  }, [api, seconds]);
  const copyAll = useCallback(async () => {
    if (!open) return;
    const p = open.passenger; // the same reveal, already logged; copying is the same act again, so ask the endpoint again
    try { await api.reveal(p.id); } catch { return; }
    const text = [`${p.surname} ${p.given}`, `Nationality ${p.nationality ?? ""}`, `Sex ${p.sex ?? ""}`, `Date of birth ${p.dateOfBirth ?? ""}`, `Document ${p.documentCountry ?? ""} ${p.documentNumber ?? ""}`, `Expires ${p.documentExpiry ?? ""}`].join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard refused: nothing copied */ }
  }, [api, open]);
  const down = (p) => { if (opening || open) return; setHold(p.id); clearTimeout(holdTimer.current); holdTimer.current = setTimeout(() => { setHold(null); void reveal(p); }, 1000); };
  const up = () => { clearTimeout(holdTimer.current); setHold(null); };

  const canReveal = data?.canReveal !== false;
  const stamp = useMemo(() => (open ? `${(viewer?.name || "Viewer").toUpperCase()} · ${hhmmss(open.shownAt)}Z` : ""), [open, viewer]);
  const sens = { tint: "var(--ca-sens-tint)", border: "var(--ca-sens-border)", text: "var(--ca-sens-text)", solid: "var(--ca-sens-solid)", onSolid: "var(--ca-sens-on-solid)" };
  const strip = canReveal
    ? { icon: "lock", color: sens.text, bg: sens.tint, bd: sens.border, text: phone ? `Hold a passenger for 1 second to see their document. It covers the list, closes after ${seconds} seconds, and is logged with your name.` : `Documents stay hidden. Open one passenger at a time; it closes after ${seconds} seconds and the view is logged with your name.` }
    : { icon: "users", color: "var(--cw-text-muted)", bg: "var(--cw-bg-sunken)", bd: "var(--cw-border)", text: "Your role shows names and seats. Document details aren’t part of it; an admin can add “Reveal a passenger’s personal data” under Permissions." };
  const card = { border: "1px solid var(--cw-border)", borderRadius: 14, background: "var(--cw-bg-surface)", overflow: "hidden", position: "relative" };

  return (
    <div data-passenger-viewer={phone ? "phone" : "desk"} style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative", minHeight: phone ? "100%" : undefined, fontFamily: "inherit", color: "var(--cw-text)" }}>
      <style>{`html[data-pax-away] [data-pax-list]{filter:blur(7px)!important}html[data-pax-away] [data-pax-doc]{visibility:hidden!important}`}</style>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, background: strip.bg, border: `1px solid ${strip.bd}` }}>
        <span style={{ marginTop: 2, flex: "none", display: "flex" }}>{icon(strip.icon, 16, strip.color)}</span>
        <span style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--cw-text-body)" }}>{strip.text}</span>
      </div>

      {state === "loading" && (
        <div role="status" aria-label="Loading passengers" aria-busy="true" style={card}>
          {["60%", "48%", "66%", "52%", "58%", "44%"].map((w, i) => <div key={i} style={{ height: 64, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", borderTop: i ? "1px solid var(--cw-divider)" : "none" }}><span style={{ width: 28, height: 14, borderRadius: 4, background: "var(--cw-skeleton)" }} /><span className="cw-skel" style={{ width: w, height: 12, borderRadius: 4, background: "var(--cw-skeleton)" }} /></div>)}
        </div>
      )}
      {state === "empty" && (
        <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}>
          {icon("users", 26, "var(--cw-text-muted)")}
          <span style={{ fontSize: 17, fontWeight: 700 }}>No passengers in Leon yet</span>
          <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--cw-text-body)" }}>{data?.note || "The operator usually sends the list a few hours before departure."}</span>
        </div>
      )}
      {state === "error" && (
        <div role="alert" style={{ padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}>
          {icon("cloud-off", 26, "var(--cw-danger-text)")}
          <span style={{ fontSize: 17, fontWeight: 700 }}>Couldn’t load passengers</span>
          <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--cw-text-body)" }}>{error} Nothing is cached on this device, on purpose.</span>
          <button type="button" onClick={() => void load()} style={{ marginTop: 6, height: 48, padding: "0 20px", borderRadius: 12, border: "none", background: "var(--cw-primary)", color: "var(--cw-text-on-primary)", fontSize: 15, fontWeight: 650, fontFamily: "inherit", cursor: "pointer" }}>Try again</button>
        </div>
      )}

      {state === "ready" && data && (
        <>
          <div style={card}>
            <div data-pax-list="" style={{ filter: away ? "blur(7px)" : "none" }} aria-hidden={away || undefined}>
              {data.passengers.map((p, i) => { const isOpen = open?.passenger?.id === p.id; return (
                <div key={p.id} style={{ borderTop: i ? "1px solid var(--cw-divider)" : "none", background: isOpen ? "var(--cw-bg-surface)" : "transparent", boxShadow: isOpen ? `inset 3px 0 0 ${sens.solid}` : "none" }}>
                  <div style={{ minHeight: phone ? 64 : 46, display: "grid", gridTemplateColumns: canReveal ? "34px minmax(0,1fr) auto" : "34px minmax(0,1fr)", gap: "4px 12px", alignItems: "center", padding: phone ? "6px 8px 6px 14px" : "6px 14px" }}>
                    <span style={{ font: `600 13px ${MONO}`, color: "var(--cw-text-muted)" }}>{p.row}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><strong style={{ fontWeight: 750, letterSpacing: ".01em" }}>{p.surname}</strong> {p.given}</span>
                      <span style={{ font: `500 12.5px ${MONO}`, color: "var(--cw-text-muted)" }}>{[p.nationality, SEX[p.sex] ?? p.sex].filter(Boolean).join(" · ") || "—"}</span>
                    </span>
                    {canReveal && (phone ? (
                      <button type="button" aria-label={`Hold to show the document of ${p.surname}`} disabled={Boolean(open) || Boolean(opening)} onPointerDown={() => down(p)} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}
                        style={{ position: "relative", height: 44, minWidth: 76, padding: "0 12px", borderRadius: 12, border: `1.5px solid ${sens.border}`, background: "var(--cw-bg-surface)", color: sens.text, fontSize: 13.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden", cursor: "pointer", userSelect: "none", touchAction: "none", fontFamily: "inherit" }}>
                        <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: hold === p.id ? "100%" : "0%", background: sens.tint, transition: `width ${hold === p.id ? 1000 : 150}ms linear` }} />
                        <span style={{ position: "relative", display: "flex" }}>{icon("hand", 14)}</span><span style={{ position: "relative" }}>{opening === p.id ? "…" : "Hold"}</span>
                      </button>
                    ) : isOpen ? (
                      <button type="button" onClick={hide} aria-label={`Hide the document of ${p.surname}`} style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "none", background: sens.solid, color: sens.onSolid, fontSize: 12.5, fontWeight: 650, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit" }}>{icon("eye-off", 13)}Hide</button>
                    ) : (
                      <button type="button" onClick={() => void reveal(p)} disabled={Boolean(open) || Boolean(opening)} aria-label={`Show the document of ${p.surname}`} style={{ height: 30, padding: "0 10px", borderRadius: 8, border: `1px solid ${sens.border}`, background: "var(--cw-bg-surface)", color: sens.text, fontSize: 12.5, fontWeight: 650, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit" }}>{icon("eye", 13)}{opening === p.id ? "…" : "Show"}</button>
                    ))}
                  </div>
                  {!phone && isOpen && <Document open={open} stamp={stamp} seconds={seconds} icon={icon} sens={sens} onCopy={copyAll} copied={copied} inline />}
                </div>
              ); })}
            </div>
            {away && (
              <div style={{ position: "absolute", inset: 0, background: "var(--cw-bg-scrim)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div style={{ maxWidth: 320, background: "var(--cw-bg-raised)", border: "1px solid var(--cw-border)", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", boxShadow: "var(--cw-shadow-pop)" }}>
                  {icon("eye-off", 22, "var(--cw-text-muted)")}
                  <span style={{ fontSize: 16, fontWeight: 750 }}>Hidden while you were away</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--cw-text-body)" }}>{phone ? "The app left the screen, so names were covered and any open document was closed." : "This window lost focus, so names were blurred and any open document was closed."}</span>
                  <button type="button" onClick={back} style={{ marginTop: 4, height: 48, padding: "0 18px", borderRadius: 12, border: "none", background: "var(--cw-primary)", color: "var(--cw-text-on-primary)", fontSize: 15, fontWeight: 650, fontFamily: "inherit", cursor: "pointer" }}>Show names</button>
                </div>
              </div>
            )}
          </div>
          {revealError && <span role="alert" style={{ fontSize: 13.5, color: "var(--cw-danger-text)" }}>{revealError}</span>}
          <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--cw-text-muted)", padding: "0 2px" }}>{data.count} passenger{data.count === 1 ? "" : "s"}{data.crewCount ? ` · ${data.crewCount} crew` : ""} · from Leon{data.fetchedAt ? `, ${hhmmss(new Date(data.fetchedAt)).slice(0, 5)} UTC` : ""}{canReveal ? " · every document view is logged with your name" : ""}</span>
        </>
      )}

      {phone && open && !away && (
        <div role="dialog" data-pax-doc="" aria-label={`Document of ${open.passenger.surname}`} style={{ position: "fixed", inset: 0, zIndex: 40, background: "var(--mx-sheet, var(--cw-bg-surface))", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Document open={open} stamp={stamp} seconds={seconds} icon={icon} sens={sens} onCopy={copyAll} copied={copied} onHide={hide} />
        </div>
      )}
    </div>
  );
}

function Watermark({ stamp, count }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: -60, display: "flex", flexWrap: "wrap", gap: "26px 30px", alignContent: "flex-start", transform: "rotate(-16deg)", pointerEvents: "none", overflow: "hidden" }}>
      {Array.from({ length: count }, (_, i) => <span key={i} style={{ font: `700 12px ${MONO}`, letterSpacing: ".06em", color: "var(--ca-watermark)", whiteSpace: "nowrap" }}>{stamp}</span>)}
    </div>
  );
}

/** The one open document: watermarked with the viewer and the time, a countdown, four fields, Hide now, Copy all. */
function Document({ open, stamp, seconds, icon, sens, onCopy, copied, onHide, inline = false }) {
  const p = open.passenger;
  const fields = [["DATE OF BIRTH", p.dateOfBirth], ["DOCUMENT COUNTRY", p.documentCountry], ["DOCUMENT NUMBER", p.documentNumber], ["EXPIRES", p.documentExpiry, p.expiresSoon ? "Expires within 6 months" : ""]];
  const pct = `${Math.round((open.left / seconds) * 100)}%`;
  const head = (
    <div style={{ position: "relative", padding: inline ? "8px 12px" : "14px 16px 10px", display: "flex", flexDirection: "column", gap: 6, borderBottom: `1px solid ${sens.border}`, background: sens.tint }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 650, color: sens.text }}>{icon("file-lock-2", 14)}<span style={{ flex: 1 }}>Logged · shown to you at {hhmmss(open.shownAt)} UTC</span><span style={{ font: `700 13px ${MONO}` }}>0:{String(open.left).padStart(2, "0")}</span></span>
      <span style={{ display: "block", height: inline ? 3 : 4, borderRadius: 2, background: "var(--ca-countdown-track)", position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct, background: sens.solid, transition: "width 1s linear" }} /></span>
    </div>
  );
  const grid = (
    <div style={{ display: "grid", gridTemplateColumns: inline ? "repeat(4, minmax(0, 1fr))" : "1fr 1fr", gap: 10 }}>
      {fields.map(([k, v, warn]) => <div key={k} style={{ border: `1.5px solid ${sens.border}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, background: "var(--cw-bg-surface)", minWidth: 0 }}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "var(--cw-text-muted)" }}>{k}</span><span style={{ font: `700 17px ${MONO}`, overflowWrap: "anywhere" }}>{v || "—"}</span>{warn && <span style={{ fontSize: 11.5, fontWeight: 650, color: "var(--cw-warning-text)" }}>{warn}</span>}</div>)}
    </div>
  );
  const fact = <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--cw-text-muted)" }}>Your name and the time are on this view.{inline ? "" : " The rest of the list is hidden while it is open."}</span>;
  const copy = <button type="button" onClick={() => void onCopy()} style={{ height: inline ? 34 : 48, padding: "0 14px", borderRadius: 10, border: `1px solid ${sens.border}`, background: "var(--cw-bg-surface)", color: sens.text, fontSize: 13.5, fontWeight: 650, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit" }}>{icon("copy", 14)}{copied ? "Copied" : "Copy all details"}</button>;
  if (inline) return (
    <div data-pax-doc="" style={{ margin: "0 14px 12px", border: `1.5px solid ${sens.solid}`, borderRadius: 10, background: sens.tint, position: "relative", overflow: "hidden" }}>
      <Watermark stamp={stamp} count={14} />
      {head}
      <div style={{ position: "relative", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 16, fontWeight: 800 }}>{p.surname} <span style={{ fontWeight: 500 }}>{p.given}</span></span></span>
        {grid}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{fact}<span style={{ flex: 1 }} />{copy}</div>
      </div>
    </div>
  );
  return (
    <>
      <Watermark stamp={stamp} count={24} />
      {head}
      <div style={{ position: "relative", flex: 1, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ font: `600 13px ${MONO}`, color: "var(--cw-text-muted)" }}>ROW {p.row}</span><span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.01em" }}>{p.surname}</span><span style={{ fontSize: 16, color: "var(--cw-text-body)" }}>{[p.given, p.nationality, SEX[p.sex] ?? p.sex].filter(Boolean).join(" · ")}</span></span>
        {grid}
        {fact}
        {copy}
      </div>
      <div style={{ position: "relative", padding: "12px 16px max(30px, env(safe-area-inset-bottom))", borderTop: "1px solid var(--cw-border)", background: "var(--mx-sheet, var(--cw-bg-surface))" }}>
        <button type="button" onClick={onHide} style={{ width: "100%", height: 56, borderRadius: 12, border: "none", background: sens.solid, color: sens.onSolid, fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontFamily: "inherit" }}>{icon("eye-off", 18)}Hide now</button>
      </div>
    </>
  );
}
