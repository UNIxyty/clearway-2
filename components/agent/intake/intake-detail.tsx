"use client";

// Expanded request (§I4): header, outcome banner (Leon's position first), duplicate/revision box, actions,
// then pipeline | review, then what was sent and the emails. Owns the per-request state: edits, reveal,
// the confirmation, the drawer. Keys: o drawer, [ ] legs, r raw fold, Esc collapse (§I15).

import { useCallback, useEffect, useRef, useState } from "react";
import { C, TONE, mono } from "../ui/tokens";
import { Button, Icon, dayTimeZ, hmZ } from "../ui/primitives";
import { Tooltip, TypeChip, useHotkeys } from "./controls";
import { intakeApi, type Leg, type People, type Prepared, type RequestDetail } from "./api";
import { CARD, LeonPill, dateRange, errText, fieldOf, fmtMin, legDate, legKeyOf, legNo, legRoute, listWords, plural } from "./intake-shared";
import { Pipeline } from "./intake-pipeline";
import { ReviewCard } from "./intake-review";
import { NotificationCard } from "./intake-notification";
import { SentSection, EmailsSection, latestWrites } from "./intake-sent";
import { OriginalEmailDrawer } from "./intake-drawer";
import { ConfirmDialog } from "./intake-confirm";
import type { RevealState } from "./intake-people";
import type { Def } from "./intake-services";

let defsCache: Def[] | null = null;

