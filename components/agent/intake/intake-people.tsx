"use client";

// Crew and passengers (§I8). Values come masked from the server; real dates of birth and passport numbers
// only through the reveal call, held in the parent's short-lived state, shown on amber, and never printed.

import { useState, type ReactNode } from "react";
import { C, INTAKE, TONE, mono } from "../ui/tokens";
import { Button, Icon } from "../ui/primitives";
import { TextInput } from "./controls";
import type { Leg, People, Person, intakeApi } from "./api";
import { errText } from "./intake-shared";

type EditPeople = ((body: Parameters<typeof intakeApi.editPeople>[1]) => Promise<void>) | null;
import { COLHEAD, EYEBROW, HATCH, fieldOf, legNo } from "./intake-shared";

export type RevealState = { phase: "off" } | { phase: "ask"; section: string } | { phase: "loading"; section: string } | { phase: "on"; data: People } | { phase: "error"; section: string; message: string };
type Col = { key: keyof Person; label: string; pii: boolean };
const CREW_COLS: Col[] = [{ key: "role", label: "Role", pii: false }, { key: "name", label: "Name", pii: false }, { key: "dob", label: "Date of birth", pii: true }, { key: "nationality", label: "Nationality", pii: false }, { key: "passport", label: "Passport no.", pii: true }, { key: "expiry", label: "Expiry", pii: true }];
const PAX_COLS: Col[] = [{ key: "role", label: "Type", pii: false }, { key: "name", label: "Name", pii: false }, { key: "dob", label: "Date of birth", pii: true }, { key: "nationality", label: "Nationality", pii: false }, { key: "passport", label: "Passport no.", pii: true }];
const MASK = "••••••••";

export function PeopleSection({ leg, people, peopleError, reveal, setReveal, doReveal, purged, retentionDays, editPeople = null }: {
  leg: Leg; people: People | null; peopleError: string | null; reveal: RevealState; setReveal: (r: RevealState) => void; doReveal: (section: string) => void; purged: boolean; retentionDays: number; editPeople?: EditPeople;
}) {
  const pl = people?.legs.find((l) => l.leg === leg.index);
  return (
    <>
      <Group editPeople={editPeople} kind="crew" leg={leg} rows={pl?.crew ?? []} loaded={!!people} error={peopleError} reveal={reveal} setReveal={setReveal} doReveal={doReveal} purged={purged || !!people?.purged} retentionDays={retentionDays} />
      <Group editPeople={editPeople} kind="pax" leg={leg} rows={pl?.pax ?? []} loaded={!!people} error={peopleError} reveal={reveal} setReveal={setReveal} doReveal={doReveal} purged={purged || !!people?.purged} retentionDays={retentionDays} />
    </>
  );
}

