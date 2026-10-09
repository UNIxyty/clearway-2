"use client";

// Crew and passengers (§I8). Values come masked from the server; real dates of birth, passport numbers and passengers'
// names (portal foundations 1.4) only through the reveal call, held in the parent's short-lived state, shown on amber,
// and never printed. Crew names stay readable.

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
const CREW_COLS: Col[] = [{ key: "role", label: "Role", pii: false }, { key: "name", label: "Name", pii: false }, { key: "sex", label: "Sex", pii: false }, { key: "dob", label: "Date of birth", pii: true }, { key: "nationality", label: "Nationality", pii: false }, { key: "passport", label: "Passport no.", pii: true }, { key: "expiry", label: "Expiry", pii: true }];
// Passengers go to Leon's passenger database as contacts: the name is shown as Leon gets it, surname and given names.
const PAX_COLS: Col[] = [{ key: "role", label: "Type", pii: false }, { key: "surname", label: "Surname", pii: true }, { key: "given", label: "Given names", pii: true }, { key: "sex", label: "Sex", pii: false }, { key: "dob", label: "Date of birth", pii: true }, { key: "nationality", label: "Nationality", pii: false }, { key: "passport", label: "Passport no.", pii: true }, { key: "expiry", label: "Expiry", pii: true }];
const MASK = "••••••••";

export function PeopleSection({ leg, people, peopleError, reveal, setReveal, doReveal, purged, retentionDays, editPeople = null }: {
  leg: Leg; people: People | null; peopleError: string | null; reveal: RevealState; setReveal: (r: RevealState) => void; doReveal: (section: string) => void; purged: boolean; retentionDays: number; editPeople?: EditPeople;
}) {
  const pl = people?.legs.find((l) => l.leg === leg.index);
  return (
    <>
      <Group editPeople={editPeople} kind="crew" leg={leg} rows={pl?.crew ?? []} loaded={!!people} error={peopleError} reveal={reveal} setReveal={setReveal} doReveal={doReveal} purged={purged || !!people?.purged} retentionDays={retentionDays} />
      <Group editPeople={editPeople} nameOrder={people?.nameOrder ?? null} kind="pax" leg={leg} rows={pl?.pax ?? []} loaded={!!people} error={peopleError} reveal={reveal} setReveal={setReveal} doReveal={doReveal} purged={purged || !!people?.purged} retentionDays={retentionDays} />
    </>
  );
}

/** A person corrects how a passenger's name is split for Leon. Kept on the request, marked with who and when. */
// `row` is the REVEALED row: the editor only opens while personal data is shown.
function SplitEditor({ row, n, onCancel, onSave }: { row: Person; n: number; onCancel: () => void; onSave: (surname: string, given: string) => Promise<void> }) {
  const [surname, setSurname] = useState(row.surname ?? ""); const [given, setGiven] = useState(row.given ?? "");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const save = async () => { if (!surname.trim() || !given.trim()) { setError("Leon needs both a surname and a given name."); return; } setBusy(true); setError(null); try { await onSave(surname.trim(), given.trim()); } catch (e) { setError(errText(e)); setBusy(false); } };
  return (
    <div role="group" aria-label={`Name split, passenger ${n}`} style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", padding: "8px 0 2px" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180 }}><span style={COLHEAD}>Surname</span><TextInput value={surname} ariaLabel="Surname" monoText={false} onCommit={setSurname} onKeyDown={(e) => { if (e.key === "Enter") setSurname((e.target as HTMLInputElement).value); }} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}><span style={COLHEAD}>Given names</span><TextInput value={given} ariaLabel="Given names" monoText={false} onCommit={setGiven} onKeyDown={(e) => { if (e.key === "Enter") setGiven((e.target as HTMLInputElement).value); }} /></label>
      <span style={{ fontSize: 12, color: C.muted, flex: 1, minWidth: 200 }}>As written in the request: {row.name ?? "—"}</span>
      <Button size="xs" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button size="xs" variant="primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save split"}</Button>
      {error && <span role="alert" style={{ fontSize: 12.5, color: C.danger, flexBasis: "100%" }}>{error}</span>}
    </div>
  );
}

