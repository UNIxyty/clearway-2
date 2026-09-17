// Help Centre — the one vocabulary shared by the console, the developer inbox
// and the Telegram mini app. Three things travel unchanged across surfaces and
// make a message recognisable on either side: the reference (RPT-2188 / CHT-0412),
// the type chip with its exact colours, and the status word from the same
// four-value set the wall Reports page uses. Everything else is layout.

export const HELP_THREAD_TYPES = ["bug", "request", "question", "urgent", "chat"] as const;
export type HelpThreadType = (typeof HELP_THREAD_TYPES)[number];

// Exactly the Reports page statuses (digital-wall/lib/reports-store.mjs).
export const HELP_STATUSES = ["untouched", "under_process", "done", "impossible"] as const;
export type HelpStatus = (typeof HELP_STATUSES)[number];

export const HELP_PRESENCE = ["none", "not_notified", "notified", "joining", "present", "no_answer"] as const;
export type HelpPresence = (typeof HELP_PRESENCE)[number];

// Type chips — fixed hues on every surface, including inside Telegram themes.
export const HELP_TYPE_META: Record<
  HelpThreadType,
  { chip: string; bg: string; color: string; border: string; label: string }
> = {
  urgent: { chip: "URGENT", bg: "#fdf2f2", color: "#b42318", border: "#f0c9ca", label: "Urgent" },
  bug: { chip: "BUG", bg: "#fdf6ec", color: "#b45309", border: "#f3e0c4", label: "Bug" },
  request: { chip: "IDEA", bg: "#f2f7ff", color: "#1d4ed8", border: "#dbe6ff", label: "Suggestion" },
  question: { chip: "ASK", bg: "#f5f6f7", color: "#3a3d44", border: "#e6e7ea", label: "Question" },
  chat: { chip: "CHAT", bg: "#e7f6ec", color: "#15803d", border: "#c7ead2", label: "Chat" },
};

// Status chips — same words and colours as the Reports page.
export const HELP_STATUS_META: Record<
  HelpStatus,
  { chip: string; label: string; bg: string; color: string; border: string; dot: string }
> = {
  untouched: { chip: "UNTOUCHED", label: "Untouched", bg: "#f5f6f7", color: "#6c7079", border: "#e6e7ea", dot: "#9aa0a8" },
  under_process: { chip: "UNDER PROCESS", label: "Under process", bg: "#f2f7ff", color: "#1d4ed8", border: "#dbe6ff", dot: "#2563eb" },
  done: { chip: "DONE", label: "Done", bg: "#e7f6ec", color: "#15803d", border: "#c7ead2", dot: "#16a34a" },
  impossible: { chip: "IMPOSSIBLE", label: "Impossible", bg: "#fdf2f2", color: "#b42318", border: "#f0c9ca", dot: "#e5484d" },
};

// Message content: structured blocks, stored as data, rendered natively on both
// sides. Inline code travels as `backtick` spans inside text.
export type HelpBlock =
  | { type: "heading" | "subheading" | "paragraph" | "quote"; text: string }
  | { type: "bullet" | "numbered"; items: string[] }
  | { type: "checklist"; items: Array<{ text: string; checked: boolean }> }
  | { type: "code"; text: string }
  | { type: "divider" }
  | { type: "attachment"; id: string };

export const HELP_BLOCK_TYPES = [
  "heading", "subheading", "paragraph", "quote", "bullet", "numbered",
  "checklist", "code", "divider", "attachment",
] as const;

// Auto-collected context: six read-only fields, fixed order. `services` and
// `lastRequest` are the two that render red when they carry a problem.
export type HelpContext = {
  page?: string;
  role?: string;
  browser?: string;
  viewport?: string;
  services?: string;
  lastRequest?: string;
};
export const HELP_CONTEXT_ORDER: Array<{ key: keyof HelpContext; label: string; redWhenSet?: boolean }> = [
  { key: "page", label: "PAGE" },
  { key: "role", label: "ROLE" },
  { key: "browser", label: "BROWSER" },
  { key: "viewport", label: "VIEWPORT" },
  { key: "services", label: "SERVICES" },
  { key: "lastRequest", label: "LAST REQUEST" },
];
export function helpContextFieldIsRed(key: keyof HelpContext, value: string): boolean {
  if (key === "services") return value !== "" && value !== "all healthy";
  if (key === "lastRequest") return value !== "" && value !== "none";
  return false;
}

