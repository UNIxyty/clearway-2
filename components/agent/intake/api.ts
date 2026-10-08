// Typed client for the intake + mailbox routes (agent/lib/intake/api.mjs). Every call is same-origin through
// /agent/api/*, as the signed-in user. Responses never carry personal data except the two reveal calls.
import { AGENT_BASE } from "../types";

export type FieldState = "extracted" | "converted" | "cross_checked" | "low_confidence" | "checked" | "unknown" | "not_given" | "zero" | "edited" | "invalid" | "tz_unknown" | "not_read" | "leon_refused" | "extra" | "conflict";
export type Field = {
  key: string; label: string; kind: "flightNo" | "airport" | "date" | "time" | "type" | "registration" | "count" | string;
  value: string; said: string | null; source: string | null; state: FieldState; note: string | null; confidence: number | null;
  required: boolean; sent: boolean; saidSame?: boolean;
  utc?: string | null; date?: string | null; localTime?: string | null; zoneWords?: string | null;
  airport?: { icao: string; iata: string | null; city: string | null; tz: string | null };
  aircraft?: { nid: number; type: string | null };
  conflict?: { body: string | null; attachment: string | null; attachmentName: string | null };
  resolvedConflict?: Field["conflict"];
  edited?: { was: string; by: string; at: string }; checked?: { by: string; at: string };
};
export type Service = {
  id: string; no: string; said: string | null; source: string | null; name: string; detail: string | null;
  conditional: boolean; condition: string | null; isNote: boolean; requested: "provide" | "to_confirm" | "decline" | "unclear";
  decision: "provide" | "to_confirm" | "decline" | "note"; answer: string; noteOnChecklist?: boolean;
  // Who decided: the agent's original reading, and the person's change (kept permanently, like a field edit).
  agentDecision?: "provide" | "to_confirm" | "decline" | "note"; decided?: { by: string; at: string; was: string; first: string } | null; kind?: "party" | null;
  checklistNid: number | null; checklistLabel: string | null; lowConfidence: boolean; checked?: { by: string; at: string } | null;
  added: false | { by: string; at: string };
};
export type LeonLegState = { state: "not_sent" | "sending" | "in_leon" | "not_in_leon" | "unknown"; flightNid?: string | null; error?: string | null; at?: string };
export type TzOptions = { stdClock: string; staClock: string; utc: { std: string | null; sta: string | null; departsInMin: number | null }; local: { std: string | null; sta: string | null; departsInMin: number | null }; offsets: ({ icao: string; off: number } | null)[] } | null;
export type Leg = {
  index: number; direction: "inbound" | "outbound" | "ferry" | "added" | null; removed: false | { by: string; at: string }; added: false | { by: string; at: string };
  fields: Field[]; extra: { key: string; label: string; value: string; said: string | null; source: string | null; state: "extra"; note: string | null }[];
  services: Service[]; tzChoice: { choice: "utc" | "local"; by: string; at: string } | null; leon: LeonLegState; inLeon: boolean; tz?: TzOptions;
};
export type Stage = { name: string; state: "done" | "prog" | "wait" | "fail" | "part" | "hold" | "skip" | "none"; at: string | null; doneAt?: string | null; ms: number | null; note: string | null; email?: string | null };
export type AttachmentRole = { id: string | null; name: string; bytes: number; type: string; pages: number | null; inline: boolean; role: "request" | "supporting" | "noise" | "unreadable"; kind: string; why: string; read: boolean; byCode: boolean; override: { by: string | null; at: string } | null; personal: boolean; url: string | null };
export type Duplicate = { error?: string; matches: { leg: number; why: string; leon: { nid: number; flightNo: string; std: string; sta: string; adep: string; ades: string; registration: string | null; created: string; tripNumber: string | null } }[]; ours: { id: string; reference: string; status: string }[]; rows: { field: string; mine: string; theirs: string; differs: boolean }[]; leonIds: number[]; created: string | null; tripNumber: string | null };
export type ChecklistItem = { defNid: number; label: string; decision: "provide" | "to_confirm" | "note"; statusId: string; statusCaption: string; note: string | null; services?: string[]; serviceId?: string };
export type ChecklistResult = ChecklistItem & { leg: number; filled: boolean; reason: string | null; wasOnFlight?: boolean };
export type Write = { leg: number; state: LeonLegState["state"]; flightNid: string | null; tripNid: string | null; error: string | null; httpStatus: number | null; ms: number | null; at: string; updatedAt: string; by: string | null; resolvedBy: string | null; checklist: ChecklistResult[] | null; payload: Record<string, unknown> | null };
// A leg's passengers (Leon's text passenger list) or crew (the flight's OPS notes, never an assignment): counts only.
export type PaxDetail = { people: number; created: number; reused: number; differs: { row: number; fields: string[] }[]; notes: { row: number; notes: string[] }[]; failed: { row: number; reason: string }[] };
export type PeopleWrite = { leg: number; kind: "pax" | "crew"; state: "sending" | "in_leon" | "not_in_leon" | "unknown"; people: number | null; detail?: PaxDetail | null; flightNid: string | null; error: string | null; httpStatus: number | null; at: string; updatedAt: string; by: string | null };
export type PeopleOutcome = { kind: "pax" | "crew"; state: "in_leon" | "not_in_leon" | "unknown" | "none" | "not_sent"; people: number; count?: number | string | null; error?: string; already?: boolean };
export type UiStatusKey = "needs_you" | "needs_review" | "waiting" | "stuck" | "in_progress" | "loaded" | "skipped" | "cancelled" | "handled";
export type Notification = { provider: string; providerName: string; reference: string | null; route: string[]; date: string | null; etd: { time: string; airport: string }[]; pax: string | null; paxPerLeg?: number[] | null; legs?: number | null; paxLegsAgree?: boolean | null; client: string | null; crewNamed: number; calendar: { method: string | null; uid: string | null; sequence: number | null; status: string | null } | null };
export type RequestDetail = {
  request: { id: string; type: "handling" | "scheduled"; typeLabel: string; reference: string; referenceBuilt: boolean; status: string; ui: { key: UiStatusKey; label: string; escalated?: boolean }; statusReason: string | null; sender: string | null; fromAddr: string | null; toAddrs: string[] | null; subject: string | null; receivedAt: string | null; messageId: string; route: string | null; firstStd: string | null; legsCount: number | null; closedReason: string | null; duplicate: Duplicate | null; duplicateResolution: { action: string; by: string; at: string } | null; purged: boolean; hasPersonal: boolean };
  stageNames: string[]; stages: Stage[];
  review: { legs: Leg[]; notes: { text: string; source: string | null }[]; conflicts: unknown[]; requestSource: { attachment: string | null; attachmentId: string | null; why: string; by?: string | null } | null; version: number;
    // Type 1 (scheduled flight): the provider's notification and the look-ups of its reference. No legs: they are the provider's record, not this message.
    kind?: "notification"; notification?: Notification; lookup?: { attempts: { at: string; state: "found" | "not_found" | "unavailable"; why: string | null; listed: number | null; by: string | null }[]; nextAt: string | null; found?: { at: string; row: { quote: string; quoteDate: string; flightDate: string; aircraft: string; typeCode: string } } };
    // E1: the question to ops and its answer (tokens are hashes; never shown).
    // Type 1: the provider cancelled a flight we know (cancel.mjs). legs = what Leon held when it arrived.
    cancellation?: { receivedAt: string; messageId: string; matchedBy: string; uidDiffers: boolean; case: string;
      legs?: { index: number; flightNid: string; std: string | null; departed: boolean; alreadyCancelled: boolean }[];
      approval?: { askedAt: string; deadlineAt: string; to: string[]; answer: { value: "yes" | "no"; by: string; at: string; how: string } | null; expiredNoted?: string } | null;
      outcome?: { at: string; by: string; legs: { index: number; flightNid: string; state: string; error?: string; already?: boolean }[] } | null } | null;
    approval?: { askedAt: string; deadlineAt: string; to: string[]; answer: { value: "yes" | "no"; by: string; at: string; how: string } | null; late?: { at: string; value: string; by: string; how: string }[] } | null;
    // The portal record the legs were read from (non-personal values only).
    record?: { quote: string; quoteDate: string | null; flightDate: string | null; registration: string | null; aircraftName: string | null; cabinConfig: string | null; seats: string | null; crewLinesFilled: number; paxRows: number; totalEstimatedHours: string | null; readAt: string } | null;
    updates?: { at: string; sequence: number | null; changes: string[]; matchedBy: string }[]; copies?: number; cancelled?: { at: string; matchedBy: string } } | null;
  blockers: string[]; warnings: string[];
  attachments: AttachmentRole[]; requestSource: { attachment: string | null; attachmentId: string | null; why: string; by?: string | null } | null;
  sent: { writes: Write[]; firstAt: string | null; lastMs: number | null; people?: PeopleWrite[]; cancels?: { leg: number; state: string; flightNid: string | null; error: string | null; at: string; updatedAt: string; by: string | null }[] };
  checklistPlan: { leg: number; plan: ChecklistItem[]; skipped: { serviceId: string; name: string; why: string }[]; note: { text: string; lines: unknown[]; remarks: unknown[]; parties: unknown[] } }[];
  extractions: { id: string; version: number; model: string; at: string; by: string; tokens: number }[];
  emails: { id: string; kind: string; subject: string; at: string; to: string[]; delivery: string | null }[];
  people: { hasPersonal: boolean; count?: number; legs: Record<string, { crew: number; pax: number }> };
  retention: { days: number };
};
export type ListRow = { id: string; type: "handling" | "scheduled"; statusKey: UiStatusKey; statusLabel: string; from: string; reference: string; referenceBuilt: boolean; route: string; firstStd: string | null; legs: { removed: boolean; state: "in" | "not" | "unknown" | "none" | "removed" }[]; stage: string; updatedAt: string; needsAttention: boolean };
export type Person = { idx?: number; surname?: string; given?: string; splitHow?: "edited" | "comma" | "declared" | "undeclared" | "single"; splitBy?: string | null; splitSaid?: string | null; id?: string | null; added?: { by: string; at: string } | null; role: string | null; salutation?: string | null; sex?: string | null; name: string | null; dob: string | null; nationality: string | null; passport: string | null; expiry: string | null; source: string | null; copied: boolean };
export type People = { legs: { leg: number; crew: Person[]; pax: Person[] }[]; purged: boolean; masked: boolean; nameOrder?: { said: string | null; order: "given_first" | "surname_first" | null } | null; revealedBy?: string; at?: string };
export type Confirmation = { token: string; status: string; expiresAt: string; summary: string };
export type Prepared = { ok: true; runsAs?: string; confirmation: Confirmation; resend: boolean; warnings: string[]; legs: { index: number; payload: Record<string, unknown>; people?: { pax: { people: number; count: number; undeclaredSplits?: number } | null; crew: { people: number; count: string | null } | null }; note?: string; checklist: ChecklistItem[]; skipped: { serviceId: string; name: string; why: string }[] }[]; edited: { leg: number; label: string; value: string }[]; notChecked: { leg: number; label: string; value: string }[]; tripStatus: string };
export type SendResult = { legs: { index: number; state: "in_leon" | "not_in_leon" | "unknown" | "not_sent"; flightNid?: string; tripNid?: string; error?: string; field?: string | null; ms?: number; already?: boolean; people?: PeopleOutcome[] }[]; checklist: { items: ChecklistResult[]; filled: number; total: number; statusesLeftToOps?: boolean }; by: string; at: string; status: string; email: { kind: string; ok: boolean; mode: string; error: string | null } };