function Group({ kind, leg, rows, loaded, error, reveal, setReveal, doReveal, purged, retentionDays, editPeople, nameOrder = null }: {
  kind: "crew" | "pax"; leg: Leg; rows: Person[]; loaded: boolean; error: string | null; reveal: RevealState; setReveal: (r: RevealState) => void; doReveal: (section: string) => void; purged: boolean; retentionDays: number; editPeople: EditPeople; nameOrder?: People["nameOrder"];
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
  const grid = [...cols.map((c) => (c.key === "sex" ? "44px" : c.key === "name" || c.key === "given" ? "minmax(0,1.3fr)" : c.key === "surname" ? "minmax(0,1.9fr)" : "minmax(0,1fr)")), ...(editPeople ? ["52px"] : [])].join(" ");
  const [splitting, setSplitting] = useState<number | null>(null);
  const order = nameOrder?.order ? `Names split for Leon by the request's declared order${nameOrder.said ? ` “${nameOrder.said}”` : ""}.` : "The request does not declare the order of its names: each is split with the last word as the surname.";
  const unsure = kind === "pax" ? rows.filter((r) => r.splitHow === "undeclared" || r.splitHow === "single").length : 0;

  let count: string; let body: ReactNode;
  const said = f?.said ? `"${f.said}"` : null;
  if (rows.length > 0) {
    count = String(rows.length);
    body = (
      <>
        {copied && <div style={{ margin: "0 18px 8px", display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: TONE.amber.fg, background: TONE.amber.bg, borderRadius: 8, padding: "7px 10px" }}><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", background: C.surface, borderRadius: 4, padding: "2px 6px" }}>LOW CONFIDENCE</span>Copied from another leg: the request says the list is the same.</div>}
        {kind === "pax" && <div style={{ margin: "0 18px 8px", fontSize: 12.5, color: unsure ? TONE.amber.fg : C.muted, background: unsure ? TONE.amber.bg : "transparent", borderRadius: 8, padding: unsure ? "7px 10px" : 0 }}>{order} Check each surname (a double surname, a name written surname-first) and correct it with ✎ before sending: Leon gets the surname and given names exactly as shown.</div>}
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
                      {c.key === "surname" && splitNote(r)}
                    </span>
                  );
                }
                if (c.key === "surname") return <span role="cell" key={c.key} style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={undefined}>{v ? String(v) : "—"}{splitNote(r)}</span>;
                return <span role="cell" key={c.key} style={{ fontSize: 12.5, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v == null || v === "" ? "—" : String(v)}</span>;
              })}
              {editPeople && (
                <span role="cell" style={{ justifySelf: "end", display: "inline-flex", gap: 2 }}>
                  {kind === "pax" && r.idx != null && (
                    <button type="button" className="ag-focus" aria-label={`Correct the surname and given names of passenger ${i + 1}`} title={revealed ? undefined : "Shows personal data first: the names are masked until then"}
                      onClick={() => { if (!revealed) { setReveal({ phase: "ask", section }); return; } setSplitting(splitting === r.idx ? null : r.idx ?? null); }}
                      style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: splitting === r.idx ? C.primaryTint3 : "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: C.muted }}>✎</button>
                  )}
                  {r.added && r.id ? (
                    <button type="button" className="ag-focus" aria-label={`Remove ${kind === "pax" ? `passenger ${i + 1}` : r.name ?? "this person"}, added by ${r.added.by}`} disabled={removing === r.id}
                      onClick={async () => { setRemoving(r.id ?? null); setRemoveError(null); try { await editPeople({ op: "remove", personId: r.id as string }); } catch (e) { setRemoveError(errText(e)); } finally { setRemoving(null); } }}
                      style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="x" size={13} color={C.muted} />
                    </button>
                  ) : null}
                </span>
              )}
              {splitting === r.idx && r.idx != null && editPeople && revealed?.[i] && <SplitEditor row={revealed[i]} n={i + 1} onCancel={() => setSplitting(null)} onSave={async (surname, given) => { await editPeople({ op: "split", idx: r.idx as number, surname, given }); setSplitting(null); }} />}
            </div>
          ))}
        </div>
      </>
    );
  } else if (purged) {
    count = f?.value || "—";
    body = <Box big="—" heading="Removed by retention" text={`Personal data is deleted ${retentionDays} days after the request or its last flight, whichever is later. Counts stay.`} border={`1px dashed ${C.disabledFill}`} bg={C.page} color={C.muted} />;
  } else if (f?.state === "unknown") {
    count = "TBA";
    body = <Box big="TBA" heading={`${word}: TBA in the request`} text={`The request says ${said ?? "TBA"}. This is not zero and not empty: nobody is known yet. No count goes to Leon for it.`} border={`1px dashed ${INTAKE.unknownDash}`} bg={HATCH} color={INTAKE.unknownInk} />;
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

function splitNote(r: Person) {
  if (r.splitHow === "edited") return <span style={{ fontWeight: 400, color: C.primaryHover, fontFamily: "inherit" }}> · edited{r.splitBy ? ` by ${r.splitBy}` : ""}</span>;
  if (r.splitHow === "undeclared" || r.splitHow === "single") return <span style={{ fontWeight: 400, color: TONE.amber.fg, fontFamily: "inherit" }}> · check</span>;
  return null;
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
        <span style={{ fontSize: 12, color: reveal.phase === "error" ? C.danger : C.body }}>{reveal.phase === "error" ? `Could not show it: ${reveal.message}` : "Showing passengers' names, dates of birth and passport numbers is logged under your name."}</span>
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
function AddPerson({ kind, legNo: n, onCancel, onSave }: { kind: "crew" | "pax"; legNo: number; onCancel: () => void; onSave: (p: Partial<Record<"role" | "name" | "sex" | "dob" | "nationality" | "passport" | "expiry", string>>) => Promise<void> }) {
  const [v, setV] = useState({ role: "", name: "", sex: "", dob: "", nationality: "", passport: "", expiry: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const fields: { key: keyof typeof v; label: string; placeholder: string; pii?: boolean; mono?: boolean }[] = [
    { key: "role", label: kind === "crew" ? "Role" : "Type", placeholder: kind === "crew" ? "PIC, SIC, Cabin" : "Adult, Child, Infant" },
    { key: "name", label: "Name", placeholder: "First Last" },
    { key: "sex", label: "Sex", placeholder: "M / F" },
    { key: "dob", label: "Date of birth", placeholder: "DD Mon YYYY", pii: true, mono: true },
    { key: "nationality", label: "Nationality", placeholder: "Country" },
    { key: "passport", label: "Passport no.", placeholder: "Number", pii: true, mono: true },
    { key: "expiry", label: "Expiry", placeholder: "DD Mon YYYY", pii: true, mono: true },
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