function Group({ kind, leg, rows, loaded, error, reveal, setReveal, doReveal, purged, retentionDays, editPeople }: {
  kind: "crew" | "pax"; leg: Leg; rows: Person[]; loaded: boolean; error: string | null; reveal: RevealState; setReveal: (r: RevealState) => void; doReveal: (section: string) => void; purged: boolean; retentionDays: number; editPeople: EditPeople;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const n = legNo(leg);
  const section = `${kind}-${leg.index}`;
  const f = fieldOf(leg, kind === "crew" ? "crewCount" : "paxTotal");
  const word = kind === "crew" ? "Crew" : "Passengers";
  const cols = (kind === "crew" ? CREW_COLS : PAX_COLS).filter((c) => rows.some((r) => r[c.key] != null && r[c.key] !== ""));
  const hasPii = cols.some((c) => c.pii);
  const sources = [...new Set(rows.map((r) => r.source).filter(Boolean))].map((s) => (s === "body" ? "Email body" : s)).join(", ");
  const copied = rows.some((r) => r.copied);
  const revealed = reveal.phase === "on" ? reveal.data.legs.find((l) => l.leg === leg.index)?.[kind] ?? null : null;
  const grid = [...cols.map(() => "minmax(0,1fr)"), ...(editPeople ? ["28px"] : [])].join(" ");

  let count: string; let body: ReactNode;
  const said = f?.said ? `"${f.said}"` : null;
  if (rows.length > 0) {
    count = String(rows.length);
    body = (
      <>
        {copied && <div style={{ margin: "0 18px 8px", display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: TONE.amber.fg, background: TONE.amber.bg, borderRadius: 8, padding: "7px 10px" }}><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", background: C.surface, borderRadius: 4, padding: "2px 6px" }}>LOW CONFIDENCE</span>Copied from another leg: the request says the list is the same.</div>}
        <div role="table" aria-label={`${word}, leg ${n}`} style={{ margin: "0 18px 12px", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: grid, gap: 10, padding: "7px 12px", background: C.page, ...COLHEAD }}>
            {cols.map((c) => <span role="columnheader" key={c.key} style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>{c.label}{c.pii && <Icon name="lock" size={10} color={C.faint} />}{c.pii && <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>, personal data</span>}</span>)}
            {editPeople && <span role="columnheader" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Actions</span>}
          </div>
          {rows.map((r, i) => (
            <div role="row" key={r.id ?? i} style={{ display: "grid", gridTemplateColumns: grid, gap: 10, padding: "7px 12px", borderTop: `1px solid ${C.dividerRow}`, alignItems: "center", background: r.added ? C.suggestHover : "transparent" }}>
              {cols.map((c) => {
                const v = r[c.key]; const real = c.pii && revealed ? revealed[i]?.[c.key] : null;
                if (c.pii) {
                  return (
                    <span role="cell" key={c.key} style={{ ...mono({ fontSize: 12.5 }), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", justifySelf: "start", borderRadius: 4, padding: "1px 3px", background: real ? TONE.amber.bg : "transparent", color: real ? C.ink : C.faint }}>
                      {real ? <><span className="cw-reveal-value">{String(real)}</span><span className="cw-reveal-mask" style={{ display: "none" }}>{MASK}</span></> : <span className="cw-reveal-mask">{v ? MASK : "—"}</span>}
                    </span>
                  );
                }
                return <span role="cell" key={c.key} style={{ fontSize: 12.5, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v == null || v === "" ? "—" : String(v)}</span>;
              })}
              {editPeople && (
                <span role="cell" style={{ justifySelf: "end" }}>
                  {r.added && r.id ? (
                    <button type="button" className="ag-focus" aria-label={`Remove ${r.name ?? "this person"}, added by ${r.added.by}`} disabled={removing === r.id}
                      onClick={async () => { setRemoving(r.id ?? null); setRemoveError(null); try { await editPeople({ op: "remove", personId: r.id as string }); } catch (e) { setRemoveError(errText(e)); } finally { setRemoving(null); } }}
                      style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="x" size={13} color={C.muted} />
                    </button>
                  ) : null}
                </span>
              )}
            </div>
          ))}
        </div>
      </>
    );
  } else if (purged) {
    count = f?.value || "—";
    body = <Box big="—" heading="Removed by retention" text={`Personal data is deleted ${retentionDays} days after the request. Counts stay.`} border={`1px dashed ${C.disabledFill}`} bg={C.page} color={C.muted} />;
  } else if (f?.state === "unknown") {
    count = "TBA";
    body = <Box big="TBA" heading={`${word}: TBA in the request`} text={`The request says ${said ?? "TBA"}. This is not zero and not empty: nobody is known yet. Leon gets TBA.`} border={`1px dashed ${INTAKE.unknownDash}`} bg={HATCH} color={INTAKE.unknownInk} />;
  } else if (f && (f.state === "zero" || f.value === "0")) {
    count = "0";
    body = <Box big="0" heading={`0 ${kind === "crew" ? "crew" : "passengers"}, stated`} text={`The request says ${said ?? "0"}. This is a real zero, not missing data.`} border={`1px solid ${C.border}`} bg={C.sidebar} color={C.body} />;
  } else if (f && f.value && f.state !== "not_given") {
    count = f.value;
    body = <Box big={f.value} heading={`No ${kind === "crew" ? "crew" : "passenger"} list in the request`} text={`The request has no ${kind === "crew" ? "crew" : "passenger"} list. The count, ${f.value}, comes from ${said ?? "the request"}.`} border={`1px dashed ${C.borderControl}`} bg={C.surface} color={C.ink} />;
  } else {
    count = "—";
    body = <Box big="—" heading={`No ${kind === "crew" ? "crew" : "passenger"} data`} text={`Neither a count nor a list for this leg.`} border={`1.5px dashed ${C.dangerBadge}`} bg={INTAKE.fieldRed} color={C.danger} />;
  }
  if (!loaded && rows.length === 0 && error) body = <div style={{ margin: "0 18px 12px", fontSize: 12.5, color: C.danger }}>Could not load the {kind === "crew" ? "crew" : "passenger"} list: {error}</div>;

  return (
    <section aria-label={`${word}, leg ${n}`} style={{ borderTop: `1px solid ${C.border}`, marginTop: 10 }}>
      <div style={{ padding: "14px 18px 8px", display: "flex", alignItems: "center", gap: 10, minHeight: 44, flexWrap: "wrap" }}>
        <span style={EYEBROW}>{kind === "crew" ? "Crew" : "Passengers"} · Leg {n}</span>
        <span style={{ ...mono({ fontSize: 12, fontWeight: 600 }), color: C.body }}>{count}</span>
        <span style={{ fontSize: 11.5, color: C.faint, flex: 1 }}>{sources}</span>
        {rows.length > 0 && hasPii && <RevealControls section={section} reveal={reveal} setReveal={setReveal} doReveal={doReveal} />}
        {editPeople && !adding && <Button size="xs" variant="ghost" icon="plus" onClick={() => setAdding(true)}>{kind === "crew" ? "Add crew member" : "Add passenger"}</Button>}
      </div>
      {body}
      {removeError && <div role="alert" style={{ margin: "0 18px 10px", fontSize: 12.5, color: C.danger }}>{removeError}</div>}
      {editPeople && adding && <AddPerson kind={kind} legNo={n} onCancel={() => setAdding(false)} onSave={async (person) => { await editPeople({ op: "add", leg: leg.index, list: kind, person }); setAdding(false); }} />}
    </section>
  );
}

function RevealControls({ section, reveal, setReveal, doReveal }: { section: string; reveal: RevealState; setReveal: (r: RevealState) => void; doReveal: (section: string) => void }) {
  const btn = { fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer" } as const;
  if (reveal.phase === "on") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span role="status" style={{ fontSize: 12, fontWeight: 600, color: TONE.amber.fg, background: TONE.amber.bg, borderRadius: 6, padding: "4px 8px" }}>Visible to you · hides after 60 s · logged</span>
        <button type="button" className="ag-focus" style={btn} onClick={() => setReveal({ phase: "off" })}><Icon name="eye-off" size={13} color={C.muted} />Hide now</button>
      </div>
    );
  }
  if ((reveal.phase === "ask" || reveal.phase === "loading" || reveal.phase === "error") && reveal.section === section) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: reveal.phase === "error" ? C.danger : C.body }}>{reveal.phase === "error" ? `Could not show it: ${reveal.message}` : "Showing dates of birth and passport numbers is logged under your name."}</span>
        <button type="button" className="ag-focus" disabled={reveal.phase === "loading"} onClick={() => doReveal(section)} style={{ ...btn, color: C.surface, background: C.ink, border: `1px solid ${C.ink}` }}>{reveal.phase === "loading" ? "Showing…" : "Show for 60 s"}</button>
        <button type="button" className="ag-focus" style={btn} onClick={() => setReveal({ phase: "off" })}>Cancel</button>
      </div>
    );
  }
  return <button type="button" className="ag-focus" style={btn} onClick={() => setReveal({ phase: "ask", section })}><Icon name="eye" size={13} color={C.muted} />Show personal data</button>;
}