// Mailbox
export type MailStatus = "waiting" | "processed" | "not_recognised" | "failed" | "reply" | "ignored" | "sent";
export type MailRow = { id: string; direction: "inbound" | "outbound"; at: string; from: string | null; to: string[]; subject: string | null; status: MailStatus; what: string; ref: string | null; requestId: string | null; requestState: string | null; attachments: number; delivery: string | null; matched: string | null; label?: string | null };
/** How the type was decided: by the message's content or by a person, how sure, and on what evidence. */
export type Classification = { type: "scheduled" | "handling" | "not_for_us" | "ask"; confidence: number; decidedBy: "content" | "person"; reason: string; evidence: { test: string; signal: string; found: boolean; detail: string }[]; by?: string | null; at?: string };
export type Understood = { kind: "processed" | "notrec" | "failed" | "reply" | "replybad" | "ignored" | "notforus" | "wait"; title: string; body?: string; ref?: string | null; refState?: string; checks: [string, "yes" | "no" | "maybe" | "none", string][]; hint?: string; classification?: Classification; calendar?: { uid: string | null; method: string | null; sequence: number | null } | null };
export type MailMessage = {
  id: string; direction: "inbound" | "outbound"; subject: string | null; from: string | null; to: string[]; cc?: string[]; at: string; status: MailStatus; statusReason: string | null;
  understood: Understood | null; history: { at: string; status?: string; reason?: string; by: string; action: string; to?: string }[]; request: { id: string; reference: string; state: string } | null;
  hasPersonal: boolean; purged: boolean; retention: string; ignored: { by: string; reason: string; note: string | null } | null; auth: { spf?: string; dkim?: string; dmarc?: string } | null; rfcMessageId: string | null;
  thread: { id: string; kind: "in" | "out" | "ev"; title: string; sub: string; at: string; current: boolean }[];
  attachments: { id: string; name: string; type: string; declared: string | null; bytes: number; purged: boolean; role: string | null; why: string | null; personal: boolean; url: string }[];
  sent?: { kind: string; resendId: string | null; delivery: string | null; events: { event: string; at: string; detail: string | null }[]; detail: string | null };
};
export type MailBody = { unavailable?: string; purged?: boolean; purgedAt?: string; mode: "html" | "text"; html?: string; text?: string; masks: number; remoteImages?: { host: string; name: string }[]; links?: { text: string; url: string; host: string }[]; hasHtml?: boolean; hasText?: boolean };
export type MailOverview = { counts: { received: number; sent: number; needs: number; processed: number; replies: number; ignored: number; sentNeeds: number; waiting: number }; health: { addresses: { address: string; ok: boolean; lastAt: string | null; why: string | null }[]; resend: { ok: boolean; delayed: number } }; queue: number; notifyTo: string[]; mailMode: string };

