export type BugReportStatus =
  | "sent"
  | "read"
  | "in_work"
  | "fixed"
  | "impossible_to_fix";

export type BugReportRow = {
  id: string;
  userId: string;
  userEmail: string | null;
  airportIcao: string;
  description: string;
  status: BugReportStatus;
  createdAt: string;
  updatedAt: string;
  statusUpdatedAt: string;
  statusUpdatedBy: string | null;
};

export const BUG_REPORT_STATUSES: BugReportStatus[] = [
  "sent",
  "read",
  "in_work",
  "fixed",
  "impossible_to_fix",
];

export const BUG_REPORT_STATUS_META: Record<
  BugReportStatus,
  { label: string; dotClass: string }
> = {
  sent: { label: "Sent", dotClass: "bg-green-500/40 border border-green-400/70" },
  read: { label: "Read", dotClass: "bg-blue-500 border border-blue-300" },
  in_work: { label: "In work", dotClass: "bg-orange-500 border border-orange-300" },
  fixed: { label: "Fixed", dotClass: "bg-green-500 border border-green-300 shadow-sm" },
  impossible_to_fix: { label: "Impossible to fix", dotClass: "bg-red-500 border border-red-300 shadow-sm" },
};
