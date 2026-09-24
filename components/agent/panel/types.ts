export type SourceRef = {
  n: number;
  tier: "company" | "internal" | "web" | "memory";
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

export type PerformedAction = {
  actionId: string;
  what: string;
  targetKind: string;
  target: string | null;
};

export type MonoData = { id: string; title: string; text: string; tool: string };

export type DocumentData = {
  kind: "aip" | "gen" | "knowledge";
  title: string;
  subtitle: string | null;
  href: string | null;
  cached: boolean;
  note: string | null;
  documentId: string | null;
  tool: string;
};

export type FileData = { id: string; filename: string; mime: string | null; bytes: number | null; downloadPath: string; tool: string };

export type AirportData = {
  icao: string;
  country: string | null;
  aipUrl: string | null;
  aipCached: boolean | null;
  metar: string | null;
  notamCount: number | null;
  limitationCount: number | null;
};

/** A text file the user attached to a question. Read client-side; never uploaded as a document. */
export type Attachment = { name: string; text: string; chars: number };

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: {
    verbatim?: VerbatimRecord[]; flights?: FlightCardData[]; actions?: PerformedAction[];
    mono?: MonoData[]; documents?: DocumentData[]; files?: FileData[]; airports?: AirportData[];
  } | null;
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
