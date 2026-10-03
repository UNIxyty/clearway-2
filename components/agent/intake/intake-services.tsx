"use client";

// Services per leg (§I7). The agent proposes, ops decide: Provide · To confirm · Decline, an "Our answer" for
// conditional lines, note rows, and "Add a service the agent missed". A person's choice is marked permanently
// (who, when, what it was) so an agent decision and a human one can be told apart at a glance. Nothing here
// touches a Leon checklist status: the request goes to Leon as a note in the flight's OPS notes, unactioned.
// Keys 1 2 3 on a focused service row set the decision (§I15).

import { useState, type KeyboardEvent } from "react";
import { C, INTAKE, TONE, mono } from "../ui/tokens";
import { Icon } from "../ui/primitives";
import { LinkButton, Segmented, Tag, TextInput } from "./controls";
import type { Leg, Service } from "./api";
import { COLHEAD, SectionHead, legNo, sourceLabel } from "./intake-shared";
import type { Apply } from "./intake-fields";

export const SGRID = "24px minmax(0,1fr) minmax(0,1fr) 262px";
export type Def = { nid: number; label: string; section: string };
type Decision = "provide" | "to_confirm" | "decline";
const DECISIONS: { value: Decision; label: string }[] = [{ value: "provide", label: "Provide" }, { value: "to_confirm", label: "To confirm" }, { value: "decline", label: "Decline" }];
const DCOLORS: Record<Decision, { fg: string; bg: string; inset: string }> = {
  provide: { fg: TONE.green.fg, bg: TONE.green.bg, inset: C.okDot },
  to_confirm: { fg: TONE.amber.fg, bg: TONE.amber.bg, inset: INTAKE.amberIcon },
  decline: { fg: INTAKE.unknownInk, bg: C.neutralTint, inset: INTAKE.slateIcon },
};
const DWORD: Record<Service["decision"], string> = { provide: "Provide", to_confirm: "To confirm", decline: "Decline", note: "Note" };

export function servicesSummary(leg: Leg) {
  const s = leg.services; const c = (d: Service["decision"]) => s.filter((x) => !x.isNote && x.decision === d).length;
  const notes = s.filter((x) => x.isNote).length; const byPeople = s.filter((x) => !x.isNote && x.decided).length;
  return `${s.filter((x) => !x.isNote).length} requested · ${c("provide")} provide · ${c("to_confirm")} to confirm · ${c("decline")} declined · ${notes} note${notes === 1 ? "" : "s"} · ${byPeople ? `${byPeople} decided by people, the rest the agent's` : "all decisions the agent's"}`;
}

export function Services({ leg, editable, apply, defs }: { leg: Leg; editable: boolean; apply: Apply; defs: Def[] | null }) {
  const [adding, setAdding] = useState(false);
  const rows = leg.services.filter((s) => !s.isNote), notes = leg.services.filter((s) => s.isNote);
  return (
    <section aria-label={`Services, leg ${legNo(leg)}`} style={{ borderTop: `1px solid ${C.border}`, marginTop: 10 }}>
      <SectionHead heading={`Services · Leg ${legNo(leg)}`} sub={servicesSummary(leg)} />
      {leg.services.length === 0 && <div style={{ padding: "4px 18px 10px", fontSize: 13, color: C.muted }}>The request lists no services for this leg.</div>}
      {rows.length > 0 && (
        <div aria-hidden style={{ display: "grid", gridTemplateColumns: SGRID, gap: 12, padding: "4px 18px 6px", ...COLHEAD }}>
          <span /><span>The request said</span><span>The agent read it as</span><span>We will · decided by</span>
        </div>
      )}
      {rows.map((s) => <ServiceRow key={s.id} s={s} leg={leg} editable={editable} apply={apply} defs={defs} />)}
      {notes.map((s) => <NoteRow key={s.id} s={s} leg={leg} editable={editable} apply={apply} />)}
      {editable && (
        <div style={{ padding: "10px 18px 4px", borderTop: `1px solid ${C.dividerRow}` }}>
          <LinkButton icon="plus" disabled={adding} onClick={async () => { setAdding(true); await apply({ op: "service_add", leg: leg.index, name: "New service" }); setAdding(false); }}>{adding ? "Adding…" : "Add a service the agent missed"}</LinkButton>
        </div>
      )}
    </section>
  );
}

