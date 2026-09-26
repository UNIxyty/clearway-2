// Per-request context for the agent service, carried on an AsyncLocalStorage
// so deep code (the audit writer above all) can tell WHICH FRONT END a request
// came from without threading a parameter through every call.
//
// Store shape: { client: { kind: "console" | "extension", host: string | null } }.
// Read by lib/store.mjs audit(); set once per request in server.mjs. Kept in
// its own tiny module so store.mjs and server.mjs share it without a cycle.

import { AsyncLocalStorage } from "node:async_hooks";

export const requestContext = new AsyncLocalStorage();

/** The client descriptor for an incoming request, from the extension's headers. */
export function clientOf(req) {
  const kind = String(req?.headers?.["x-clearway-client"] ?? "").toLowerCase() === "extension" ? "extension" : "console";
  const rawHost = req?.headers?.["x-clearway-page-host"];
  const host = kind === "extension" && rawHost ? String(rawHost).trim().toLowerCase().slice(0, 253) || null : null;
  return { client: { kind, host } };
}

/** The current request's client, or null outside a request. */
export function currentClient() {
  return requestContext.getStore()?.client ?? null;
}
