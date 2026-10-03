"use client";

// A scheduled flight (type 1): the provider's notification, the question to ops (E1) and the reads of the
// portal. The notification's lines are a trigger and a key, never the flight's data: the flight is the
// provider's record, read once after ops approve, and shown in the review card like a handling request.

import { C, TONE, mono } from "../ui/tokens";
import { Icon, hmZ, dayTimeZ } from "../ui/primitives";
import type { RequestDetail } from "./api";
import { CARD, EYEBROW } from "./intake-shared";

const LOOK = { found: { icon: "circle-check", color: C.okDot, words: "Found" }, not_found: { icon: "circle-minus", color: C.faint, words: "Not there yet" }, unavailable: { icon: "circle-alert", color: TONE.amber.ic, words: "Could not look" } } as const;

export function NotificationCard({ detail, compact = false }: { detail: RequestDetail; compact?: boolean }) {
  const rv = detail.review; const n = rv?.notification; const lk = rv?.lookup; const ap = rv?.approval;
  if (!n) return <div style={{ ...CARD, padding: "16px 18px", fontSize: 13, color: C.muted }}>No notification is stored for this request.</div>;
  const approval = (
    <div style={{ borderTop: `1px solid ${C.divider}`, padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={EYEBROW}>Does this schedule need processing?</span>
      {!ap && <div style={{ fontSize: 13, color: C.muted }}>Ops have not been asked yet.</div>}
      {ap && <div style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}>Asked by email at <span style={mono({ fontSize: 12 })}>{hmZ(ap.askedAt)}</span> ({ap.to.length} address{ap.to.length === 1 ? "" : "es"}) · answer by <span style={mono({ fontSize: 12 })}>{hmZ(ap.deadlineAt)}</span>.</div>}
      {ap?.answer && <div style={{ fontSize: 13, fontWeight: 600, color: ap.answer.value === "yes" ? C.ok : C.ink }}>{ap.answer.value === "yes" ? "Yes, process it" : "No, skip it"} <span style={{ fontWeight: 400, color: C.muted }}>· {ap.answer.by}, {ap.answer.how}, <span style={mono({ fontSize: 12 })}>{hmZ(ap.answer.at)}</span></span></div>}
      {ap && !ap.answer && detail.request.closedReason === "expired" && <div style={{ fontSize: 13, fontWeight: 600, color: C.danger }}>No answer by the deadline. The request closed; it can still be processed from here.</div>}
      {(ap?.late ?? []).map((l, i) => <div key={i} style={{ fontSize: 12.5, color: C.muted }}><span style={mono({ fontSize: 12 })}>{hmZ(l.at)}</span> · a later {l.value} from {l.by} ({l.how}) changed nothing.</div>)}
      <div style={{ fontSize: 12.5, color: C.muted }}>Nothing is read from the provider&apos;s portal before a yes.</div>
    </div>
  );
  if (compact) return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 18px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>The notification that started this</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.muted }}>{n.providerName} reference <span style={mono({ fontSize: 12.5, fontWeight: 600 })}>{n.reference}</span>{n.route.length ? <> · <span style={mono({ fontSize: 12.5 })}>{n.route.join(" → ")}</span></> : null}{n.date ? ` · ${n.date}` : ""} · its lines were not used to build the legs above.</div>
      </div>
      {approval}
    </div>
  );
  const rows: [string, React.ReactNode][] = [
    ["Reference", <span key="r" style={mono({ fontSize: 13, fontWeight: 600 })}>{n.reference ?? "none"}</span>],
    ["Provider", n.providerName],
    ["Route", <span key="ro" style={mono({ fontSize: 13 })}>{n.route.join(" → ") || "not given"}</span>],
    ["Date", <span key="d">{n.date ? <span style={mono({ fontSize: 13 })}>{n.date}</span> : "not given"} <span style={{ color: C.muted }}>· the first leg&apos;s date</span></span>],
    ["Departures", <span key="e">{n.etd.length ? n.etd.map((e, i) => <span key={i} style={{ ...mono({ fontSize: 13 }), marginRight: 12 }}>{e.time} {e.airport}</span>) : "not given"} <span style={{ color: C.muted }}>· local time at each departure airport, no dates</span></span>],
    ["Passengers", n.pax ? <span key="p"><span style={mono({ fontSize: 13 })}>{n.pax}</span> <span style={{ color: C.muted }}>· per leg</span></span> : "not given"],
    ["Type of flight", n.client ?? "not given"],
    ["Crew", `${n.crewNamed} crew line${n.crewNamed === 1 ? "" : "s"} filled (initials not kept)`],
    ["Calendar", n.calendar ? `${n.calendar.method === "CANCEL" ? "Cancellation" : "Invite"}${n.calendar.sequence != null ? ` · sequence ${n.calendar.sequence}` : ""}` : "No calendar part in the message"],
  ];
  return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 18px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>What the notification says</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.muted }}>These lines tell the agent that a flight exists and which record to look up. They are not used to build flights: the flight&apos;s times, legs and aircraft are the provider&apos;s record.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0,1fr)", gap: "8px 14px", padding: "4px 18px 16px", fontSize: 13, lineHeight: 1.5 }}>
        {rows.map(([k, v]) => <div key={k} style={{ display: "contents" }}><span style={{ color: C.muted }}>{k}</span><span style={{ color: C.body, minWidth: 0, overflowWrap: "anywhere" }}>{v}</span></div>)}
      </div>

      {approval}

      <div style={{ borderTop: `1px solid ${C.divider}`, padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={EYEBROW}>The record in the provider&apos;s portal</span>
        {lk?.found && (
          <div style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}>
            Record <span style={mono({ fontWeight: 600 })}>{lk.found.row.quote}</span> found: flight date <span style={mono()}>{lk.found.row.flightDate}</span>, aircraft <span style={mono()}>{lk.found.row.aircraft}</span>, quoted <span style={mono()}>{lk.found.row.quoteDate}</span>.
          </div>
        )}
        {(lk?.attempts ?? []).length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Not read yet{ap?.answer?.value === "yes" ? "" : ": the portal is only read after ops say yes"}.</div>}
        {(lk?.attempts ?? []).map((a, i) => { const l = LOOK[a.state] ?? LOOK.unavailable; return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "18px 64px 110px minmax(0,1fr)", gap: 10, fontSize: 12.5, alignItems: "start" }}>
            <Icon name={l.icon} size={14} color={l.color} style={{ marginTop: 1 }} />
            <span style={mono({ fontSize: 12 })}>{hmZ(a.at)}</span>
            <span style={{ fontWeight: 600, color: C.ink }}>{l.words}</span>
            <span style={{ color: C.body, lineHeight: 1.45 }}>{a.state === "unavailable" ? a.why : a.state === "not_found" ? "The reference is not in the portal's list." : ""}{a.by ? ` · looked up by ${a.by}` : ""}</span>
          </div>
        ); })}
        {lk?.nextAt && !lk.found && <div style={{ fontSize: 12.5, color: C.muted }}>Next look-up at <span style={mono({ fontSize: 12 })}>{hmZ(lk.nextAt)}</span>. A record can appear in the portal days after its quote date.</div>}
      </div>

      {((rv?.updates ?? []).length > 0 || (rv?.copies ?? 0) > 0 || rv?.cancelled) && (
        <div style={{ borderTop: `1px solid ${C.divider}`, padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={EYEBROW}>From the provider since</span>
          {(rv?.updates ?? []).map((u, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}><span style={mono({ fontSize: 12 })}>{dayTimeZ(u.at)}</span> · Update{u.sequence != null ? ` (sequence ${u.sequence})` : ""}: {u.changes.length ? u.changes.join("; ") : "re-sent, the lines are the same"} <span style={{ color: C.muted }}>· matched by {u.matchedBy}</span></div>
          ))}
          {(rv?.copies ?? 0) > 0 && <div style={{ fontSize: 13, color: C.body }}>{rv?.copies} further cop{rv?.copies === 1 ? "y" : "ies"} of the same notification arrived.</div>}
          {rv?.cancelled && <div style={{ fontSize: 13, fontWeight: 600, color: C.danger }}><span style={mono({ fontSize: 12 })}>{dayTimeZ(rv.cancelled.at)}</span> · Cancelled by the provider <span style={{ color: C.muted, fontWeight: 400 }}>· matched by {rv.cancelled.matchedBy}</span></div>}
        </div>
      )}
    </div>
  );
}