function ServiceRow({ s, leg, editable, apply, defs }: { s: Service; leg: Leg; editable: boolean; apply: Apply; defs: Def[] | null }) {
  const declined = s.decision === "decline";
  const set = (decision: Decision) => { if (editable && decision !== s.decision) void apply({ op: "service", leg: leg.index, serviceId: s.id, decision }); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement; if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.closest('[role="listbox"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const d = ({ "1": "provide", "2": "to_confirm", "3": "decline" } as Record<string, Decision>)[e.key];
    if (d) { e.preventDefault(); set(d); }
  };
  const tags: { l: string; fg: string; bg: string; note: string | null }[] = [];
  if (s.conditional) tags.push({ l: "CONDITIONAL", fg: C.primaryOnTint, bg: INTAKE.conditionalBg, note: s.condition ? cap(s.condition) : "Asks us to confirm" });
  if (s.requested === "decline") tags.push({ l: "NOT REQUESTED", fg: C.neutral, bg: C.neutralTint, note: "The request says none is needed" });
  if (s.lowConfidence && !s.checked) tags.push({ l: "LOW CONFIDENCE", fg: TONE.amber.fg, bg: TONE.amber.bg, note: "The agent is not sure it read this line right." });
  if (s.checked) tags.push({ l: "CHECKED", fg: C.ok, bg: C.okTint, note: `Checked by ${s.checked.by}` });
  const low = s.lowConfidence && !s.checked;
  const showAnswer = s.conditional && !declined;
  const dc = DCOLORS[s.decision as Decision];
  const byPerson = !!s.decided;
  return (
    <div tabIndex={editable ? 0 : -1} role="group" aria-label={`Service ${s.name}. Keys 1 2 3 set Provide, To confirm, Decline.`} onKeyDown={editable ? onKey : undefined} className="ag-focus"
      style={{ display: "grid", gridTemplateColumns: SGRID, gap: 12, padding: "9px 18px 9px 15px", borderTop: `1px solid ${C.dividerRow}`, borderLeft: `3px solid ${byPerson ? C.primary : low ? INTAKE.amberIcon : "transparent"}`, background: low ? C.warnWash : C.surface, alignItems: "start", outlineOffset: -2 }}>
      <span style={{ ...mono({ fontSize: 12 }), color: C.faint, paddingTop: 2 }}>{s.no || "•"}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, lineHeight: 1.45, fontStyle: s.added ? "normal" : "italic", color: C.body, overflowWrap: "anywhere" }}>{s.added ? "Added by you" : `"${s.said ?? s.name}"`}</span>
        {s.source && s.source !== "body" && !s.added && <span style={{ fontSize: 11.5, color: C.faint }}>{sourceLabel(s.source, leg)}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        {s.added && editable ? (
          <TextInput value={s.name} monoText={false} height={30} placeholder="Name the service" ariaLabel="Name the service" onCommit={(v) => void apply({ op: "service", leg: leg.index, serviceId: s.id, name: v })} style={{ border: `1px solid ${C.citeOutline}` }} />
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: declined ? C.faint : C.ink, textDecoration: declined ? "line-through" : "none" }}>{s.name}</span>
            {s.detail && <span style={{ ...mono({ fontSize: 12 }), color: C.muted }}>{s.detail}</span>}
          </div>
        )}
        {tags.map((t) => (
          <div key={t.l} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Tag tone={t}>{t.l}</Tag>{t.note && <span style={{ fontSize: 12, color: C.body }}>{t.note}</span>}
          </div>
        ))}
        {low && editable && <div><button type="button" className="ag-focus" onClick={() => void apply({ op: "looks_right", leg: leg.index, serviceId: s.id })} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.ink, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 7, padding: "3px 9px", cursor: "pointer" }}>Looks right</button></div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {editable ? (
          <Segmented<Decision> label={`Decision for ${s.name}`} size="sm" value={(s.decision === "note" ? "provide" : s.decision) as Decision} options={DECISIONS} colors={DCOLORS} onChange={set} />
        ) : (
          <span style={{ display: "inline-flex", fontSize: 12, fontWeight: 700, color: dc?.fg ?? C.body, background: dc?.bg ?? C.hover, border: `1.5px solid ${dc?.inset ?? C.border}`, borderRadius: 8, padding: "5px 12px" }}>{DWORD[s.decision]}</span>
        )}
        {byPerson ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Tag tone={{ fg: C.primaryOnTint, bg: INTAKE.conditionalBg }}>DECIDED BY {s.decided!.by.toUpperCase()}</Tag>
            <span style={{ fontSize: 11.5, color: C.muted }}>was {DWORD[(s.decided!.first || s.decided!.was) as Service["decision"]] ?? s.decided!.first} (the agent) · {new Date(s.decided!.at).toISOString().slice(11, 16)}Z</span>
          </div>
        ) : <span style={{ fontSize: 11.5, color: C.faint }}>{s.added ? "Added by a person" : "The agent's decision, unchanged"}</span>}
      </div>
      {showAnswer && (
        <div style={{ gridColumn: "2 / -1", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.primaryOnTint, whiteSpace: "nowrap" }}>OUR ANSWER</span>
          {editable ? (
            <TextInput value={s.answer ?? ""} monoText={false} height={30} placeholder="e.g. Available, 28 V DC" ariaLabel={`Our answer for ${s.name}`} onCommit={(v) => void apply({ op: "service", leg: leg.index, serviceId: s.id, answer: v })} style={{ border: `1px solid ${INTAKE.answerBorder}`, background: INTAKE.answerBg, flex: 1 }} />
          ) : <span style={{ fontSize: 13, color: C.ink, flex: 1 }}>{s.answer || "No answer recorded"}</span>}
          <span style={{ fontSize: 11.5, color: C.muted, width: 220, flex: "none" }}>Goes into the flight&apos;s OPS notes in Leon, unactioned.</span>
        </div>
      )}
    </div>
  );
}