export class ApiError extends Error { status: number; blockers?: string[]; constructor(status: number, message: string, blockers?: string[]) { super(message); this.status = status; this.blockers = blockers; } }
async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const r = await fetch(`${AGENT_BASE}${path}`, { credentials: "same-origin", cache: "no-store", ...init, ...(init?.json !== undefined ? { method: init.method ?? "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(init.json) } : {}) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) throw new ApiError(r.status, j?.message ?? `The server answered ${r.status}.`, j?.blockers);
  return j as T;
}
export const intakeApi = {
  overview: () => call<{ health: { mailbox: { ok: boolean; lastAt: string | null; note: string | null }; leon: { ok: boolean }; portals: { built: boolean; lookup: boolean; note: string }; timezones?: { ok: boolean; version: string; minimum: string; latest: string | null; behind: boolean; note: string } }; queue: number }>("/api/intake/overview"),
  list: (q: { tab?: string; q?: string; type?: string }) => call<{ rows: ListRow[]; counts: { all: number; needs: number; progress: number; loaded: number; closed: number } }>(`/api/intake/requests?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`),
  detail: (id: string) => call<RequestDetail>(`/api/intake/requests/${id}`),
  lookup: (id: string) => call<RequestDetail>(`/api/intake/requests/${id}/lookup`, { json: {} }),
  approve: (id: string) => call<RequestDetail>(`/api/intake/requests/${id}/approve`, { json: {} }),
  decline: (id: string) => call<RequestDetail>(`/api/intake/requests/${id}/decline`, { json: {} }),
  peoplePrepare: (id: string, leg: number) => call<{ confirmation: Confirmation; people: number; undeclaredSplits: number; lastState: string | null; flightNid: string }>(`/api/intake/requests/${id}/legs/${leg}/people/prepare`, { json: {} }),
  peopleConfirm: (token: string) => call<{ accepted: boolean; outcome?: unknown }>(`/api/intake/people/${token}/confirm`, { json: {} }),
  cancelAnswer: (id: string, yes: boolean) => call<RequestDetail>(`/api/intake/requests/${id}/cancel-${yes ? "approve" : "decline"}`, { json: {} }),
  edit: (id: string, body: Record<string, unknown>) => call<RequestDetail>(`/api/intake/requests/${id}/edit`, { json: body }),
  reprocess: (id: string, attachmentId?: string | null) => call<RequestDetail>(`/api/intake/requests/${id}/reprocess`, { json: { attachmentId: attachmentId ?? null } }),
  people: (id: string) => call<People>(`/api/intake/requests/${id}/people`),
  reveal: (id: string) => call<People>(`/api/intake/requests/${id}/people/reveal`, { json: {} }),
  editPeople: (id: string, body: { op: "add"; leg: number; list: "crew" | "pax"; person: Partial<Record<"role" | "name" | "dob" | "nationality" | "passport" | "expiry", string>> } | { op: "remove"; personId: string } | { op: "split"; idx: number; surname: string; given: string }) => call<People>(`/api/intake/requests/${id}/people/edit`, { json: body }),
  prepare: (id: string) => call<Prepared>(`/api/intake/requests/${id}/prepare`, { json: {} }),
  confirm: (token: string) => call<{ accepted: true; requestId: string; already?: boolean }>(`/api/intake/send/${token}/confirm`, { json: {} }),
  sendStatus: (token: string) => call<{ status: string; result: SendResult | null }>(`/api/intake/send/${token}`),
  cancel: (token: string) => call<{ ok: true }>(`/api/intake/send/${token}/cancel`, { json: {} }),
  resolveLeg: (id: string, leg: number, action: "check" | "not_in_leon") => call<RequestDetail & { outcome: { found?: boolean; message?: string; flightNid?: string } }>(`/api/intake/requests/${id}/legs/${leg}/${action}`, { json: {} }),
  definitions: () => call<{ definitions: { nid: number; label: string; section: string }[] }>("/api/intake/checklist-definitions"),
};
export const mailboxApi = {
  access: () => call<{ allowed: boolean; readersCount: number }>("/api/mailbox/access"),
  overview: (days = 7) => call<MailOverview>(`/api/mailbox/overview?days=${days}`),
  list: (q: { box: "received" | "sent"; view: string; q?: string; days?: number; address?: string }) => call<{ rows: MailRow[]; personalQuery: boolean }>(`/api/mailbox/messages?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`),
  message: (id: string) => call<{ message: MailMessage }>(`/api/mailbox/messages/${id}`),
  body: (id: string, mode: "html" | "text", images: boolean) => call<{ body: MailBody }>(`/api/mailbox/messages/${id}/body?mode=${mode}${images ? "&images=1" : ""}`),
  reveal: (id: string, mode: "html" | "text", images: boolean) => call<{ values: string[]; revealedBy: string }>(`/api/mailbox/messages/${id}/reveal?mode=${mode}${images ? "&images=1" : ""}`, { json: {} }),
  raw: (id: string) => call<{ headers: [string, string][]; raw: string; auth: MailMessage["auth"] }>(`/api/mailbox/messages/${id}/raw`),
  rawDownloadUrl: (id: string) => `${AGENT_BASE}/api/mailbox/messages/${id}/raw?download=1`,
  action: (id: string, verb: "ignore" | "unignore" | "reprocess" | "forward" | "process-handling" | "process-notification", body: Record<string, unknown> = {}) => call<{ message?: MailMessage; confirmation?: Confirmation; result?: { requestId?: string; reference?: string; status?: string; failed?: string } }>(`/api/mailbox/messages/${id}/${verb}`, { json: body }),
};
