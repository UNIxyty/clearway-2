"use client";

import {
  BUG_REPORT_STATUS_META,
  type BugReportRow,
} from "@/lib/bug-reports-shared";

type Props = {
  reports: BugReportRow[];
  onDeleteFixed?: (reportId: string) => void;
  deletingReportId?: string | null;
};

export default function BugReportBanner({ reports, onDeleteFixed, deletingReportId = null }: Props) {
  if (!reports.length) return null;

  return (
    <div className="text-[11px]">
      <div className="space-y-1.5">
        {reports.slice(0, 8).map((report) => {
          const meta = BUG_REPORT_STATUS_META[report.status];
          return (
            <div key={report.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-foreground">
                  {report.airportIcao} - {report.description}
                </div>
                <div className="text-muted-foreground">
                  {new Date(report.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1 text-muted-foreground">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dotClass}`} />
                <span>{meta.label}</span>
                {report.status === "fixed" && onDeleteFixed && (
                  <button
                    type="button"
                    onClick={() => onDeleteFixed(report.id)}
                    disabled={deletingReportId === report.id}
                    className="ml-2 rounded border px-1.5 py-0.5 text-[10px] text-foreground hover:bg-muted disabled:opacity-50"
                    aria-label="Delete fixed bug report"
                  >
                    {deletingReportId === report.id ? "Deleting..." : "Delete"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
