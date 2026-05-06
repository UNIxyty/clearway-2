"use client";

import {
  BUG_REPORT_STATUS_META,
  type BugReportRow,
} from "@/lib/bug-reports-shared";

type Props = {
  reports: BugReportRow[];
};

export default function BugReportBanner({ reports }: Props) {
  if (!reports.length) return null;

  return (
    <div className="rounded-md border px-3 py-2 bg-background/95 text-[11px]">
      <div className="font-medium text-foreground">Your bug reports</div>
      <div className="mt-1 space-y-1.5">
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