export function RequestDetailView({ id, updatedAt, onCollapse, onChanged, runsAs }: { id: string; updatedAt: string | null; onCollapse: () => void; onChanged: () => void; runsAs: string }) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [legPos, setLegPos] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [defs, setDefs] = useState<Def[] | null>(defsCache);
  const [people, setPeople] = useState<People | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [reveal, setRevealState] = useState<RevealState>({ phase: "off" });
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [reprocessMsg, setReprocessMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try { const d = await intakeApi.detail(id); setDetail(d); setLoadError(null); }
    catch (e) { setLoadError(errText(e)); }
  }, [id]);
  // Refetch when the list says the request changed (live updates), unless an edit or a send is in flight.
  useEffect(() => { if (pending.current === 0 && !prepared) void load(); }, [load, updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  // While the send runs (or the request is being read) refresh until it settles; nothing is shown before Leon answers.
  const running = detail?.request.status === "in_progress" || detail?.request.status === "extracting";
  useEffect(() => { if (!running) return; const t = setInterval(() => { if (pending.current === 0) void load(); }, 3000); return () => clearInterval(t); }, [running, load]);
  useEffect(() => { if (defsCache) return; intakeApi.definitions().then((r) => { defsCache = [...r.definitions].sort((a, b) => a.label.localeCompare(b.label)); setDefs(defsCache); }).catch(() => {}); }, []);

  // Masked people list, once per extraction.
  const extractionId = detail?.extractions[detail.extractions.length - 1]?.id ?? null;
  const wantPeople = !!detail?.review; // also when empty: people can be added by hand
  useEffect(() => {
    if (!wantPeople) { setPeople(null); return; }
    let live = true;
    intakeApi.people(id).then((p) => { if (live) { setPeople(p); setPeopleError(null); } }).catch((e) => { if (live) setPeopleError(errText(e)); });
    return () => { live = false; };
  }, [id, extractionId, wantPeople]);

  // Reveal (§I8): 60 s, then masked again; also on window blur and when this request collapses (unmount).
  const setReveal = useCallback((r: RevealState) => {
    if (revealTimer.current) { clearTimeout(revealTimer.current); revealTimer.current = null; }
    setRevealState(r);
    if (r.phase === "on") revealTimer.current = setTimeout(() => setRevealState({ phase: "off" }), 60000);
  }, []);
  useEffect(() => {
    const hide = () => setReveal({ phase: "off" });
    window.addEventListener("blur", hide);
    const vis = () => { if (document.hidden) hide(); };
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("blur", hide); document.removeEventListener("visibilitychange", vis); if (revealTimer.current) clearTimeout(revealTimer.current); };
  }, [setReveal]);
  const doReveal = useCallback(async (section: string) => {
    setReveal({ phase: "loading", section });
    try { const data = await intakeApi.reveal(id); setReveal({ phase: "on", data }); }
    catch (e) { setReveal({ phase: "error", section, message: errText(e) }); }
  }, [id, setReveal]);

  // Every edit: shown at once (these are review edits, never Leon writes), saved one at a time in order.
  // The server's answer replaces the page only when no later edit is still queued, so quick clicks don't
  // flicker back; a failed save reloads what is really saved and says why.
  const apply = useCallback((body: Record<string, unknown>) => {
    pending.current += 1;
    setDetail((d) => (d ? optimistic(d, body) : d));
    const run = chain.current.then(async () => {
      try { const d = await intakeApi.edit(id, body); if (pending.current === 1) setDetail(d); setSaveError(null); onChanged(); return true; }
      catch (e) { setSaveError(`Not saved: ${errText(e)}`); void load(); return false; }
      finally { pending.current -= 1; }
    });
    chain.current = run.catch(() => false);
    return run;
  }, [id, onChanged, load]);

  const reprocess = useCallback(async (attachmentId: string | null) => {
    setReprocessing(attachmentId ?? "body"); setReprocessMsg(null);
    try { const d = await intakeApi.reprocess(id, attachmentId); setDetail(d); setLegPos(0); onChanged(); }
    catch (e) { setReprocessMsg(errText(e)); }
    finally { setReprocessing(null); }
  }, [id, onChanged]);

  const resolveLeg = useCallback(async (leg: number, action: "check" | "not_in_leon") => {
    try {
      const r = await intakeApi.resolveLeg(id, leg, action); const { outcome, ...d } = r; setDetail(d as RequestDetail); onChanged();
      if (action === "check") return outcome?.found ? `Found in Leon as flight ${outcome.flightNid}.` : outcome?.message ?? "Not found in Leon.";
      return null;
    } catch (e) { return errText(e); }
  }, [id, onChanged]);

  const onPrepare = useCallback(async () => {
    if (preparing) return;
    setPreparing(true); setPrepareError(null);
    try { await chain.current; const p = await intakeApi.prepare(id); setPrepared(p); }
    catch (e) { setPrepareError(errText(e) + ((e as { blockers?: string[] }).blockers?.length ? ` ${(e as { blockers: string[] }).blockers.join(" ")}` : "")); void load(); }
    finally { setPreparing(false); }
  }, [id, preparing, load]);

  const legs = detail?.review?.legs ?? [];
  useHotkeys({
    o: (e) => { e.preventDefault(); setDrawer((v) => !v); },
    "[": (e) => { e.preventDefault(); if (legs.length) setLegPos((p) => (p - 1 + legs.length) % legs.length); },
    "]": (e) => { e.preventDefault(); if (legs.length) setLegPos((p) => (p + 1) % legs.length); },
    r: (e) => { if (detail?.sent.writes.length) { e.preventDefault(); setRawOpen((v) => !v); } },
    Escape: (e) => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return; // dialogs and the drawer handle their own Esc
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.getAttribute("role") === "listbox")) return;
      if (document.querySelector('[role="listbox"]')) return;
      onCollapse();
    },
  });

  if (!detail) {
    return (
      <div style={{ padding: "16px 16px 20px", background: C.sidebar, borderTop: `1px solid ${C.border}` }}>
        {loadError ? <div role="alert" style={{ fontSize: 13, color: C.danger }}>Could not open this request: {loadError} <Button size="xs" variant="secondary" onClick={() => void load()}>Try again</Button></div>
          : <div style={{ fontSize: 13, color: C.faint }}>Opening the request…</div>}
      </div>
    );
  }

  const r = detail.request;
  const closed = r.status === "closed" || r.ui.key === "handled" || r.ui.key === "cancelled" || r.ui.key === "skipped";
  const nAtt = detail.attachments.filter((a) => !a.inline).length;
  const liveLegs = legs.filter((l) => !l.removed);
  const anySent = detail.sent.writes.length > 0;
  const dupOpen = !!r.duplicate && !r.duplicate.error && !r.duplicateResolution;

  return (
    <div className="cw-expand" style={{ padding: "16px 16px 20px", background: C.sidebar, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...CARD, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.muted }}><TypeChip type={r.type} long />{r.sender ? `from ${r.sender}` : null}</div>
            <div style={{ ...mono({ fontSize: 22, fontWeight: 600 }), letterSpacing: "0.01em" }}>{r.reference}</div>
            <div style={{ fontSize: 13, color: C.muted }}>
              Received <span style={mono()}>{dayTimeZ(r.receivedAt, { alwaysDate: true })}</span> from {r.fromAddr?.replace(/"/g, "") ?? r.sender ?? "an unknown sender"} · {plural(liveLegs.length || r.legsCount || 0, "leg")}{dateRange(legs) ? ` · ${dateRange(legs)}` : ""}
            </div>
            {r.referenceBuilt && <div style={{ fontSize: 12.5, color: C.muted }}>The email has no reference. The agent built this one from the callsign and date.</div>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 4 }}>
            <Button variant="secondary" size="sm" icon="mail" keycap="o" aria-haspopup="dialog" onClick={() => setDrawer(true)}>Original email · {plural(nAtt, "attachment")}</Button>
          </div>
        </div>

        {r.duplicate?.error && (
          <div role="alert" style={{ borderRadius: 12, padding: "14px 16px", background: TONE.red.bg, border: `1.5px solid ${C.dangerBadge}`, display: "flex", gap: 12 }}>
            <Icon name="circle-alert" size={20} color={C.dangerBadge} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.danger }}>The duplicate check did not run.</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.body }}>The agent could not ask Leon whether these flights already exist: {r.duplicate.error} Check Leon for the same registration, route and dates before you confirm.</div>
            </div>
          </div>
        )}

        {dupOpen ? <DuplicateBox detail={detail} apply={apply} /> : <Banner detail={detail} now={now} closed={closed} />}
        {anySent && <LegChips legs={legs} />}
        {r.duplicateResolution && (
          <div style={{ fontSize: 12.5, color: C.muted }}>
            {r.duplicateResolution.action === "not_duplicate" ? "Marked not a duplicate" : "Closed as a revision to update in Leon by hand"} by {r.duplicateResolution.by}, <span style={mono()}>{hmZ(r.duplicateResolution.at)}</span>.
          </div>
        )}
        <Actions detail={detail} closed={closed} apply={apply} reprocess={reprocess} reprocessing={reprocessing} lookupNow={async () => { try { setDetail(await intakeApi.lookup(id)); onChanged(); } catch (e) { setSaveError(e instanceof Error ? e.message : "The look-up did not run."); } }} />
        {saveError && <div role="alert" style={{ fontSize: 13, color: C.danger, display: "flex", gap: 8, alignItems: "center" }}><Icon name="circle-alert" size={14} color={C.dangerBadge} />Not saved: {saveError}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "272px minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <Pipeline typeLabel={r.typeLabel} stageNames={detail.stageNames} stages={detail.stages} now={now} />
{r.type === "scheduled" ? <NotificationCard detail={detail} /> : (
        <ReviewCard detail={detail} apply={apply} defs={defs} legPos={legPos} setLegPos={setLegPos} closed={closed}
          people={people} peopleError={peopleError} reveal={reveal} setReveal={setReveal} doReveal={(s) => void doReveal(s)} editPeople={async (b) => { const p = await intakeApi.editPeople(id, b); setPeople(p); setReveal({ phase: "off" }); onChanged(); }}
          reprocess={reprocess} reprocessing={reprocessing} reprocessMsg={reprocessMsg}
          onPrepare={() => void onPrepare()} preparing={preparing} prepareError={prepareError} />
        )}
      </div>

      <SentSection detail={detail} rawOpen={rawOpen} setRawOpen={setRawOpen} resolveLeg={resolveLeg} />
      <EmailsSection detail={detail} />

      <OriginalEmailDrawer detail={detail} open={drawer} onClose={() => setDrawer(false)} />
      {prepared && <ConfirmDialog prepared={prepared} detail={detail} runsAs={runsAs} onFinished={(sent) => { setPrepared(null); void load(); if (sent) onChanged(); }} />}
    </div>
  );
}