export type HelpThread = {
  id: string;
  reference: string;
  type: HelpThreadType;
  title: string;
  status: HelpStatus;
  statusReason: string | null;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  context: HelpContext;
  presence: HelpPresence;
  presenceAt: string | null;
  linkedFrom: string | null;
  opsLastReadAt: string | null;
  devLastReadAt: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  statusUpdatedAt: string;
  statusUpdatedBy: string | null;
};

export type HelpMessage = {
  id: string;
  threadId: string;
  author: "ops" | "developer";
  authorId: string | null;
  authorName: string | null;
  blocks: HelpBlock[];
  clientKey: string | null;
  createdAt: string;
};

export type HelpEventKind =
  | "opened" | "status_changed" | "joined" | "chat_closed" | "nudged" | "linked_report" | "presence_changed";

export type HelpEvent = {
  id: string;
  threadId: string;
  kind: HelpEventKind;
  payload: Record<string, unknown>;
  actor: string | null;
  createdAt: string;
};

export type HelpAttachment = {
  id: string;
  threadId: string | null;
  messageId: string | null;
  ownerId: string;
  name: string;
  size: number;
  mime: string;
  isImage: boolean;
  createdAt: string;
};

// Attachment guards (the too-large copy in the UI names this limit).
export const HELP_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const HELP_ATTACHMENT_MIMES = [
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "text/plain", "text/csv", "application/json", "application/pdf",
  "video/mp4", "application/zip",
] as const;

// Status rules the backend enforces (never only the UI):
// Done closes the thread to new replies after 48 hours; reopening files a linked report.
export const HELP_DONE_CLOSES_AFTER_MS = 48 * 60 * 60 * 1000;
export function helpThreadIsClosed(thread: Pick<HelpThread, "status" | "statusUpdatedAt">, now = Date.now()): boolean {
  if (thread.status !== "done") return false;
  const since = Date.parse(thread.statusUpdatedAt || "");
  if (!Number.isFinite(since)) return false;
  return now - since > HELP_DONE_CLOSES_AFTER_MS;
}

// Presence: at five minutes with no join, the strip offers filing as a report.
export const HELP_NO_ANSWER_AFTER_MS = 5 * 60 * 1000;
export function helpEffectivePresence(
  thread: Pick<HelpThread, "presence" | "presenceAt">,
  now = Date.now(),
): HelpPresence {
  if (thread.presence !== "notified") return thread.presence;
  const since = Date.parse(thread.presenceAt || "");
  if (Number.isFinite(since) && now - since > HELP_NO_ANSWER_AFTER_MS) return "no_answer";
  return thread.presence;
}

// A chat (or urgent-in-live-mode) carries presence; a report never does.
export function helpThreadHasPresence(type: HelpThreadType): boolean {
  return type === "chat" || type === "urgent";
}

// Events an SSE client can receive. ownerUserId lets the hub route events to
// the thread's owner and to developers, never to anyone else.
export type HelpStreamEvent = {
  type: "thread.created" | "thread.updated" | "message.created" | "event.created";
  threadId: string;
  ownerUserId: string;
  reference: string;
  // Optional denormalised payloads so clients can update without a refetch.
  thread?: HelpThread;
  message?: HelpMessage;
  event?: HelpEvent;
};

export function summarizeBlocks(blocks: HelpBlock[], max = 90): string {
  for (const b of blocks) {
    if ("text" in b && b.text && (b.type === "paragraph" || b.type === "heading" || b.type === "subheading" || b.type === "quote")) {
      const t = b.text.replace(/\s+/g, " ").trim();
      if (t) return t.length > max ? `${t.slice(0, max - 1)}…` : t;
    }
    if (b.type === "bullet" || b.type === "numbered") {
      const t = b.items.join(" · ").trim();
      if (t) return t.length > max ? `${t.slice(0, max - 1)}…` : t;
    }
    if (b.type === "code" && b.text.trim()) return "Code block";
  }
  return "Attachment";
}
