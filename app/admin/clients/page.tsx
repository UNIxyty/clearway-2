"use client";

// Admin → Clients (Stage 5, design: Page Clients.dc.html). Operators and brokers who sign in to see their own flights.
// Two halves in the editor, kept apart: SCOPE (which flights exist for them) and ACCESS (what they see of those flights);
// passenger details in their own rose block, with consent for documents. Flight board is required; no scope, no approve.
// The Ops Agent, Flight intake, Admin, Developer, Users and Permissions are not switches and appear nowhere here
// (lib/clients/switches.mjs). Every decision is logged and listed below. Removing access empties the record and keeps it.
import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import MaskIcon from "@/components/portal/Icon";
import { Button, EmptyState, Modal, Segmented, Skeleton, TableCard, TextInput, useToast } from "@/components/kit";
import { OFFLINE } from "@/lib/error-text";
import "./clients.css";
import { SWITCHES, STARTING_SWITCHES, SCOPE_KINDS, normaliseScope, normaliseSwitches } from "@/lib/clients/switches.mjs";

type ScopeEntry = { kind: "operator" | "registration" | "trip"; value: string };
type Level = "off" | "names" | "documents";
type ClientRow = {
  id: string; user_id: string; email: string; person_name: string; company: string; kind: string; note: string;
  status: "requested" | "approved" | "refused" | "removed"; scope: ScopeEntry[]; switches: string[]; passenger_level: Level; consent: boolean;
  requested_at: string; decided_at: string | null; decided_by_email: string | null; decision_note: string;
};
type Decision = { id: number; client_id: string; kind: string; actor_email: string | null; detail: Record<string, unknown>; note: string; created_at: string };
type Editor = { scope: ScopeEntry[]; switches: string[]; level: Level; consent: boolean; note: string; kind: ScopeEntry["kind"]; value: string };

const SWITCH_ICON: Record<string, string> = { flight_board: "plane", weather: "cloud-sun", notams: "radio-tower", radar: "radar", service_status: "list-checks", notam_check_status: "shield-check", documents: "file-text", airport_search: "search", limitations: "triangle-alert", important: "star", caa: "landmark" };
const SWITCH_HINT: Record<string, string> = { flight_board: "Their flights with times and status. Without it they see nothing else.", weather: "METAR and TAF for the airports on their flights.", notams: "NOTAMs for those airports, by category.", radar: "Live position of their aircraft.", service_status: "Handling services ordered and confirmed for each flight.", notam_check_status: "Whether ops has reviewed today’s NOTAMs.", documents: "AIP and GEN documents sent for their flights.", airport_search: "Any airport’s AIP pages, not only their own.", limitations: "Airport and aircraft limitations that apply to their flights.", important: "Ops notices that match their flights.", caa: "Civil aviation authority contacts per country." };
const KIND_META: Record<ScopeEntry["kind"], { label: string; short: string; icon: string; means: string; placeholder: string }> = {
  operator: { label: "Leon operator", short: "Operator", icon: "building-2", means: "Every flight of this operator", placeholder: "Leon operator id, e.g. cwy-cwy" },
  registration: { label: "Aircraft registration", short: "Registration", icon: "plane", means: "Every flight of this aircraft", placeholder: "e.g. YL-PSA" },
  trip: { label: "Trip number", short: "Trip", icon: "hash", means: "Only the flights on this trip", placeholder: "e.g. 10-2026/21" },
};
const LEVELS: Array<{ k: Level; label: string; d: string }> = [
  { k: "off", label: "Off", d: "No passenger information." },
  { k: "names", label: "Names and seats", d: "Seat, name, nationality and sex." },
  { k: "documents", label: "Names and documents", d: "Also date of birth, document number and expiry — one passenger at a time, logged." },
];
const DECISION_TONE: Record<string, string> = { approved: "bg-cw-success-tint text-cw-success-text", changed: "bg-cw-primary-tint text-cw-text-link", passengers: "cl-sens-badge", refused: "bg-cw-bg-sunken text-cw-text-body", removed: "bg-cw-danger-tint text-cw-danger-text", requested: "bg-cw-bg-sunken text-cw-text-muted" };

