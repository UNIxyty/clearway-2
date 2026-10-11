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
  sent: { label: "Sent", dotClass: "bg-cw-warning" },
  read: { label: "Read", dotClass: "bg-cw-primary" },
  in_work: { label: "In work", dotClass: "bg-cw-orange" },
  fixed: { label: "Fixed", dotClass: "bg-cw-success" },
  impossible_to_fix: { label: "Impossible to fix", dotClass: "bg-cw-danger-solid" },
};
