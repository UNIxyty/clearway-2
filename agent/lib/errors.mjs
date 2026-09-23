// Distinct, reportable failure modes. The caller (and the audit log) must be
// able to tell "the model is not available to this account" from "we are being
// throttled" from "it took too long" — they have different operator responses
// and only one of them is worth retrying on another model.

export class AgentError extends Error {
  constructor(code, message, { status = 500, retryable = false, detail = null } = {}) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.detail = detail;
  }
  toJSON() {
    return { ok: false, error: this.code, message: this.message, retryable: this.retryable };
  }
}

export const ModelUnavailable = (message, detail) =>
  new AgentError("model_unavailable", message, { status: 503, retryable: false, detail });
export const ModelThrottled = (message, detail) =>
  new AgentError("model_throttled", message, { status: 429, retryable: true, detail });
export const ModelTimeout = (message, detail) =>
  new AgentError("model_timeout", message, { status: 504, retryable: true, detail });
export const Unauthorized = (message = "Sign in through the Clearway portal first.") =>
  new AgentError("unauthorized", message, { status: 401 });
export const Forbidden = (message) => new AgentError("forbidden", message, { status: 403 });
export const AgentDisabled = (message) => new AgentError("agent_disabled", message, { status: 503 });
export const BadRequest = (message) => new AgentError("bad_request", message, { status: 400 });

/**
 * Map an AWS SDK error onto one of the reportable kinds. AWS expresses all of
 * these as generic exceptions with meaningful names/messages, so the mapping
 * lives here once rather than at each call site.
 */
export function classifyBedrockError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "");
  const both = `${name} ${message}`;

  if (/ThrottlingException|TooManyRequests|ServiceQuotaExceeded/i.test(both)) {
    return ModelThrottled("Bedrock is throttling requests. Retry shortly.", message);
  }
  if (/TimeoutError|ModelTimeoutException|ETIMEDOUT|AbortError|aborted/i.test(both)) {
    return ModelTimeout("The model did not respond in time.", message);
  }
  if (/not available for this account|ResourceNotFoundException|ValidationException|AccessDeniedException|marketplace|use case details/i.test(both)) {
    return ModelUnavailable("The model is not available to this AWS account or region.", message);
  }
  if (/ServiceUnavailable|InternalServerException|ModelNotReadyException/i.test(both)) {
    return ModelThrottled("Bedrock is temporarily unavailable.", message);
  }
  return new AgentError("model_error", message || "Bedrock call failed.", { status: 502, detail: name });
}
