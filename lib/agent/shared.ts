// Types shared by the agent's portal-side API, UI and audit feed.

export type AgentAccessRow = {
  id: number;
  userId: string;
  userEmail: string | null;
  grantedBy: string | null;
  grantedByEmail: string | null;
  grantedAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedByEmail: string | null;
  note: string | null;
};

export type AgentKillSwitch = {
  enabled: boolean;
  reason: string | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
};

export type AgentAvailability = {
  available: boolean;
  /** Why not — never shown to a non-developer; the UI renders nothing at all. */
  reason: "not_signed_in" | "not_on_allowlist" | "disabled_globally" | null;
};

export const AGENT_AUDIT_KINDS = [
  "chat.request",
  "chat.response",
  "chat.error",
  "chat.denied",
  "access.granted",
  "access.revoked",
  "killswitch.changed",
] as const;
export type AgentAuditKind = (typeof AGENT_AUDIT_KINDS)[number];
