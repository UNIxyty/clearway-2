export type SourceRef = {
  n: number;
  tier: "company" | "internal" | "web";
  tierLabel?: string;
  label: string;
  tool: string;
  fg?: string;
  bg?: string;
  icon?: string;
};

export type VerbatimRecord = {
  id: string;
  heading: string;
  text: string;
  source: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  approvedBy: string | null;
  updatedAt: string | null;
  tool: string;
};

export type ToolActivity = { name: string; ok: boolean; error: string | null };

export type FlightCardData = {
  flightId: string;
  callsign: string | null;
  registration: string | null;
  operatorId: string | null;
  departureIcao: string | null;
  arrivalIcao: string | null;
  scheduledDeparture: string | null;
  scheduledArrival: string | null;
  status: string | null;
  limitationCount?: number;
  importantCount?: number;
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: { verbatim?: VerbatimRecord[]; flights?: FlightCardData[] } | null;
  sources?: SourceRef[];
  toolActivity?: ToolActivity[];
  error?: string | null;
  createdAt?: string;
  /** Client-only: this turn is still streaming. */
  streaming?: boolean;
};

export type ConversationSummary = {
  id: string;
  title: string;
  lastMessageAt: string;
  context?: AgentContext | null;
};

/** What the user is looking at, named by the chip. */
export type AgentContext = {
  kind: "flight" | "airport" | "page" | "record";
  label: string;
  icao?: string | null;
  flightId?: string | null;
  icon?: string;
};
