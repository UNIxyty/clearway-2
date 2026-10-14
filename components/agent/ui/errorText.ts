// What the Ops Agent shows when something fails: what happened, then what to do, in our own words. An exception's
// message, a response body, a database error or a setting name is never shown — the detail is in the server log
// (agent/lib/public-errors.mjs). The agent's own API messages are written for a person; `personText` still refuses
// anything that reads like a developer's text, because rows saved before 2026-10-14 can hold it.

export const IN_THE_LOG = "The detail is in the server log.";
export const STEP_FAILED = `The step failed. ${IN_THE_LOG}`;
export const TRY_AGAIN = "Something went wrong. Try again. If it keeps failing, tell your administrator.";
export const NO_CONNECTION = "The assistant could not be reached. Check your connection and try again.";
export const REPLY_FAILED = "Something went wrong while answering. Try again.";

/** A failed tool step, by its error code. Mirrors agent/lib/public-errors.mjs. */
const STEP_FAILED_BY_CODE: Record<string, string> = {
  NOT_FOUND: "Nothing was found for this step.",
  NO_PERMISSION: "Your account is not allowed to do this step.",
  CAPABILITY_OFF: "This is switched off in Agent settings.",
  INVALID_INPUT: "The step could not run with these details.",
  SERVICE_UNAVAILABLE: "The service for this step did not answer. Try again in a few minutes.",
  TIMEOUT: "The step took too long. Try again.",
  TOO_LARGE: "The result was too large. Ask for less.",
  CONFIRMATION_INVALID: "The confirmation is no longer valid. Ask again.",
  INTERNAL: STEP_FAILED,
};
export const stepFailedText = (code: string | null | undefined): string => STEP_FAILED_BY_CODE[String(code ?? "")] ?? STEP_FAILED;

/** A code: one short word of letters, digits and underscores. Codes are for telling cases apart, not for reading. */
export const isCode = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(s);

// What a developer's text looks like: a URL or API path, "X -> 400", a stack, an exception name, a setting name,
// JSON, an HTTP status, or the name of a service we call.
const TECHNICAL = [
  /https?:\/\//i, /\/(api|rest)\//i, /->|=>/, /\n\s*at\s/, /\bat\s+\S+\s+\(/,
  /\b\w*(Error|Exception)\b/, /\bE(CONN\w+|TIMEDOUT|NOENT|ACCES|PIPE|AI_AGAIN)\b/,
  /\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/, /\{\s*"|"\s*:\s*["\d{[]/, /\bHTTP\s?\d{3}\b/i, /\b(status|code)\s*:?\s*\d{3}\b/i,
  /\b(Supabase|PostgREST|GraphQL|Bedrock|ElevenLabs|Scribe|Tavily|Brave|Resend|Playwright|Cohere|Titan|undefined|null)\b/,
];
export const looksTechnical = (s: string): boolean => TECHNICAL.some((re) => re.test(s));

/** The kill switch's own failure text (not a reason anyone typed): the settings row could not be read. */
export const KILL_SWITCH_UNREADABLE = /Agent settings (unreadable|row is missing)|Supabase is not configured|failing closed/i;
export const KILL_SWITCH_UNREADABLE_TEXT = "The agent's settings could not be read, so it is off for safety. Try again in a few minutes.";

/** `text` when it is a person's sentence, otherwise `fallback`. */
export function personText(text: unknown, fallback: string): string {
  const s = typeof text === "string" ? text.trim() : "";
  return s && !looksTechnical(s) ? s : fallback;
}

/** The `message` of one of the agent's JSON answers, when it is a person's sentence; otherwise `fallback`. */
export const apiMessage = (body: unknown, fallback: string): string =>
  personText(body && typeof body === "object" ? (body as { message?: unknown }).message : undefined, fallback);

/** An Error whose message is already a person's sentence (ours, or the agent's own API text checked by personText). */
export class ShownError extends Error {
  code: string | null;
  constructor(message: string, code: string | null = null) { super(message); this.name = "ShownError"; this.code = code; }
}
/** The message of a ShownError, otherwise `fallback`. Never an exception's own message. */
export const shownText = (e: unknown, fallback: string): string => (e instanceof ShownError ? e.message : fallback); // public-error-ok: only a ShownError, whose message is ours by construction

/** A routing or escalation reason: the two that once carried a model's error text keep only their first words. */
export function routingReason(reason: string | null | undefined): string | null {
  if (reason == null) return null;
  if (/^router unavailable/i.test(reason)) return "router unavailable";
  if (/^first attempt failed/i.test(reason)) return "first attempt failed";
  return reason;
}

/**
 * A tool's stored result with every error text replaced by STEP_FAILED (a code such as "SERVICE_UNAVAILABLE" stays).
 * On a failed call the top-level message and reason are replaced too: they came from the failure.
 */
const ERROR_KEY = /error|^(problem|detail|diagnostic|stack)$/i;
export function withoutErrorText(value: unknown, failed = false, depth = 0): unknown {
  if (value == null || typeof value !== "object" || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => withoutErrorText(v, failed, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (ERROR_KEY.test(k) && (typeof v === "string" ? v !== "" && !isCode(v) : v != null && typeof v === "object")) out[k] = STEP_FAILED;
    else if (failed && depth === 0 && (k === "message" || k === "reason") && typeof v === "string" && !isCode(v)) out[k] = STEP_FAILED;
    else out[k] = withoutErrorText(v, failed, depth + 1);
  }
  return out;
}
