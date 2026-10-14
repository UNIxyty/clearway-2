// What a person sees when an AIP or GEN sync fails. The sync worker's own text (an exception, a model provider's
// billing message, a scraper log line) goes to the server log; the page gets our wording and a `code` it can act on.
import { TRY_AGAIN } from "@/lib/public-error";

export type AipSyncFailure = { error: string; code?: string | number };

export const AIP_NOT_SET_UP = "Getting AIP documents is not set up on this server. Report it from Help & support.";
export const AIP_NO_ANSWER = `The AIP service did not answer. ${TRY_AGAIN}`;
export const AIP_FAILED = `The AIP source did not send the document. ${TRY_AGAIN}`;
export const GEN_FAILED = `The AIP source did not send GEN 1.2. ${TRY_AGAIN}`;
export const AIP_NO_CREDIT =
  "The service that reads AIP documents is not available right now. The portal team has to fix it. Report it from Help & support.";
export const AIP_CAPTCHA = "This country's AIP site asks for a captcha check. Complete the check when the portal asks, then try again.";
export const AIP_NOT_FOUND =
  "This airport was not found in EAD. It may not be published in the civilian AIP for this AIRAC cycle.";

/** Our wording for a failed sync, chosen from the worker's `error` / `detail` / `code` (which are logged, not shown). */
export function aipSyncFailure(
  event: { error?: unknown; detail?: unknown; code?: unknown; status?: unknown },
  fallback: string = AIP_FAILED,
): AipSyncFailure {
  const error = typeof event.error === "string" ? event.error : "";
  const detail = typeof event.detail === "string" ? event.detail : "";
  if (event.code === 402 || event.status === 402 || /Insufficient (API )?credits/i.test(`${error} ${detail}`)) {
    return { error: AIP_NO_CREDIT, code: 402 };
  }
  if (/captcha-protected/i.test(detail) || /\[greece\]|\[netherlands\]|\[lithuania\]/i.test(detail)) {
    return { error: AIP_CAPTCHA, code: "captcha" };
  }
  const combined = `${error} ${detail}`.toLowerCase();
  if (combined.includes("not found in search results") || combined.includes("may not exist in ead")) {
    return { error: AIP_NOT_FOUND, code: "not_found" };
  }
  return { error: fallback };
}

export const PDF_FAILED = `The portal could not load the PDF. ${TRY_AGAIN}`;
export const GEN_PDF_FAILED = `The portal could not load the GEN 1.2 PDF. ${TRY_AGAIN}`;