const initials = (s: string) => s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const whenUtc = (iso: string | null | undefined) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z` : "");
const ago = (iso: string) => { const ms = Date.now() - new Date(iso).getTime(); if (ms < 3600e3) return `${Math.max(1, Math.floor(ms / 60e3))} min ago`; if (ms < 86400e3) return `${Math.floor(ms / 3600e3)} h ago`; return `${Math.floor(ms / 86400e3)} d ago`; };
const sameScope = (a: ScopeEntry[], b: ScopeEntry[]) => JSON.stringify(normaliseScope(a)) === JSON.stringify(normaliseScope(b));

export default function AdminClientsPage() {
  const toast = useToast();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [ed, setEd] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ClientRow | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [operators, setOperators] = useState<Array<{ oprId: string; name: string }>>([]);
  const [flights, setFlights] = useState<Array<{ oprId: string; registration: string; tripNo: string | null; startTimeUTC: string }>>([]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/admin/clients", { cache: "no-store" });
      if (res.status === 403 || res.status === 401) { setForbidden(true); setState("ready"); return; }
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error((typeof data?.error === "string" && data.error) || `HTTP ${res.status}`);
      setClients(data.clients as ClientRow[]); setDecisions(data.decisions as Decision[]); setState("ready");
    } catch (e) { setLoadError(e instanceof Error ? e.message : OFFLINE); setState("error"); } // public-error-ok: the Error carries our own route's sentence (the clients API answers with its problems list), or OFFLINE
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The wall's own answers, as this admin: operator names for the suggestion row, and the next 7 days of flights for the
  // live "matches N flights" count. Informational — the wall backend enforces scope on every request regardless.
  useEffect(() => {
    fetch("/digital-wall/api/operators", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { const list = (d?.operators ?? d ?? []) as Array<{ oprId?: string; id?: string; name?: string }>; setOperators(list.map((o) => ({ oprId: String(o.oprId ?? o.id ?? ""), name: String(o.name ?? o.oprId ?? "") })).filter((o) => o.oprId)); }).catch(() => {});
    const to = new Date(Date.now() + 7 * 86400e3).toISOString();
    fetch(`/digital-wall/api/flights/normalized?window=all-cached&limit=500&from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(to)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { setFlights(((d?.flights ?? []) as Array<{ oprId: string; registration: string; flight?: { tripNo?: string | null; startTimeUTC?: string } }>).map((r) => ({ oprId: r.oprId, registration: r.registration, tripNo: r.flight?.tripNo ?? null, startTimeUTC: r.flight?.startTimeUTC ?? "" }))); }).catch(() => {});
  }, []);

  const waiting = useMemo(() => clients.filter((c) => c.status === "requested").sort((a, b) => a.requested_at.localeCompare(b.requested_at)), [clients]);
  const approved = useMemo(() => clients.filter((c) => c.status === "approved").sort((a, b) => a.company.localeCompare(b.company)), [clients]);
  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const open = (c: ClientRow) => {
    setOpenId(c.id);
    const fresh = c.status === "requested";
    setEd({ scope: fresh ? [] : normaliseScope(c.scope) as ScopeEntry[], switches: fresh ? [...STARTING_SWITCHES] : normaliseSwitches(c.switches), level: fresh ? "off" : c.passenger_level, consent: fresh ? false : c.consent, note: "", kind: "operator", value: "" });
  };
  const close = () => { setOpenId(null); setEd(null); };
  const matchCount = (scope: ScopeEntry[]) => { const s = normaliseScope(scope); return flights.filter((f) => s.some((e) => (e.kind === "operator" && f.oprId?.toLowerCase() === e.value) || (e.kind === "registration" && f.registration?.toUpperCase() === e.value) || (e.kind === "trip" && f.tripNo && String(f.tripNo) === e.value))).length; };
  const suggestionFor = (c: ClientRow) => { const name = c.company.trim().toLowerCase(); const hit = operators.find((o) => o.name.trim().toLowerCase() === name || o.oprId === name); return hit ? { kind: "operator" as const, value: hit.oprId, why: `A Leon operator with the same name (${hit.name})` } : null; };

  const save = async (c: ClientRow) => {
    if (!ed) return;
    setBusy(true);
    const body = { scope: ed.scope, switches: ed.switches, passengerLevel: ed.level, consent: ed.consent, note: ed.note };
    const url = c.status === "approved" ? `/api/admin/clients/${c.id}` : `/api/admin/clients/${c.id}/approve`;
    try {
      const res = await fetch(url, { method: c.status === "approved" ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error((typeof data?.error === "string" && data.error) || `HTTP ${res.status}`);
      toast.show({ tone: "success", title: c.status === "approved" ? `Changes saved for ${c.company}` : `${c.company} approved`, body: c.status === "approved" ? "They see the change the next time they load a page." : "They can sign in and see their flights now." });
      close(); await load();
    } catch (e) { toast.show({ tone: "danger", title: "Not saved", body: e instanceof Error ? e.message : OFFLINE }); } // public-error-ok: the Error carries our own route's sentence (the clients API answers with its problems list), or OFFLINE
    finally { setBusy(false); }
  };
  const refuse = async (c: ClientRow) => {
    const note = window.prompt(`A note ${c.person_name || c.email} will see on their page (why, and what would help):`, "");
    if (note === null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${c.id}/refuse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error((typeof data?.error === "string" && data.error) || `HTTP ${res.status}`);
      toast.show({ tone: "info", title: `Request from ${c.company} refused` }); close(); await load();
    } catch (e) { toast.show({ tone: "danger", title: "Not saved", body: e instanceof Error ? e.message : OFFLINE }); } // public-error-ok: the Error carries our own route's sentence (the clients API answers with its problems list), or OFFLINE
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${removing.id}/remove`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmCompany: confirmText }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error((typeof data?.error === "string" && data.error) || `HTTP ${res.status}`);
      toast.show({ tone: "info", title: `Access removed for ${removing.company}`, body: "Signed out everywhere. Their record is kept, emptied." });
      setRemoving(null); setConfirmText(""); close(); await load();
    } catch (e) { toast.show({ tone: "danger", title: "Not removed", body: e instanceof Error ? e.message : OFFLINE }); } // public-error-ok: the Error carries our own route's sentence (the clients API answers with its problems list), or OFFLINE
    finally { setBusy(false); }
  };

  const groups = [{ name: "ON THE WALL", items: SWITCHES.filter((s) => s.group === "wall") }, { name: "REFERENCE", items: SWITCHES.filter((s) => s.group === "reference") }];

  function Editor({ c }: { c: ClientRow }) {
    if (!ed) return null;
    const isEdit = c.status === "approved";
    const base = { scope: normaliseScope(c.scope) as ScopeEntry[], switches: normaliseSwitches(c.switches), level: c.passenger_level };
    const blocked = !ed.scope.length || !ed.switches.includes("flight_board") || (ed.level === "documents" && !ed.consent);
    const n = matchCount(ed.scope);
    const sug = !isEdit && !ed.scope.length ? suggestionFor(c) : null;
    const add = (kind: ScopeEntry["kind"], value: string) => { const next = normaliseScope([...ed.scope, { kind, value }]) as ScopeEntry[]; setEd({ ...ed, scope: next, value: "" }); };
    const added = SWITCHES.filter((s) => ed.switches.includes(s.key) && !base.switches.includes(s.key)).map((s) => `+ ${s.label}`);
    const removed = SWITCHES.filter((s) => !ed.switches.includes(s.key) && base.switches.includes(s.key)).map((s) => `− ${s.label}`);
    const levelLabel = LEVELS.find((l) => l.k === ed.level)?.label ?? "";
    const summary = isEdit
      ? (added.length || removed.length || ed.level !== base.level || !sameScope(ed.scope, base.scope) ? `Changes: ${[...added, ...removed, ...(ed.level !== base.level ? [`Passengers: ${levelLabel}`] : []), ...(!sameScope(ed.scope, base.scope) ? ["scope"] : [])].join(", ")}` : "No changes yet.")
      : `${c.company} will see: ${SWITCHES.filter((s) => ed.switches.includes(s.key)).map((s) => s.label).join(", ") || "nothing"}. Passengers: ${levelLabel.toLowerCase()}.`;
    return (
      <div className="border-b border-cw-divider bg-cw-bg-selected px-5 pb-5 pt-4" data-client-editor={c.id}>
        <div className="overflow-hidden rounded-[12px] border border-cw-primary-tint-border bg-cw-bg-surface">
          <div className="grid grid-cols-1 min-[900px]:grid-cols-2">
            <div className="flex flex-col gap-3.5 border-b border-cw-divider p-5 min-[900px]:border-b-0 min-[900px]:border-r">
              <div className="flex flex-col gap-0.5"><span className="text-[15px] font-bold"><span className="mr-2 font-mono text-cw-text-muted">1</span>Scope · which flights exist for them</span><span className="text-[13px] leading-normal text-cw-text-muted">{isEdit ? "Removing a trip takes its flights away at once. You can add it back." : "A data boundary. Flights outside it don’t exist for this client anywhere in the product."}</span></div>
              <div className="flex flex-col gap-2">
                {ed.scope.map((e, i) => (
                  <div key={`${e.kind}:${e.value}`} className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border border-cw-border bg-cw-bg-sunken py-2 pl-2.5 pr-2" data-scope-entry={`${e.kind}:${e.value}`}>
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-cw-bg-surface text-cw-text-body"><MaskIcon name={KIND_META[e.kind].icon} size={15} /></span>
                    <span className="flex min-w-0 flex-col"><span className="font-mono text-[14px] font-semibold">{e.value}</span><span className="text-[12.5px] text-cw-text-muted">{KIND_META[e.kind].short} · {KIND_META[e.kind].means}</span></span>
                    <button type="button" aria-label={`Remove ${e.value} from scope`} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-cw-text-muted hover:bg-cw-bg-hover hover:text-cw-text" onClick={() => setEd({ ...ed, scope: ed.scope.filter((_, j) => j !== i) })}><MaskIcon name="x" size={15} /></button>
                  </div>
                ))}
                {!ed.scope.length && <span className="rounded-[10px] border border-dashed border-cw-warning-border bg-cw-warning-tint p-3 text-[13.5px] text-cw-warning-text">No scope yet. They gave a company name only; you decide what they can see. Without a scope, they see no flights.</span>}
                {sug && <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-cw-border bg-cw-bg-sunken px-3 py-2.5"><MaskIcon name="lightbulb" size={15} className="text-cw-text-muted" /><span className="min-w-[180px] flex-1 text-[13px] leading-snug text-cw-text-body">Suggested: <span className="font-mono font-semibold text-cw-text">{sug.value}</span> · {sug.why}</span><Button size="sm" variant="secondary" icon="plus" onClick={() => add(sug.kind, sug.value)}>Add</Button></div>}
              </div>
              <div className="flex flex-col gap-2 border-t border-cw-divider pt-3">
                <span className="text-[12.5px] font-semibold text-cw-text-muted">Add to scope</span>
                <div className="flex flex-wrap gap-2">
                  <Segmented label="Scope kind" size="sm" value={ed.kind} onChange={(k) => setEd({ ...ed, kind: k, value: "" })} options={SCOPE_KINDS.map((k) => ({ value: k as ScopeEntry["kind"], label: KIND_META[k as ScopeEntry["kind"]].short }))} />
                  <div className="min-w-[140px] flex-1"><TextInput value={ed.value} onChange={(e) => setEd({ ...ed, value: e.target.value })} placeholder={KIND_META[ed.kind].placeholder} mono onKeyDown={(e) => { if (e.key === "Enter" && ed.value.trim()) add(ed.kind, ed.value); }} aria-label="Scope value" /></div>
                  <Button variant="secondary" disabled={!ed.value.trim()} onClick={() => add(ed.kind, ed.value)}>Add</Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-cw-text-body"><MaskIcon name="plane" size={14} className="text-cw-text-muted" />{ed.scope.length ? `Matches ${n} flight${n === 1 ? "" : "s"} in the next 7 days` : "Matches no flights"}</div>
            </div>
            <div className="flex flex-col gap-3 p-5">
              <div className="flex items-start gap-2.5">
                <div className="flex flex-1 flex-col gap-0.5"><span className="text-[15px] font-bold"><span className="mr-2 font-mono text-cw-text-muted">2</span>Access · what they see of those flights</span><span className="text-[13px] leading-normal text-cw-text-muted">{isEdit ? "Their current switches. Changes apply the next time they load a page." : "Starting set applied. Every switch is yours to change."}</span></div>
                <button type="button" className="whitespace-nowrap pt-0.5 text-[13px] font-semibold text-cw-text-link" onClick={() => setEd({ ...ed, switches: [...STARTING_SWITCHES] })}>Reset to starting set</button>
              </div>
              {groups.map((g) => (
                <div key={g.name} className="flex flex-col">
                  <span className="py-1 text-[11px] font-bold tracking-[.08em] text-cw-text-muted">{g.name}</span>
                  {g.items.map((s) => { const v = ed.switches.includes(s.key); const changed = isEdit && v !== base.switches.includes(s.key); const required = Boolean(s.required); return (
                    <button type="button" key={s.key} role="switch" aria-checked={v} aria-label={s.label} disabled={required && v} data-switch={s.key} className="grid min-h-[44px] grid-cols-[20px_minmax(0,1fr)_36px] items-center gap-2.5 border-t border-cw-divider py-1 text-left" onClick={() => setEd({ ...ed, switches: v ? ed.switches.filter((k) => k !== s.key) : [...ed.switches, s.key] })}>
                      <MaskIcon name={SWITCH_ICON[s.key]} size={15} className={v ? "text-cw-text" : "text-cw-text-muted"} />
                      <span className="flex min-w-0 flex-col"><span className={v ? "text-[14px] font-semibold text-cw-text" : "text-[14px] font-medium text-cw-text-body"}>{s.label}{required && <span className="ml-2 text-[11px] font-bold text-cw-text-muted">REQUIRED</span>}{changed && <span className="ml-2 text-[11px] font-bold text-cw-text-link">CHANGED</span>}</span><span className="hidden text-[12.5px] text-cw-text-muted min-[900px]:block">{SWITCH_HINT[s.key]}</span></span>
                      <span aria-hidden className={`relative h-5 w-9 rounded-[10px] transition-colors ${v ? "bg-cw-primary" : "bg-cw-border-strong"}`}><span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]" style={{ left: v ? 18 : 2 }} /></span>
                    </button>); })}
                </div>
              ))}
            </div>
          </div>
          <div className="cl-sens-block mx-5 mb-4 flex flex-col gap-3 rounded-[12px] p-4" data-passenger-level>
            <div className="flex items-start gap-3">
              <span className="cl-sens-tile flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px]"><MaskIcon name="id-card" size={17} /></span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-extrabold">Passenger details</span><span className="cl-sens-tile inline-flex h-5 items-center rounded-[5px] px-1.5 text-[11px] font-bold tracking-[.04em]">PERSONAL DATA</span></span><span className="text-[13.5px] leading-normal text-cw-text-body">A mistake here shows someone’s passport number to a stranger. Choose the least this client needs.</span></div>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-3" role="radiogroup" aria-label="Passenger level">
              {LEVELS.map((l) => { const sel = ed.level === l.k; return (
                <button type="button" role="radio" aria-checked={sel} key={l.k} data-level={l.k} className={`flex gap-2.5 rounded-[10px] border-[1.5px] px-3 py-2.5 text-left ${sel ? (l.k === "documents" ? "cl-sens-selected" : "border-cw-focus bg-cw-bg-surface") : "border-cw-border-control bg-transparent"}`} onClick={() => setEd({ ...ed, level: l.k, consent: l.k === "documents" ? ed.consent : false })}>
                  <span aria-hidden className={`mt-0.5 h-[18px] w-[18px] flex-none rounded-full bg-cw-bg-surface ${sel ? (l.k === "documents" ? "cl-sens-radio" : "border-[5px] border-cw-primary") : "border-[1.5px] border-cw-border-strong"}`} />
                  <span className="flex flex-col gap-0.5"><span className="text-[14px] font-semibold">{l.label}</span><span className="text-[12.5px] leading-snug text-cw-text-muted">{l.d}</span></span>
                </button>); })}
            </div>
            {ed.level === "documents" && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border bg-cw-bg-surface px-3 py-2.5 text-[13.5px] leading-normal cl-sens-border">
                <input type="checkbox" className="mt-0.5 h-[18px] w-[18px]" checked={ed.consent} onChange={(e) => setEd({ ...ed, consent: e.target.checked })} data-consent />
                <span>I’ve confirmed {c.company} may see passport details for these flights: they are the operator, or we hold the operator’s written consent.</span>
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-cw-border bg-cw-bg-sunken px-5 py-3">
            {isEdit && <Button variant="danger-quiet" icon="user-x" onClick={() => { setRemoving(c); setConfirmText(""); }}>Remove access</Button>}
            <span className="min-w-[220px] flex-1 text-[13px] leading-normal text-cw-text-body">{summary}</span>
            {!isEdit && <Button variant="secondary" disabled={busy} onClick={() => void refuse(c)}>Refuse</Button>}
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button icon="check" disabled={blocked || busy} loading={busy} onClick={() => void save(c)} data-approve>{isEdit ? "Save changes" : `Approve ${c.company}`}</Button>
          </div>
        </div>
      </div>
    );
  }

  const header = (title: string, right?: React.ReactNode) => <div className="flex h-[52px] items-center gap-2.5 border-b border-cw-divider px-5"><span className="text-[15px] font-bold">{title}</span>{right}</div>;

  return (
    <PortalShell title="Clients" subtitle="Operators and brokers who sign in to see their own flights. Scope decides which flights exist for a client. Access decides what they see of those flights. Every decision is logged.">
      <div className="flex flex-col gap-5" data-admin-clients>
        {forbidden ? <TableCard><EmptyState icon="lock" title="Clients is for Admins">Your role can’t approve or change client access. An admin can, under Admin → Clients.</EmptyState></TableCard> : (
          <>
            <TableCard className={waiting.length ? "border-cw-warning-border" : ""}>
              {header("Waiting for a decision", <><span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-[10px] px-1.5 font-mono text-[11px] font-semibold ${waiting.length ? "bg-cw-warning-tint text-cw-warning-text" : "bg-cw-bg-sunken text-cw-text-muted"}`}>{waiting.length}</span><span className="flex-1" /><span className="hidden text-[13px] text-cw-text-muted min-[900px]:block">From the sign-in page · oldest last</span></>)}
              {state === "loading" && [46, 38].map((w) => <div key={w} className="flex h-[76px] items-center gap-3.5 border-b border-cw-divider px-5"><Skeleton w={36} h={36} round={18} /><Skeleton w={`${w}%`} h={11} /></div>)}
              {state === "ready" && !waiting.length && <div className="flex items-center gap-3 p-5 text-[13.5px] text-cw-text-body"><MaskIcon name="circle-check" size={17} className="text-cw-success" />No one is waiting. Requests from the sign-in page appear here.</div>}
              {waiting.map((r) => (
                <div key={r.id} data-client-request={r.id}>
                  <div className={`grid grid-cols-[36px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-b border-cw-divider px-5 py-4 min-[900px]:grid-cols-[36px_minmax(0,1fr)_auto] ${openId === r.id ? "bg-cw-bg-selected" : ""}`}>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cw-bg-active text-[13px] font-bold text-cw-text-body">{initials(r.person_name || r.email)}</span>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1"><span className="text-[15px] font-bold">{r.person_name || r.email}</span><span className="text-[14px] text-cw-text-body">{r.company}</span><span className="inline-flex h-5 items-center rounded-[5px] border border-cw-border-control px-1.5 text-[11.5px] font-semibold text-cw-text-muted">{r.kind === "broker" ? "Broker" : "Operator"}</span></div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-cw-text-muted"><span className="font-mono text-[12.5px]">{r.email}</span><span>·</span><span>signed up with email and password</span></div>
                      {r.note && <span className="text-[13.5px] leading-normal text-cw-text-body">“{r.note}”</span>}
                    </div>
                    <div className="col-start-2 flex flex-col items-start gap-2 min-[900px]:col-start-3 min-[900px]:items-end">
                      <span className="whitespace-nowrap font-mono text-[12.5px] text-cw-text-muted">{whenUtc(r.requested_at)} · {ago(r.requested_at)}</span>
                      {openId !== r.id && <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={busy} onClick={() => void refuse(r)}>Refuse</Button><Button size="sm" icon="chevron-down" onClick={() => open(r)} data-review>Review</Button></div>}
                    </div>
                  </div>
                  {openId === r.id && <Editor c={r} />}
                </div>
              ))}
            </TableCard>

            <TableCard>
              {header("Approved clients", <><span className="font-mono text-[12.5px] font-medium text-cw-text-muted">{approved.length}</span><span className="flex-1" /><span className="hidden items-center gap-3.5 text-[12.5px] text-cw-text-muted min-[900px]:flex"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-cw-primary" />Can see</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-cw-border-strong" />Can’t</span></span></>)}
              {state === "ready" && approved.length > 0 && <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_286px_120px_120px_96px] items-end gap-4 border-b border-cw-border bg-cw-bg-sunken px-5 pb-2 pt-2.5 text-[11px] font-bold tracking-[.06em] text-cw-text-muted min-[900px]:grid"><span>CLIENT</span><span>SCOPE</span><span className="grid grid-cols-[repeat(11,22px)] gap-1">{SWITCHES.map((s) => <span key={s.key} title={s.label} className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border border-cw-border bg-cw-bg-surface text-cw-text-body"><MaskIcon name={SWITCH_ICON[s.key]} size={12} /></span>)}</span><span>PASSENGERS</span><span>GRANTED</span><span /></div>}
              {state === "loading" && [52, 40, 60].map((w) => <div key={w} className="flex h-14 items-center border-b border-cw-divider px-5"><Skeleton w={`${w}%`} h={10} /></div>)}
              {state === "error" && <div className="flex flex-wrap items-center gap-3 p-5 text-[13.5px]"><MaskIcon name="cloud-off" size={17} className="text-cw-danger-text" /><span className="min-w-[220px] flex-1"><strong>Couldn’t load clients.</strong> <span className="text-cw-text-muted">Clients keep the access they had; nothing has changed for them. <span className="font-mono">{loadError}</span></span></span><Button size="sm" onClick={() => void load()}>Try again</Button></div>}
              {state === "ready" && !approved.length && <EmptyState icon="building-2" title="No clients yet" compact>When an operator or broker asks for access on the sign-in page, they appear under Waiting. Approving them adds them here.</EmptyState>}
              {approved.map((a) => (
                <div key={a.id} data-client-approved={a.id}>
                  <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-cw-divider px-5 py-3 min-[900px]:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_286px_120px_120px_96px] ${openId === a.id ? "bg-cw-bg-selected" : "hover:bg-cw-bg-hover"}`}>
                    <span className="flex min-w-0 flex-col gap-0.5"><span className="text-[14.5px] font-semibold">{a.company}</span><span className="truncate text-[12.5px] text-cw-text-muted">{a.person_name || a.email} · {a.kind === "broker" ? "Broker" : "Operator"}</span></span>
                    <span className="order-3 col-span-2 flex min-w-0 flex-wrap gap-1.5 min-[900px]:order-none min-[900px]:col-span-1">{normaliseScope(a.scope).map((e) => <span key={`${e.kind}:${e.value}`} className={`cl-scope-${e.kind} inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-1.5 font-mono text-[12px] font-medium`}><MaskIcon name={KIND_META[e.kind as ScopeEntry["kind"]].icon} size={11} />{e.value}</span>)}</span>
                    <span className="hidden grid-cols-[repeat(11,22px)] gap-1 min-[900px]:grid" aria-label={`${normaliseSwitches(a.switches).length} of ${SWITCHES.length} switches`}>{SWITCHES.map((s) => { const v = normaliseSwitches(a.switches).includes(s.key); return <span key={s.key} title={`${s.label}: ${v ? "on" : "off"}`} className="flex h-[22px] w-[22px] items-center justify-center"><span className={`h-2.5 w-2.5 rounded-full ${v ? "bg-cw-primary" : "border-[1.5px] border-cw-border-strong"}`} /></span>; })}</span>
                    <span className="order-4 text-[12.5px] text-cw-text-body min-[900px]:hidden">{normaliseSwitches(a.switches).length} of {SWITCHES.length} switches</span>
                    <span><span className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2 text-[12px] font-semibold ${a.passenger_level === "documents" ? "cl-sens-badge" : a.passenger_level === "names" ? "border-cw-border-control bg-cw-bg-surface text-cw-text-body" : "border-cw-border text-cw-text-muted"}`}><MaskIcon name={a.passenger_level === "documents" ? "id-card" : a.passenger_level === "names" ? "users" : "minus"} size={12} />{a.passenger_level === "documents" ? "Documents" : a.passenger_level === "names" ? "Names" : "Off"}</span></span>
                    <span className="hidden flex-col gap-0.5 font-mono text-[12.5px] text-cw-text-body min-[900px]:flex"><span>{(a.decided_at ?? "").slice(0, 10)}</span><span className="font-sans text-[12px] text-cw-text-muted">by {a.decided_by_email ?? "—"}</span></span>
                    <span className="flex justify-end gap-1.5">{openId !== a.id && <Button variant="secondary" size="sm" icon="sliders-horizontal" onClick={() => open(a)} data-change>Change</Button>}</span>
                  </div>
                  {openId === a.id && <Editor c={a} />}
                </div>
              ))}
            </TableCard>

            <TableCard>
              {header("Decision log", <span className="text-[13px] text-cw-text-muted">Newest first</span>)}
              <div className="hidden h-8 grid-cols-[120px_minmax(0,1fr)_minmax(0,1.6fr)_130px_150px] items-center gap-4 border-b border-cw-border bg-cw-bg-sunken px-5 text-[11px] font-bold tracking-[.06em] text-cw-text-muted min-[900px]:grid"><span>DECISION</span><span>CLIENT</span><span>WHAT CHANGED</span><span>BY</span><span>WHEN (UTC)</span></div>
              {state === "ready" && !decisions.length && <div className="px-5 py-4 text-[13.5px] text-cw-text-muted">No decisions yet.</div>}
              {decisions.map((d) => { const c = byId.get(d.client_id); const det = d.detail as { before?: { scope?: ScopeEntry[]; switches?: string[]; passengerLevel?: string }; after?: { scope?: ScopeEntry[]; switches?: string[]; passengerLevel?: string }; from?: string; to?: string }; const what = d.kind === "passengers" ? `${LEVELS.find((l) => l.k === det.from)?.label ?? det.from} → ${LEVELS.find((l) => l.k === det.to)?.label ?? det.to}` : d.kind === "approved" ? `${normaliseScope(det.after?.scope).map((e) => `${KIND_META[e.kind as ScopeEntry["kind"]].short} ${e.value}`).join(", ")} · ${normaliseSwitches(det.after?.switches).length} switches · ${LEVELS.find((l) => l.k === det.after?.passengerLevel)?.label ?? ""}` : d.kind === "changed" ? [...SWITCHES.filter((s) => normaliseSwitches(det.after?.switches).includes(s.key) && !normaliseSwitches(det.before?.switches).includes(s.key)).map((s) => `+ ${s.label}`), ...SWITCHES.filter((s) => !normaliseSwitches(det.after?.switches).includes(s.key) && normaliseSwitches(det.before?.switches).includes(s.key)).map((s) => `− ${s.label}`), ...(!sameScope((det.before?.scope ?? []) as ScopeEntry[], (det.after?.scope ?? []) as ScopeEntry[]) ? ["scope changed"] : [])].join(", ") || "Saved" : d.kind === "removed" ? "Access ended; record kept, emptied" : d.kind === "refused" ? "Request refused" : "Asked for access"; return (
                <div key={d.id} className="grid min-h-[44px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-b border-cw-divider px-5 py-2 text-[13px] text-cw-text-body min-[900px]:grid-cols-[120px_minmax(0,1fr)_minmax(0,1.6fr)_130px_150px]" data-decision={d.kind}>
                  <span><span className={`inline-flex h-5 items-center gap-1 rounded-[5px] px-1.5 text-[11px] font-bold tracking-[.04em] ${DECISION_TONE[d.kind] ?? DECISION_TONE.requested}`}>{d.kind.toUpperCase()}</span></span>
                  <span className="truncate font-semibold text-cw-text">{c?.company ?? "—"}</span>
                  <span className="col-span-2 flex flex-col gap-0.5 min-[900px]:col-span-1"><span>{what}</span>{d.note && <span className="text-[12px] text-cw-text-muted">Note: {d.note}</span>}</span>
                  <span className="hidden min-[900px]:block">{d.actor_email ?? "—"}</span><span className="hidden font-mono text-[12px] min-[900px]:block">{whenUtc(d.created_at)}</span>
                </div>); })}
            </TableCard>
          </>
        )}
      </div>
      <Modal open={Boolean(removing)} onClose={() => { if (!busy) { setRemoving(null); setConfirmText(""); } }} tone="danger" icon="octagon-alert" title="This cannot be undone" width={520} busy={busy}
        actions={<><Button variant="secondary" onClick={() => { setRemoving(null); setConfirmText(""); }} disabled={busy}>Keep access</Button><Button variant="danger" icon="user-x" disabled={!removing || confirmText.trim().toLowerCase() !== removing.company.trim().toLowerCase() || busy} loading={busy} onClick={() => void remove()} data-remove-confirm>Remove access</Button></>}>
        {removing && (
          <div className="flex flex-col gap-3.5">
            <span className="text-[20px] font-extrabold tracking-tight">Remove access for {removing.company}?</span>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[14.5px] leading-normal"><li>{removing.person_name || removing.email} is signed out on every device, now.</li><li>Their scope ({normaliseScope(removing.scope).length} {normaliseScope(removing.scope).length === 1 ? "entry" : "entries"}) and their {normaliseSwitches(removing.switches).length} switches are emptied. The record stays, so who had what and when can always be answered.</li><li>To come back, they ask again and are approved from scratch.</li></ul>
            <div className="flex gap-2.5 rounded-[10px] bg-cw-bg-sunken px-3 py-2.5 text-[13.5px] leading-normal text-cw-text-body"><MaskIcon name="info" size={15} className="mt-0.5 flex-none text-cw-text-muted" />To stop one trip only, remove that trip from their scope instead. That can be added back.</div>
            <label className="flex flex-col gap-1.5"><span className="text-[13.5px] font-semibold">Type <span className="font-mono">{removing.company}</span> to confirm</span><TextInput value={confirmText} onChange={(e) => setConfirmText(e.target.value)} mono aria-label="Company name to confirm" /></label>
          </div>
        )}
      </Modal>
    </PortalShell>
  );
}