// ── Outcome banner (§I4): the title always states Leon's position ─────────────────────────────────────
function Banner({ detail, now, closed }: { detail: RequestDetail; now: number; closed: boolean }) {
  const b = bannerFor(detail, now, closed);
  if (!b) return null;
  const tone = TONE[b.tone];
  const border = b.tone === "red" ? `1.5px solid ${C.dangerBadge}` : b.tone === "amber" ? `1.5px solid ${tone.ic}` : `1px solid ${tone.bd}`;
  return (
    <div role={b.tone === "red" ? "alert" : "status"} style={{ borderRadius: 12, padding: "14px 16px", background: tone.bg, border, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <Icon name={b.icon} size={20} color={tone.ic} style={{ marginTop: 1 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: tone.fg }}>{b.title}</div>
        {b.body && <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.body }}>{b.body}</div>}
      </div>
    </div>
  );
}

type B = { tone: "red" | "amber" | "green" | "blue" | "slate"; icon: string; title: string; body: string | null };
function legDesc(l: Leg) { const std = fieldOf(l, "std")?.value; const d = legDate(l).split(" ").slice(0, 2).join(" "); return `${legRoute(l)}${d ? `, ${d}` : ""}${std ? `, STD ${std} UTC` : ""}`; }
function legsWord(ns: number[]) { return ns.length === 1 ? `Leg ${ns[0]}` : `Legs ${listWords(ns)}`; }
export function bannerFor(detail: RequestDetail, now: number, closed: boolean): B | null {
  const r = detail.request; const legs = (detail.review?.legs ?? []).filter((l) => !l.removed);
  // A scheduled flight (type 1): where the reference look-up stands. Nothing is ever in Leon from this path yet.
  if (r.type === "scheduled" && !closed) {
    const st = detail.stages.find((x) => x.name === "Collecting data");
    return { tone: st?.state === "fail" || st?.state === "hold" ? "red" : st?.state === "prog" ? "blue" : "amber", icon: st?.state === "prog" ? "circle-dot" : st?.state === "hold" ? "clipboard-check" : "circle-help", title: `${r.statusReason ?? "Flight notification"}. Nothing is in Leon.`, body: st?.note ?? null };
  }
  // A send in progress comes first: nothing is shown as created or failed until Leon answers.
  if (r.status === "in_progress" && detail.review) return { tone: "blue", icon: "circle-dot", title: "Sending to Leon. No leg is shown as created until Leon confirms it with a flight ID.", body: "You can keep working anywhere in the portal: this page, the list and the email update when Leon answers." };
  const inL = legs.filter((l) => l.leon?.state === "in_leon"), notL = legs.filter((l) => l.leon?.state === "not_in_leon"), unk = legs.filter((l) => l.leon?.state === "unknown");
  const N = legs.length;
  const both = N === 2 ? "Both flights are" : N === 1 ? "The flight is" : `All ${N} flights are`;
  if (unk.length) {
    const ns = unk.map(legNo);
    return { tone: "red", icon: "circle-help", title: `${legsWord(ns)}: Leon did not answer. ${inL.length ? `${inL.length} of ${N} legs are in Leon.` : "No leg is confirmed in Leon."}`, body: `The agent could not confirm whether ${ns.length === 1 ? `leg ${ns[0]}` : `legs ${listWords(ns)}`} ${ns.length === 1 ? "exists" : "exist"} in Leon. Check Leon before resending. Nothing is resent while this is open.` };
  }
  if (inL.length && notL.length) {
    const ns = notL.map(legNo); const ok = inL.map(legNo);
    return { tone: "red", icon: "circle-alert", title: `Partly loaded. ${inL.length} of ${N} legs are in Leon. ${legsWord(ns)} ${ns.length === 1 ? "is" : "are"} NOT.`,
      body: `${notL.map((l) => `Leg ${legNo(l)} (${legDesc(l)})`).join("; ")} ${ns.length === 1 ? "was" : "were"} refused by Leon and ${ns.length === 1 ? "does" : "do"} not exist there. ${legsWord(ok)} ${ok.length === 1 ? "was" : "were"} created and ${ok.length === 1 ? "is" : "are"} live in Leon.` };
  }
  if (notL.length && !inL.length) {
    const why = notL.map((l) => l.leon?.error).filter(Boolean)[0];
    return { tone: "red", icon: "circle-x", title: "Nothing was created in Leon.", body: `Leon refused ${N === 1 ? "the leg" : `all ${N} legs`}.${why ? ` Leon said: ${why}` : ""} Fix the values marked below, then resend.` };
  }
  if (inL.length && inL.length === N) {
    const items = latestWrites(detail).filter((w) => w.state === "in_leon").flatMap((w) => w.checklist ?? []);
    const missing = items.filter((c) => !c.filled).length;
    const ids = inL.map((l) => l.leon?.flightNid).filter(Boolean) as string[];
    const at = inL.map((l) => l.leon?.at).filter(Boolean).sort()[0];
    if (missing) return { tone: "red", icon: "circle-alert", title: `${both} in Leon. The checklist is incomplete: ${missing} of ${items.length} items were not filled.`, body: "The flights exist and are correct. Only the checklist needs finishing, from this page or in Leon." };
    const scheduled = r.type === "scheduled";
    return { tone: "green", icon: "circle-check", title: scheduled || !items.length ? `Loaded. ${N === 2 ? "Both legs are" : N === 1 ? "The leg is" : `All ${N} legs are`} in Leon.` : `Loaded. ${N === 2 ? "Both legs are" : N === 1 ? "The leg is" : `All ${N} legs are`} in Leon and the checklist is complete.`,
      body: `Created${at ? ` at ${hmZ(at)}` : ""} as flight${ids.length === 1 ? "" : "s"} ${listWords(ids)}.${items.length ? ` ${items.length} of ${items.length} checklist items filled.` : ""}` };
  }
  // Nothing in Leon.
  if (closed) return { tone: "slate", icon: "circle-minus", title: `${r.ui.label}. Nothing was sent to Leon.`, body: r.statusReason };
  const reading = detail.stages.find((s) => s.name === "Reading request");
  if (!detail.review && reading?.state === "fail") return { tone: "red", icon: "file-x", title: "Could not read the request. Nothing has been sent to Leon.", body: reading.note ?? "Open the original, then enter the details by hand." };
  if (r.ui.key === "in_progress" && !detail.review) return { tone: "blue", icon: "circle-dot", title: "Reading the request. Nothing is in Leon yet.", body: null };
  const tzLeg = legs.find((l) => l.fields.some((f) => f.state === "tz_unknown"));
  if (tzLeg) {
    const tz = tzLeg.tz; const u = fmtMin(tz?.utc.departsInMin ?? null), lo = fmtMin(tz?.local.departsInMin ?? null);
    const off = tz?.offsets.find(Boolean); const offW = off ? `UTC${off.off >= 0 ? "+" : "−"}${Math.abs(off.off / 60)}` : null;
    return { tone: "red", icon: "clock", title: "Timezone unknown. Nothing can be sent to Leon until someone sets it.",
      body: `The request gives STD ${tz?.stdClock ?? fieldOf(tzLeg, "std")?.value ?? "—"} and STA ${tz?.staClock ?? fieldOf(tzLeg, "sta")?.value ?? "—"} with no timezone.${u ? ` If those are UTC the flight leaves in ${u}.` : ""}${lo ? ` If they are local time${offW ? ` (${offW})` : ""}, it leaves in ${lo}.` : ""}` };
  }
  const missing = legs.flatMap((l) => l.fields.filter((f) => f.state === "not_given" && f.required).map((f) => ({ l, f })));
  if (missing.length) {
    const byLeg = legs.filter((l) => missing.some((m) => m.l === l)).map((l) => `Leg ${legNo(l)} (${legRoute(l)}) has no ${listWords(missing.filter((m) => m.l === l).map((m) => m.f.label))}`);
    return { tone: "red", icon: "circle-pause", title: `Stopped: ${plural(missing.length, "value")} not given. Nothing has been sent to Leon.`, body: `${byLeg.join(". ")}. ${legs.length === 1 ? "The leg is not" : "Neither leg is"} in Leon. Fill them in below.`.replace("Neither leg is", legs.length > 2 ? "No leg is" : "Neither leg is") };
  }
  const lows = legs.reduce((n, l) => n + l.fields.filter((f) => f.state === "low_confidence").length, 0);
  const svc = legs.reduce((n, l) => n + l.services.filter((s) => !s.isNote).length, 0);
  const nAtt = detail.attachments.filter((a) => !a.inline && a.read).length;
  const escalated = r.ui.escalated && r.firstStd ? ` Departs in ${fmtMin(Math.round((Date.parse(r.firstStd) - now) / 60000)) ?? "less than a minute"}.` : "";
  return { tone: r.ui.key === "needs_you" ? "red" : "amber", icon: "clipboard-check", title: "Needs review. Nothing is in Leon yet.",
    body: `The agent read ${plural(legs.length, "leg")}${r.type === "handling" ? ` and ${plural(svc, "service line")}` : ""} from the email${nAtt ? ` and its ${plural(nAtt, "attachment")}` : ""}. ${lows ? `Check the ${plural(lows, "value")} marked low confidence, ` : "Check the values, "}${r.type === "handling" ? "choose the services, " : ""}then confirm.${escalated}` };
}

