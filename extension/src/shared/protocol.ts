// Types shared by every context. See PROTOCOL.md for the words behind them.
export type PageContextKind = "selection" | "capture" | "page";
export type PageContext = {
  kind: PageContextKind; title: string; url: string; host: string; sentAt: string;
  text?: string; attachmentId?: string; chars?: number; words?: number; headings?: number; tables?: number; trimmed?: boolean;
  bytes?: number; width?: number; height?: number; dataUrl?: string;
};
export type SiteEntry = { host: string; includeSubdomains: boolean; approvedBy?: string | null; approvedAt?: string | null };
export type SiteRequest = { id: string; host: string; includeSubdomains: boolean; reason: string; status: "pending" | "approved" | "declined"; requestedAt: string; requestedBy?: string | null; decidedBy?: string | null; decidedAt?: string | null; note?: string | null };
export type QuickActionRule = { id: string; pattern: string; flags?: string; entity: { kind: "leon-flight" | "icao"; id: string }; actions: QuickAction[] };
export type QuickAction = { id: string; label: string; icon: string; kind: "read" | "write"; requires: string[]; message?: string; compose?: string };
export type SessionUser = { userId: string; name: string; email: string | null; initials: string; role: string };
export type SessionState = {
  status: "unknown" | "signed-in" | "signed-out" | "disconnected" | "unreachable";
  user?: SessionUser | null; tools?: string[]; admins?: { name: string; email: string }[];
  sites?: { approved: SiteEntry[]; requests: SiteRequest[] }; quickActions?: { rules: QuickActionRule[] } | null;
  replyMode?: string | null; checkedAt: number; error?: string | null;
};
export type SiteStatus = "approved" | "approved-pending-enable" | "requested" | "not-on-list" | "chrome" | "unknown";
export type TabInfo = { id: number | null; url: string; host: string; path: string; title: string; favIconUrl: string | null; status: SiteStatus; scriptable: boolean; captureWorks?: boolean };
export type PendingConfirmation = { token: string; what: string | null; expiresAt: string | null; conversationId: string | null; toolName: string; fromThisBrowser: boolean };
export type PendingState = { confirmations: PendingConfirmation[]; jobs: { id: string; filename: string; at: string; conversationId: string | null }[]; approvedSites: string[]; notamReview: number };
export type Settings = { pill: boolean; notifications: boolean; firstRunDone: boolean; mic: "pending" | "allowed" | "skipped" };
export const DEFAULT_SETTINGS: Settings = { pill: true, notifications: true, firstRunDone: false, mic: "pending" };
export type Draft = { text?: string; pageContext?: PageContext; at: number; send?: boolean };
export type InsertStatus = "review" | "picking" | "inserted" | "undone" | "cancelled";
export type InsertState = {
  id: string; tabId: number; host: string; text: string; verbatim?: string | null; conversationId?: string | null;
  status: InsertStatus; field?: { label: string; kind: "input" | "textarea" | "contenteditable" } | null; after?: string | null;
  characters?: number; insertedAt?: string; undoUntil?: string; cancelReason?: string | null;
};
export type VoiceBarState = {
  state: "invoked" | "listening" | "processing" | "answer" | "error" | "hidden";
  text?: string; tail?: string; bands?: number[]; seconds?: number; step?: string | null;
  error?: { title: string; detail: string } | null;
  answer?: { text: string; spokenChars: number; speaking: boolean; time: number; duration: number; sources: { name: string; icon: string }[]; needsPanel: boolean } | null;
};
