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
  sent: { label: "Sent", dotClass: "bg-sky-500 border border-sky-300 shadow-sm" },
  read: { label: "Read", dotClass: "bg-indigo-500 border border-indigo-300 shadow-sm" },
  in_work: { label: "In work", dotClass: "bg-amber-500 border border-amber-300 shadow-sm" },
  fixed: { label: "Fixed", dotClass: "bg-green-500 border border-green-300 shadow-sm" },
  impossible_to_fix: { label: "Impossible to fix", dotClass: "bg-red-500 border border-red-300 shadow-sm" },
};
