// Types shared by every agent surface. The shapes mirror what the agent
// service streams and persists (agent/server.mjs `done` payload and
// agent_messages.blocks), so a stored thread renders exactly like a live one.

export type Tier = "internal" | "company" | "web" | "memory";

export type SourceRef = {
  n: number;
  tier: Tier;
  tierLabel?: string;
  label: string;
  tool: string;
  href?: string | null;
  meta?: string | null;
};

/** A claim in the prose that a source supports (§4.7 A). Only present when the model returned claim boundaries. */
export type ClaimSpan = { start: number; end: number; n: number };

export type VerbatimRecord = {
  id: string;
  kind?: "limitation" | "important" | "caa" | "tier1";
  heading: string;
  text: string;
  source: string;
  reference?: string | null;
  version?: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  approvedBy: string | null;
  approvedAt?: string | null;
  updatedAt: string | null;
  page?: number | null;
  sha256?: string | null;
  tool: string;
};

export type ToolActivity = {
  name: string;
  ok: boolean;
  error: string | null;
  startedAt?: string | null;
  durationMs?: number | null;
  args?: Record<string, unknown> | null;
  summary?: string | null;
  write?: boolean;
  /** Live-only: the step is still running / has not started / was cancelled by Stop. */
  state?: "running" | "queued" | "done" | "cancelled";
};

export type FlightCardData = {
  flightId: string;
  callsign: string | null;
  registration: string | null;
  operatorId: string | null;
  aircraftType?: string | null;
  departureIcao: string | null;
  arrivalIcao: string | null;
  departureCity?: string | null;
  arrivalCity?: string | null;
  scheduledDeparture: string | null;
  estimatedDeparture?: string | null;
  scheduledArrival: string | null;
  estimatedArrival?: string | null;
  status: string | null;
  ctot?: string | null;
  onWall?: boolean;
  limitationCount?: number;
  importantCount?: number;
  notamUnreviewed?: string[] | null;
};

export type PerformedAction = { actionId: string; what: string; targetKind: string; target: string | null; ref?: string | null; detail?: string | null };

export type MonoData = { id: string; title: string; text: string; tool: string; meta?: string | null; icao?: string | null };
export type DocumentData = { kind: "aip" | "gen" | "knowledge"; title: string; subtitle: string | null; href: string | null; cached: boolean; note: string | null; documentId: string | null; tool: string; stale?: string | null };
export type FileData = { id: string; filename: string; mime: string | null; bytes: number | null; downloadPath: string; tool: string; pages?: number | null; summary?: string | null; generatedAt?: string | null };
export type AirportData = { icao: string; name?: string | null; country: string | null; aipUrl: string | null; aipCached: boolean | null; metar: string | null; metarAt?: string | null; category?: string | null; decoded?: string | null; notamCount: number | null; notamNew?: number | null; limitationCount: number | null; caa?: { name: string; phone?: string | null; email?: string | null } | null };
export type TableData = { id: string; title?: string | null; columns: string[]; rows: string[][]; monoColumns?: number[]; footer?: { openHref?: string | null; openLabel?: string | null; filterHint?: string | null } | null };

export type ConfirmationLevel = "low" | "standard" | "destructive";
export type ConfirmationStatus = "pending" | "applied" | "cancelled" | "expired" | "partial";
export type PendingConfirmation = {
  token: string;
  level: ConfirmationLevel;
  toolName: string;
  input: Record<string, unknown>;
  what: string | null;
  target: string | null;
  expiresAt: string | null;
  /** Client/stored state after the prompt was answered. */
  status?: ConfirmationStatus;
  appliedAt?: string | null;
  cancelledAt?: string | null;
  result?: Record<string, unknown> | null;
};

export type Attachment = { name: string; text: string; chars: number; id?: string };

export type MessageBlocks = {
  verbatim?: VerbatimRecord[];
  flights?: FlightCardData[];
  actions?: PerformedAction[];
  mono?: MonoData[];
  documents?: DocumentData[];
  files?: FileData[];
  airports?: AirportData[];
  tables?: TableData[];
  confirmations?: PendingConfirmation[];
  claims?: ClaimSpan[];
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: MessageBlocks | null;
  sources?: SourceRef[];
  toolActivity?: ToolActivity[];
  error?: string | null;
  createdAt?: string;
  /** Client-only */
  streaming?: boolean;
  stopped?: { at: string; finished: number; cancelled: number } | null;
  sending?: boolean;
  failed?: string | null;
  voice?: boolean;
  initials?: string | null;
  latencyMs?: number | null;
};

export type ConversationSummary = { id: string; title: string; lastMessageAt: string; context?: AgentContext | null; snippet?: string; changes?: number; files?: number; sent?: number; voice?: boolean; messageCount?: number; entities?: string[] };

export type AgentContext = {
  kind: "flight" | "airport" | "page" | "record" | "wall" | "notam-check" | "limitations";
  label: string;
  icao?: string | null;
  flightId?: string | null;
  icon?: string;
  tab?: string | null;
  selected?: { id: string; label: string; kind: "flight" | "airport" | "aircraft" | "limitation" | "document" }[] | null;
  visible?: { id: string; label: string; kind: "flight" | "airport" | "aircraft" | "limitation" | "document"; sub?: string | null }[] | null;
};

export const AGENT_BASE = process.env.NEXT_PUBLIC_AGENT_BASE_URL || "/agent";
