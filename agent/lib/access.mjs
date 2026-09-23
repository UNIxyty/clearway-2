// The gate. Two independent conditions, both of which must hold before any
// agent request proceeds:
//
//   1. The GLOBAL KILL SWITCH is on. One switch beats twelve revocations when
//      something goes wrong in an ops context.
//   2. The caller holds a live grant on the ALLOWLIST.
//
// Both fail CLOSED, and both are re-checked on EVERY request — including every
// turn of an already-open stream. That is what makes a revocation take effect
// immediately rather than at next sign-in.

import { agentEnabled, hasAgentAccess } from "./store.mjs";
import { AgentDisabled, Forbidden, Unauthorized } from "./errors.mjs";

/**
 * Resolve agent availability for a user without throwing — this is what the
 * portal asks so it knows whether to render an entry point at all.
 */
export async function availabilityFor(user) {
  if (!user?.userId) return { available: false, reason: "not_signed_in" };
  const [switchState, allowed] = await Promise.all([agentEnabled(), hasAgentAccess(user.userId)]);
  if (!switchState.enabled) return { available: false, reason: "disabled_globally" };
  if (!allowed) return { available: false, reason: "not_on_allowlist" };
  return { available: true, reason: null };
}

/**
 * Enforce the gate, throwing the right AgentError. Note the deliberate
 * asymmetry with availabilityFor(): a user who is not on the allowlist is told
 * "forbidden" here, but the portal never renders an entry point for them in the
 * first place, so in practice they never reach this.
 */
export async function assertMayUseAgent(user) {
  if (!user?.userId) throw Unauthorized();
  const switchState = await agentEnabled();
  if (!switchState.enabled) {
    throw AgentDisabled(switchState.reason ? `The agent is currently disabled: ${switchState.reason}` : "The agent is currently disabled.");
  }
  if (!(await hasAgentAccess(user.userId))) {
    throw Forbidden("You do not have access to the agent.");
  }
  return true;
}