function NoteRow({ s }: { s: Service; leg: Leg; editable: boolean; apply: Apply }) {
  const party = s.kind === "party";
  return (
    <div style={{ display: "grid", gridTemplateColumns: SGRID, gap: 12, padding: "10px 18px 10px 15px", borderTop: `1px solid ${C.dividerRow}`, borderLeft: "3px solid transparent", background: C.page, alignItems: "start" }}>
      <Icon name={party ? "building-2" : "sticky-note"} size={14} color={C.faint} style={{ marginTop: 2 }} />
      <span style={{ fontSize: 13, lineHeight: 1.45, fontStyle: "italic", color: C.body, overflowWrap: "anywhere" }}>&quot;{s.said ?? s.name}&quot;</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Tag tone={{ fg: C.neutral, bg: C.neutralTint }} style={{ alignSelf: "flex-start" }}>{party ? "NAMES A PARTY · NOT A SERVICE" : "KEPT AS A NOTE · NOT A SERVICE"}</Tag>
        <span style={{ fontSize: 12, color: C.muted }}>{party ? "Says who does it, not what is wanted. Recorded on the note; it never takes a service's place." : "Too open to tick. Handled by whoever meets the crew."}</span>
      </div>
      <span style={{ fontSize: 12, color: C.muted }}>Goes into the flight&apos;s OPS notes in Leon, word for word.</span>
    </div>
  );
}
function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
