// Person-facing wording for failures, safe to import in the browser. A page shows these, or the `error` field of the
// portal's own API (which is written for a person too) — never an exception's message, a response body, or a
// Supabase error string. See lib/public-error.ts for the server side.

/** Common endings: what to do next. */
export const TRY_AGAIN = "Try again in a few minutes. If it keeps failing, report it from Help & support.";
export const REPORT_IT = "If it keeps failing, report it from Help & support.";

/** A fetch that never got an answer (offline, DNS, the server is down). */
export const OFFLINE = "Couldn't reach the portal. Check your connection and try again.";

/** On pages a signed-out person sees (sign in, sign up, reset): Help & support needs a session. */
export const TRY_AGAIN_SIGNED_OUT = "Try again in a few minutes. If it keeps failing, contact your Clearway administrator.";

/** The `error` field of one of our own API responses, or `fallback` when there is none. */
export function apiErrorText(body: unknown, fallback: string): string {
  const e = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  return typeof e === "string" && e.trim() ? e : fallback;
}

/**
 * Our wording for a Supabase Auth error from the browser client (sign in, password change). Supabase's own message
 * is not shown; its `code` / `status` choose the sentence.
 */
export function authErrorText(err: unknown, fallback: string): string {
  const e = (err ?? {}) as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const said = String(e.message ?? ""); // matched against, never shown
  if (code === "invalid_credentials" || /invalid login credentials/i.test(said)) return "The email or password is not correct.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(said)) {
    return "Confirm your email first. Open the confirmation email we sent you.";
  }
  if (code === "same_password") return "Choose a password you have not used before.";
  if (code === "email_exists") return "That email is already used by another account.";
  if (code === "email_address_invalid") return "That doesn't look like an email address.";
  if (code === "weak_password") return "This password is too weak. Use a longer password with letters and numbers.";
  if (code === "user_banned") return "This account is blocked. Contact your Clearway administrator.";
  if (status === 429 || /rate_limit/.test(code)) return "Too many attempts. Wait a few minutes, then try again.";
  if (e.name === "AuthRetryableFetchError" || e.name === "TypeError" || (status === 0 && !code && /fetch|network/i.test(said))) {
    return OFFLINE;
  }
  return fallback;
}

/** An error whose message is already worded for a person (ours, or the `error` of our own API). */
export class ShownError extends Error {}

/** What to show for a caught error: a ShownError as it is; a fetch that got no answer as OFFLINE; anything else as `fallback`. */
export function shownText(err: unknown, fallback: string): string {
  if (err instanceof ShownError) return err.message;
  if (err instanceof TypeError) return OFFLINE;
  return fallback;
}
