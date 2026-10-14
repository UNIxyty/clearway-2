// What a person sees when something fails on the Digital Wall: what happened and what to do, in our own words.
// The detail — an exception, an upstream body (Leon, Resend, Supabase, the portal, CheckWX), a database error, a
// stack, a setting that is missing — goes to the server log, never to a screen: we do not control what an upstream
// service puts in an error, so that is also how a token or a passenger's name would reach the wall or the console.
// Same rule as the portal's lib/public-error.ts; this is the wall server's copy (plain Node, no Next).

/** Common endings: what to do next. */
export const TRY_AGAIN = "Try again in a few minutes. If it keeps failing, report it from Help & support.";
export const REPORT_IT = "If it keeps failing, report it from Help & support.";

/**
 * An error whose message is our own wording, written for the person on purpose (a validation refusal such as
 * "Every clock needs a label."). Only these messages are passed to a screen; every other thrown error is logged
 * and replaced by a message for the action that failed.
 */
export class PublicError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "PublicError";
  }
}

export function isPublicError(error) {
  return error instanceof PublicError;
}

/** The raw text of an error, for the log and for internal checks only. Never send it to a screen. */
export function errorDetail(error) {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

/** Log the detail on the server, under a tag that says where it came from. */
export function logFailure(tag, what, detail) {
  const d = detail instanceof Error ? (detail.stack || `${detail.name}: ${detail.message}`) : detail;
  console.error(`[${tag}] ${what}`, d === undefined ? "" : d);
}

/** The text to show for a caught error: its own message when it is a PublicError, otherwise `fallback`. */
export function shownMessage(error, fallback) {
  return isPublicError(error) ? error.message : fallback; // public-error-ok: only a PublicError, our own wording
}

// ── Reasons kept in state that a screen reads later ─────────────────────────
// Background jobs (Leon sync, NOTAM check, webhooks, email) keep a reason that the console or the wall shows
// later, sometimes after a restart. Each reason is built here from a fixed sentence with a few short values
// (an operator id, an ICAO code, a count, a time). When state is served, a stored text that is not one of these
// sentences — raw text saved before this rule, or anything else — is replaced by our own wording.

const VALUE = "[A-Za-z0-9][A-Za-z0-9 ,.:_-]{0,160}";
const KNOWN = [];

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reason(template) {
  const parts = template.split(/\{\w+\}/);
  KNOWN.push(new RegExp(`^${parts.map(escapeRe).join(VALUE)}$`));
  return (vars = {}) => template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? "").replace(/[^A-Za-z0-9 ,.:_-]/g, "").slice(0, 160) || "?");
}

export const REASONS = {
  // Leon sync (leon-sync.mjs, operators-store.mjs) — per operator and for the whole feed.
  leonSignIn: reason("Leon refused the sign-in for operator {opr}. Check the operator's Leon token on the Operators page."),
  leonNoAnswer: reason("Leon did not answer for operator {opr}. The wall tries again on its own."),
  leonLimited: reason("Leon is limiting requests for operator {opr}. The wall tries again on its own."),
  leonFailed: reason("Couldn't get flights from Leon for operator {opr}. The wall tries again on its own."),
  leonTokenUnreadable: reason("The saved Leon token for operator {opr} cannot be read. Enter the token again on the Operators page."),
  leonManyNoAnswer: reason("Leon did not answer for {count} operators: {list}. The wall tries again on its own."),
  leonMany: reason("Leon sync is failing for {count} operators: {list}. The Operators page shows the reason for each."),
  leonPaused: reason("Leon is limiting requests from the wall. Sync is paused until {time} and then starts again on its own."),
  leonNoOperators: reason("No Leon operators are set up. Add one on the Operators page."),
  leonTooLong: reason("A Leon sync took too long and was stopped. The next one starts on its own."),
  leonOperatorsUnreadable: reason("The wall could not read the list of operators. It tries again on its own."),
  leonSyncFailed: reason("Leon sync failed. The wall tries again on its own."),
  leonLastSyncFailed: reason("The last Leon sync for this operator failed. The wall tries again on its own."),

  // NOTAMs and documents through the portal (portal-client.mjs, notam-check.mjs, aip-send.mjs).
  notamsNotConnected: reason("The wall is not connected to the portal, so it cannot get NOTAMs. Report it from Help & support."),
  notamsUnavailable: reason("Couldn't get NOTAMs for {icao}. Try again in a few minutes."),
  notamsSourceDown: reason("The NOTAM source is not available right now. Try again in a few minutes."),
  notamsFailed: reason("Couldn't get NOTAMs for this airport. Try again in a few minutes."),
  badIcao: reason("This airport code is not valid."),
  docsNotConnected: reason("The wall is not connected to the portal, so it cannot get documents. Report it from Help & support."),
  aipUnavailable: reason("The AIP for {icao} is not available right now. Try again in a few minutes."),
  genUnavailable: reason("GEN 1.2 for {icao} is not available right now. Try again in a few minutes."),
  docUnavailable: reason("This document is not available right now. Try again in a few minutes."),
  noDocuments: reason("No document could be produced. The reason is shown next to each document."),
  docsSendFailed: reason("Couldn't send the documents. Try again in a few minutes. If it keeps failing, report it from Help & support."),

  // NOTAM check (notam-check.mjs).
  notamCheckFailed: reason("The NOTAM check did not finish. Press Run check now to try again. If it keeps failing, report it from Help & support."),
  notamEmailNoRecipient: reason("No one is set to receive the NOTAM email. Add a recipient under Settings, NOTAM digest."),
  notamEmailNotSet: reason("This wall cannot send email right now. Report it from Help & support."),
  notamEmailFailed: reason("Couldn't send the NOTAM email. The wall tries again with the next reminder. If it keeps failing, report it from Help & support."),

  // Alert scan (alerts.mjs).
  scanNotConnected: reason("The wall is not connected to the portal, so the NOTAM scan cannot run. Report it from Help & support."),
  scanFailed: reason("The NOTAM scan did not finish. Try again in a few minutes."),

  // Weather (checkwx.mjs).
  weatherUnavailable: reason("Weather is not available right now."),

  // Leon webhooks (leon-webhooks.mjs).
  webhookRepullFailed: reason("Couldn't update the flight from Leon after this event. The next sync tries again."),
  webhookRegisterFailed: reason("Couldn't register {event} with Leon. Try again with Re-register."),
  webhookRemoveFailed: reason("Couldn't remove {event} from Leon. Try again in a few minutes."),
  webhookLeonNoAnswer: reason("Leon did not answer. Press Refresh to try again in a few minutes."),
  webhookFailed: reason("A webhook change with Leon failed. Try again with Re-register."),
};

/** True when `text` is one of the reasons above (with its short values filled in). */
export function isKnownReason(text) {
  return typeof text === "string" && KNOWN.some((re) => re.test(text));
}

/**
 * The stored reason as a screen may show it: null/empty stays as it is; one of our sentences passes; anything
 * else (raw text from before this rule) becomes `fallback`.
 */
export function shownReason(text, fallback) {
  if (text === null || text === undefined || text === "") return text ?? null;
  return isKnownReason(text) ? text : fallback;
}
