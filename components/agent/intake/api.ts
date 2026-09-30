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
export type UiStatusKey = "needs_you" | "needs_review" | "waiting" | "stuck" | "in_progress" | "loaded" | "skipped" | "cancelled" | "handled";
export type RequestDetail = {
  request: { id: string; type: "handling" | "scheduled"; typeLabel: string; reference: string; referenceBuilt: boolean; status: string; ui: { key: UiStatusKey; label: string; escalated?: boolean }; statusReason: string | null; sender: string | null; fromAddr: string | null; toAddrs: string[] | null; subject: string | null; receivedAt: string | null; messageId: string; route: string | null; firstStd: string | null; legsCount: number | null; closedReason: string | null; duplicate: Duplicate | null; duplicateResolution: { action: string; by: string; at: string } | null; purged: boolean; hasPersonal: boolean };
  stageNames: string[]; stages: Stage[];
  review: { legs: Leg[]; notes: { text: string; source: string | null }[]; conflicts: unknown[]; requestSource: { attachment: string | null; attachmentId: string | null; why: string; by?: string | null } | null; version: number } | null;
  blockers: string[]; warnings: string[];
  attachments: AttachmentRole[]; requestSource: { attachment: string | null; attachmentId: string | null; why: string; by?: string | null } | null;
  sent: { writes: Write[]; firstAt: string | null; lastMs: number | null };
  checklistPlan: { leg: number; plan: ChecklistItem[]; skipped: { serviceId: string; name: string; why: string }[] }[];
  extractions: { id: string; version: number; model: string; at: string; by: string; tokens: number }[];
  emails: { id: string; kind: string; subject: string; at: string; to: string[]; delivery: string | null }[];
  people: { hasPersonal: boolean; count?: number; legs: Record<string, { crew: number; pax: number }> };
  retention: { days: number };
};
export type ListRow = { id: string; type: "handling" | "scheduled"; statusKey: UiStatusKey; statusLabel: string; from: string; reference: string; referenceBuilt: boolean; route: string; firstStd: string | null; legs: { removed: boolean; state: "in" | "not" | "unknown" | "none" | "removed" }[]; stage: string; updatedAt: string; needsAttention: boolean };
export type Person = { role: string | null; name: string | null; dob: string | null; nationality: string | null; passport: string | null; expiry: string | null; source: string | null; copied: boolean };
export type People = { legs: { leg: number; crew: Person[]; pax: Person[] }[]; purged: boolean; masked: boolean; revealedBy?: string; at?: string };
export type Confirmation = { token: string; status: string; expiresAt: string; summary: string };
export type Prepared = { ok: true; runsAs?: string; confirmation: Confirmation; resend: boolean; warnings: string[]; legs: { index: number; payload: Record<string, unknown>; checklist: ChecklistItem[]; skipped: { serviceId: string; name: string; why: string }[] }[]; edited: { leg: number; label: string; value: string }[]; notChecked: { leg: number; label: string; value: string }[]; tripStatus: string };
export type SendResult = { legs: { index: number; state: "in_leon" | "not_in_leon" | "unknown" | "not_sent"; flightNid?: string; tripNid?: string; error?: string; field?: string | null; ms?: number; already?: boolean }[]; checklist: { items: ChecklistResult[]; filled: number; total: number }; by: string; at: string; status: string; email: { kind: string; ok: boolean; mode: string; error: string | null } };

// Mailbox
export type MailStatus = "waiting" | "processed" | "not_recognised" | "failed" | "reply" | "ignored" | "sent";
export type MailRow = { id: string; direction: "inbound" | "outbound"; at: string; from: string | null; to: string[]; subject: string | null; status: MailStatus; what: string; ref: string | null; requestId: string | null; requestState: string | null; attachments: number; delivery: string | null; matched: string | null };
export type Understood = { kind: "processed" | "notrec" | "failed" | "reply" | "replybad" | "ignored" | "wait"; title: string; body?: string; ref?: string; refState?: string; checks: [string, "yes" | "no" | "maybe" | "none", string][]; hint?: string };
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
  overview: () => call<{ health: { mailbox: { ok: boolean; lastAt: string | null; note: string | null }; leon: { ok: boolean }; portals: { built: boolean; note: string } }; queue: number }>("/api/intake/overview"),
  list: (q: { tab?: string; q?: string; type?: string }) => call<{ rows: ListRow[]; counts: { all: number; needs: number; progress: number; loaded: number; closed: number } }>(`/api/intake/requests?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`),
  detail: (id: string) => call<RequestDetail>(`/api/intake/requests/${id}`),
  edit: (id: string, body: Record<string, unknown>) => call<RequestDetail>(`/api/intake/requests/${id}/edit`, { json: body }),
  reprocess: (id: string, attachmentId?: string | null) => call<RequestDetail>(`/api/intake/requests/${id}/reprocess`, { json: { attachmentId: attachmentId ?? null } }),
  people: (id: string) => call<People>(`/api/intake/requests/${id}/people`),
  reveal: (id: string) => call<People>(`/api/intake/requests/${id}/people/reveal`, { json: {} }),
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
  action: (id: string, verb: "ignore" | "unignore" | "reprocess" | "forward" | "process-handling", body: Record<string, unknown> = {}) => call<{ message?: MailMessage; confirmation?: Confirmation; result?: { requestId?: string; reference?: string; status?: string; failed?: string } }>(`/api/mailbox/messages/${id}/${verb}`, { json: body }),
};
