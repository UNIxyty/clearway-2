// The standard tool error vocabulary. Every tool failure is one of these, so
// the model (and the audit log) sees a small, stable set rather than whatever
// wording an upstream service happened to use.

export const TOOL_ERRORS = ["NOT_FOUND", "NO_PERMISSION", "INVALID_INPUT", "SERVICE_UNAVAILABLE", "TIMEOUT", "TOO_LARGE", "INTERNAL"];

export class ToolError extends Error {
  constructor(code, message, { detail = null, retryable = false } = {}) {
    super(message);
    this.name = "ToolError";
    this.code = TOOL_ERRORS.includes(code) ? code : "INTERNAL";
    this.detail = detail;
    this.retryable = retryable;
  }
  toResult() {
    return { ok: false, error: this.code, message: this.message, ...(this.retryable ? { retryable: true } : {}) };
  }
}

export const NotFound = (message, detail) => new ToolError("NOT_FOUND", message, { detail });
export const NoPermission = (message, detail) => new ToolError("NO_PERMISSION", message, { detail });
export const InvalidInput = (message, detail) => new ToolError("INVALID_INPUT", message, { detail });
export const ServiceUnavailable = (message, detail) => new ToolError("SERVICE_UNAVAILABLE", message, { detail, retryable: true });
export const Timeout = (message, detail) => new ToolError("TIMEOUT", message, { detail, retryable: true });
export const TooLarge = (message, detail) => new ToolError("TOO_LARGE", message, { detail });

/**
 * Map an upstream HTTP status onto the vocabulary. 401 and 403 both become
 * NO_PERMISSION deliberately: from the caller's side "your session does not
 * allow this" is one fact, and distinguishing them would leak whether a
 * resource exists.
 */
export function fromHttpStatus(status, { service, path, body }) {
  const where = `${service} ${path}`;
  if (status === 404) return NotFound(`Not found in ${service}.`, `${where} -> 404`);
  if (status === 401 || status === 403) return NoPermission(`Your account does not have access to this in ${service}.`, `${where} -> ${status}`);
  if (status === 400 || status === 422) return InvalidInput(`${service} rejected the request.`, `${where} -> ${status}: ${String(body).slice(0, 200)}`);
  if (status === 408 || status === 504) return Timeout(`${service} did not respond in time.`, `${where} -> ${status}`);
  if (status === 429) return ServiceUnavailable(`${service} is rate limiting requests.`, `${where} -> 429`);
  if (status >= 500) return ServiceUnavailable(`${service} is unavailable.`, `${where} -> ${status}`);
  return new ToolError("INTERNAL", `Unexpected response from ${service}.`, { detail: `${where} -> ${status}` });
}
