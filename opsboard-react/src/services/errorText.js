// What the wall and the console show when something fails: what happened and what to do, in our own words.
// The wall server already answers with such a sentence (digital-wall/lib/public-error.mjs); the API helpers wrap it
// in a ShownError. Anything else that reaches a catch — a network failure, an HTML error page that is not JSON, a
// bug in the page — is never shown as it is: the person gets our sentence and the detail goes to the browser console.

export const TRY_AGAIN = 'Try again in a few minutes. If it keeps failing, report it from Help & support.';
export const CONNECTION = "Couldn't reach the wall server. Check the connection and try again.";
export const SOMETHING_WRONG = `Something went wrong. ${TRY_AGAIN}`;

/** An error whose message is meant for the person (the server's sentence, or ours). */
export class ShownError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ShownError';
  }
}

/** The JSON body of a response, or {} when it is not JSON (a gateway's HTML error page). */
export async function readPayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * The error to throw for a failed request: the server's sentence when it sent one, otherwise `what` (e.g.
 * "Couldn't save the operator.") with what to do next. Never the status text or the raw body.
 */
export function failureFrom(payload, what) {
  const text = payload && typeof payload.error === 'string' ? payload.error.trim() : '';
  return new ShownError(text || `${what} ${TRY_AGAIN}`);
}

function looksLikeNetworkFailure(err) {
  if (!(err instanceof TypeError)) return false;
  const text = String(err.message || '');
  return /fetch|network|load failed|connection/i.test(text);
}

/** The text to show for a caught error. */
export function errorText(err, fallback = SOMETHING_WRONG) {
  if (err instanceof ShownError) return err.message;
  // eslint-disable-next-line no-console
  console.error(err);
  if (looksLikeNetworkFailure(err)) return CONNECTION;
  return fallback;
}
