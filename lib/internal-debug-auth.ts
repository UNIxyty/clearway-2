import type { NextRequest } from "next/server";

export const DEBUG_RUNNER_SECRET_HEADER = "x-debug-runner-secret";

function configuredDebugRunnerSecret(): string {
  return String(process.env.DEBUG_RUNNER_INTERNAL_SECRET || "").trim();
}

export function hasInternalDebugAccess(request: NextRequest | Request): boolean {
  const expected = configuredDebugRunnerSecret();
  if (!expected) return false;
  const actual = request.headers.get(DEBUG_RUNNER_SECRET_HEADER)?.trim() || "";
  return actual.length > 0 && actual === expected;
}

export function internalDebugAuthHeaders(): HeadersInit {
  const secret = configuredDebugRunnerSecret();
  if (!secret) return {};
  return {
    [DEBUG_RUNNER_SECRET_HEADER]: secret,
  };
}
