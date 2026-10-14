// What a person sees when something in the agent fails: what happened, then what to do, in our own words.
// The detail — an exception's message, a stack, an upstream body (Bedrock, ElevenLabs, Brave/Tavily, Resend, Leon,
// Supabase), a missing setting — goes to the server log and nowhere else. We do not control what an upstream service
// puts in an error body, so that is also how a token or a passenger's name would reach a screen.
//
// Codes stay machine-readable ("model_error", "SERVICE_UNAVAILABLE"); the console tells cases apart by them and does
// not print them as prose.

/** Log the raw detail under a tag, the way server.mjs logs. Never put the result of this anywhere a person sees. */
export function logDetail(tag, what, detail) {
  const d = detail instanceof Error ? (detail.stack || `${detail.name}: ${detail.message}`) : detail;
  console.error(`[${tag}] ${what}${d === undefined || d === null || d === "" ? "" : `: ${typeof d === "string" ? d : JSON.stringify(d)}`}`);
}

/** The common ending when the reason is only in the log. */
export const IN_THE_LOG = "The detail is in the server log.";
export const STEP_FAILED = `The step failed. ${IN_THE_LOG}`;

/** A failed reply (stream error event, and the `error` stored on the reply), by AgentError code. */
export const REPLY_FAILED = {
  model_unavailable: "The assistant is not available right now. Try again in a few minutes. If it does not come back, tell your administrator.",
  model_throttled: "The assistant is busy right now. Wait a minute, then ask again.",
  model_timeout: "The answer took too long. Ask again.",
  model_error: "Something went wrong while answering. Try again.",
  internal_error: "Something went wrong while answering. Try again.",
};
export const REPLY_FAILED_DEFAULT = REPLY_FAILED.model_error;
/** Saved reply errors whose own wording is ours and worth keeping on reload (not in REPLY_FAILED: that overrides). */
const SAVED_REPLY_TEXT = {
  attachment_rejected: "The model could not open one of the attached files. Remove it or attach it in another format (for example a PDF export or a smaller image) and ask again.",
};

/** A failed tool step, by the tool error code. The model still gets the tool's own short reason. */
export const STEP_FAILED_BY_CODE = {
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
export const stepFailedText = (code) => STEP_FAILED_BY_CODE[String(code ?? "")] ?? STEP_FAILED;

/** A code is short, one word, letters/digits/underscores. Anything else is text and is not trusted. */
export const isCode = (s) => typeof s === "string" && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(s);

/** "code: our wording" for a stored error column; `code` must be a code. */
export const storedError = (code, wording) => `${isCode(code) ? code : "error"}: ${wording}`;

/**
 * A stored reply error ("code: anything") re-worded from its code. Rows written before 2026-10-14 can hold the raw
 * exception after the code; only the code is kept.
 */
export function publicStoredError(value) {
  if (value == null || value === "") return null;
  const code = String(value).split(":")[0].trim();
  if (!isCode(code)) return storedError("error", REPLY_FAILED_DEFAULT);
  return storedError(code, REPLY_FAILED[code] ?? SAVED_REPLY_TEXT[code] ?? REPLY_FAILED_DEFAULT);
}

/** A stored step (tool_activity entry) with a failed step's summary replaced by our wording. */
export function publicStep(step) {
  if (!step || typeof step !== "object" || step.ok !== false) return step;
  return { ...step, error: isCode(step.error) ? step.error : null, summary: stepFailedText(step.error) };
}

/** A routing / escalation reason as stored: the part before ": " when it is one of ours that once carried raw text. */
export function publicRoutingReason(reason) {
  if (reason == null) return reason;
  const s = String(reason);
  if (/^router unavailable/i.test(s)) return "router unavailable";
  if (/^first attempt failed/i.test(s)) return "first attempt failed";
  return s;
}