function Box({ big, heading, text, border, bg, color }: { big: string; heading: string; text: string; border: string; bg: string; color: string }) {
  return (
    <div style={{ margin: "0 18px 14px", border, background: bg, borderRadius: 10, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center" }}>
      <span style={{ ...mono({ fontSize: 20, fontWeight: 600 }), color, minWidth: 40, textAlign: "center" }}>{big}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color }}>{heading}</span>
        <span style={{ fontSize: 12.5, lineHeight: 1.45, color: C.body }}>{text}</span>
      </div>
    </div>
  );
}


/** Hand entry of one crew member or passenger. Plain text fields only (no native date pickers). */
function AddPerson({ kind, legNo: n, onCancel, onSave }: { kind: "crew" | "pax"; legNo: number; onCancel: () => void; onSave: (p: Partial<Record<"role" | "name" | "dob" | "nationality" | "passport" | "expiry", string>>) => Promise<void> }) {
  const [v, setV] = useState({ role: "", name: "", dob: "", nationality: "", passport: "", expiry: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const fields: { key: keyof typeof v; label: string; placeholder: string; pii?: boolean; mono?: boolean }[] = [
    { key: "role", label: kind === "crew" ? "Role" : "Type", placeholder: kind === "crew" ? "PIC, SIC, Cabin" : "Adult, Child, Infant" },
    { key: "name", label: "Name", placeholder: "First Last" },
    { key: "dob", label: "Date of birth", placeholder: "DD Mon YYYY", pii: true, mono: true },
    { key: "nationality", label: "Nationality", placeholder: "Country" },
    { key: "passport", label: "Passport no.", placeholder: "Number", pii: true, mono: true },
    ...(kind === "crew" ? [{ key: "expiry" as const, label: "Expiry", placeholder: "DD Mon YYYY", pii: true, mono: true }] : []),
  ];
  const save = async () => {
    if (!v.name.trim()) { setError("A name, please."); return; }
    setBusy(true); setError(null);
    try { await onSave(Object.fromEntries(Object.entries(v).filter(([, x]) => x.trim()))); } catch (e) { setError(errText(e)); setBusy(false); }
  };
  return (
    <div role="group" aria-label={`Add ${kind === "crew" ? "crew member" : "passenger"}, leg ${n}`} style={{ margin: "0 18px 12px", padding: "12px 12px 10px", border: `1px solid ${C.primaryLine}`, borderRadius: 10, background: C.suggestHover, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${fields.length}, minmax(0,1fr))`, gap: 8 }}>
        {fields.map((f) => (
          <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={{ ...COLHEAD, display: "flex", alignItems: "center", gap: 4 }}>{f.label}{f.pii && <Icon name="lock" size={10} color={C.faint} />}</span>
            <TextInput value={v[f.key]} ariaLabel={`${f.label}${f.pii ? ", personal data" : ""}`} placeholder={f.placeholder} monoText={!!f.mono} onCommit={(x) => setV((o) => ({ ...o, [f.key]: x }))} onKeyDown={(e) => { if (e.key === "Enter") setV((o) => ({ ...o, [f.key]: (e.target as HTMLInputElement).value })); }} />
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.muted, flex: 1, minWidth: 220 }}>Saved with the request&apos;s personal data: masked everywhere, logged without values, deleted with the request by retention.</span>
        <Button size="xs" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="xs" variant="primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : kind === "crew" ? "Add crew member" : "Add passenger"}</Button>
      </div>
      {error && <div role="alert" style={{ fontSize: 12.5, color: C.danger }}>{error}</div>}
    </div>
  );
}