function LegChips({ legs }: { legs: Leg[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, paddingLeft: 32 }}>
      {legs.filter((l) => !l.removed).map((l) => {
        const k = legKeyOf(l); const not = k === "not";
        return (
          <div key={l.index} style={{ borderRadius: 10, padding: "10px 12px", background: not ? C.danger : C.surface, border: `1px solid ${not ? C.danger : C.border}`, display: "flex", flexDirection: "column", gap: 5, color: not ? C.surface : C.ink }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}><span style={mono({ fontSize: 11.5, fontWeight: 700 })}>LEG {legNo(l)}</span><span style={mono({ fontSize: 13, fontWeight: 600 })}>{legRoute(l)}</span></div>
            <div><LeonPill k={k} id={l.leon?.flightNid} /></div>
            {not && l.leon?.error && <span style={{ fontSize: 12 }}>{l.leon.error}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Duplicate / revision (§I4) ─────────────────────────────────────────────────────────────────────────
function DuplicateBox({ detail, apply }: { detail: RequestDetail; apply: (b: Record<string, unknown>) => Promise<boolean> }) {
  const d = detail.request.duplicate!; const r = detail.request;
  const [busy, setBusy] = useState<string | null>(null);
  const ids = d.leonIds.map(String);
  const ref = d.ours[0]?.reference ?? d.tripNumber ?? null;
  const created = d.created ? dayTimeZ(d.created, { alwaysDate: true }).split(" ").slice(0, 2).join(" ") : null;
  const revised = /\b(REVISED|REV|R\d)\b/i.test(r.subject ?? "");
  const title = ref && d.ours.length ? `Looks like a revision of ${ref}, which is already in Leon.` : `Looks like ${ids.length === 1 ? "a flight" : "flights"} already in Leon: ${listWords(ids)}.`;
  const why = d.matches[0]?.why;
  const body = `${revised ? "The subject says REVISED, and the" : "The"} ${why ? why : "aircraft, route and dates"} match${ids.length === 1 ? "es" : ""} ${ids.length === 1 ? "flight" : "flights"} ${listWords(ids)}${created ? `, created on ${created}` : ""}${d.tripNumber ? ` (trip ${d.tripNumber})` : ""}. The agent cannot change flights already in Leon. If the revision is real, update those flights in Leon by hand. Creating this request would make the flights exist twice.`;
  const act = async (action: "close" | "not_duplicate") => { setBusy(action); await apply({ op: "duplicate", action }); setBusy(null); };
  const btn = (primary: boolean) => ({ fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: primary ? C.surface : C.ink, background: primary ? C.primary : C.surface, border: `1px solid ${primary ? C.primary : C.borderControl}`, borderRadius: 9, padding: "8px 13px", cursor: "pointer" } as const);
  return (
    <div role="alert" style={{ borderRadius: 12, padding: "16px 18px", background: TONE.red.bg, border: `1.5px solid ${C.dangerBadge}`, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Icon name="copy" size={22} color={C.dangerBadge} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.danger }}>{title}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.body, maxWidth: 860 }}>{body}</div>
        </div>
      </div>
      {d.rows.length > 0 && (
        <div role="table" aria-label="This request compared with Leon" style={{ background: C.surface, border: `1px solid ${TONE.red.bd}`, borderRadius: 10, overflow: "hidden", marginLeft: 34 }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr 80px", gap: 12, padding: "9px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: C.faint, background: C.page }}>
            <span role="columnheader">FIELD</span><span role="columnheader">THIS REQUEST · {r.reference}</span><span role="columnheader">IN LEON · {ids.join(", ")}</span><span />
          </div>
          {d.rows.map((x, i) => (
            <div role="row" key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr 80px", gap: 12, padding: "8px 14px", borderTop: `1px solid ${C.dividerRow}`, background: x.differs ? TONE.amber.bg : x.field === "Leg" ? C.page : C.surface, alignItems: "center" }}>
              <span role="cell" style={{ fontSize: 12.5, color: C.muted }}>{x.field}</span>
              <span role="cell" style={mono({ fontSize: 13, fontWeight: 600 })}>{x.mine}</span>
              <span role="cell" style={mono({ fontSize: 13, fontWeight: 600 })}>{x.theirs}</span>
              <span role="cell" style={{ fontSize: 11, fontWeight: 700, color: TONE.amber.fg }}>{x.differs ? "DIFFERS" : ""}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: 34 }}>
        <button type="button" className="ag-focus" disabled={busy !== null} onClick={() => void act("close")} style={btn(true)}><Icon name="x" size={14} color={C.surface} />{busy === "close" ? "Closing…" : "Close · I will update Leon by hand"}</button>
        <Tooltip label="Leon link not configured">
          {(tp) => <button type="button" className="ag-focus" aria-disabled="true" {...tp} onClick={() => {}} style={{ ...btn(false), cursor: "not-allowed", opacity: 0.5 }}><Icon name="external-link" size={14} color={C.muted} />Open {ids[0] ?? ""} in Leon</button>}
        </Tooltip>
        <button type="button" className="ag-focus" disabled={busy !== null} onClick={() => void act("not_duplicate")} style={btn(false)}><Icon name="eye" size={14} color={C.muted} />{busy === "not_duplicate" ? "Saving…" : "Not a duplicate · review it"}</button>
      </div>
    </div>
  );
}

// ── Actions row (§I4) ──────────────────────────────────────────────────────────────────────────────────
function Actions({ detail, closed, apply, reprocess, reprocessing, lookupNow }: { detail: RequestDetail; closed: boolean; apply: (b: Record<string, unknown>) => Promise<boolean>; reprocess: (a: string | null) => Promise<void>; reprocessing: string | null; lookupNow: () => Promise<void> }) {
  const [looking, setLooking] = useState(false);
  const scheduled = detail.request.type === "scheduled";
  const [ask, setAsk] = useState<null | "handled_manually" | "cancelled" | "reextract">(null);
  const [busy, setBusy] = useState(false);
  if (closed || detail.request.ui.key === "loaded") return null;
  const legs = detail.review?.legs ?? [];
  const anyInLeon = legs.some((l) => l.inLeon);
  const sending = legs.some((l) => l.leon?.state === "sending");
  if (sending) return null;
  const q = ask === "handled_manually" ? "Close this request as handled manually? The agent stops; nothing more is sent to Leon."
    : ask === "cancelled" ? "Cancel this request? Nothing is sent to Leon, and the request closes." : ask === "reextract" ? "Read the request again from the email? The values on this page are replaced by the new reading." : null;
  const run = async () => {
    setBusy(true);
    if (ask === "reextract") await reprocess(null); else if (ask) await apply({ op: "close", reason: ask });
    setBusy(false); setAsk(null);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {scheduled && <Button variant="secondary" size="sm" icon="search" disabled={looking} onClick={() => { setLooking(true); void lookupNow().finally(() => setLooking(false)); }}>{looking ? "Looking up…" : "Look up now"}</Button>}
        {!scheduled && !anyInLeon && <Button variant="secondary" size="sm" icon="refresh-cw" disabled={reprocessing !== null} onClick={() => setAsk("reextract")}>Re-extract</Button>}
        <Button variant="secondary" size="sm" icon="check" onClick={() => setAsk("handled_manually")}>Mark handled manually</Button>
        {!anyInLeon && <Button variant="ghost" size="sm" icon="x" style={{ color: C.danger }} onClick={() => setAsk("cancelled")}>Cancel request</Button>}
      </div>
      {q && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: C.body }}>
          <span>{q}</span>
          <Button size="xs" variant={ask === "cancelled" ? "destructive" : "primary"} disabled={busy} onClick={() => void run()}>{busy ? "Working…" : ask === "reextract" ? "Read again" : ask === "cancelled" ? "Cancel request" : "Close request"}</Button>
          <Button size="xs" variant="secondary" disabled={busy} onClick={() => setAsk(null)}>Keep it open</Button>
        </div>
      )}
    </div>
  );
}



/** The same change the server will make, applied locally so the control moves on the click. */
function optimistic(d: RequestDetail, body: Record<string, unknown>): RequestDetail {
  if (!d.review) return d;
  const op = String(body.op ?? ""); const legIdx = body.leg == null ? null : Number(body.leg);
  const legs = d.review.legs.map((l) => {
    if (legIdx !== null && l.index !== legIdx) return l;
    if (op === "service" || (op === "looks_right" && body.serviceId)) {
      return { ...l, services: l.services.map((sv) => {
        if (sv.id !== body.serviceId) return sv;
        if (op === "looks_right") return { ...sv, lowConfidence: false, checked: { by: "you", at: new Date().toISOString() } };
        return { ...sv,
          ...(typeof body.decision === "string" ? { decision: body.decision as typeof sv.decision } : {}),
          ...(typeof body.answer === "string" ? { answer: body.answer } : {}),
          ...(typeof body.noteOnChecklist === "boolean" ? { noteOnChecklist: body.noteOnChecklist } : {}),
          ...(body.checklistNid !== undefined ? { checklistNid: (body.checklistNid as number | null) ?? null } : {}),
        };
      }) };
    }
    if (op === "looks_right" && body.key) return { ...l, fields: l.fields.map((f) => (f.key === body.key ? { ...f, state: "checked" as const, checked: { by: "you", at: new Date().toISOString() } } : f)) };
    if (op === "field" && body.key) return { ...l, fields: l.fields.map((f) => (f.key === body.key ? { ...f, value: String(body.value ?? "") } : f)) };
    if (op === "leg_remove") return { ...l, removed: { by: "you", at: new Date().toISOString() } };
    if (op === "leg_restore") return { ...l, removed: false as const };
    return l;
  });
  return { ...d, review: { ...d.review, legs } };
}
