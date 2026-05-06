"use client";

import { useMemo, useState } from "react";
import BugReportBanner from "@/components/bug-report-banner";
import {
  BUG_REPORT_STATUSES,
  BUG_REPORT_STATUS_META,
  type BugReportRow,
} from "@/lib/bug-reports-shared";

type Props = {
  reports: BugReportRow[];
  onDeleteFixed?: (reportId: string) => void;
  deletingReportId?: string | null;
};

export default function BugReportsHoverBanner({ reports, onDeleteFixed, deletingReportId = null }: Props) {
  const [open, setOpen] = useState(false);

  const statusCounts = useMemo(() => {
    const counts: Record<(typeof BUG_REPORT_STATUSES)[number], number> = {
      sent: 0,
      read: 0,
      in_work: 0,
      fixed: 0,
      impossible_to_fix: 0,
    };
    for (const report of reports) counts[report.status] += 1;
    return counts;
  }, [reports]);

  if (!reports.length) return null;

  return (
    <div
      className="fixed top-[98px] left-3 z-[69]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="w-[300px] rounded-md border bg-background/95 text-muted-foreground px-2.5 py-1.5 shadow-md backdrop-blur text-[10px]">
        <div className="font-medium text-foreground text-[11px]">User Bug Reports</div>
        <div className="flex items-center gap-1 my-0.5">
          {BUG_REPORT_STATUSES.map((status) => (
            <span
              key={status}
              className={`inline-block h-2 w-2 rounded-full ${BUG_REPORT_STATUS_META[status].dotClass}`}
            />
          ))}
        </div>
        <div>{reports.length} report(s) total. Hover for details.</div>
      </div>

      <div
        className={`absolute left-0 mt-1.5 w-[360px] max-h-[60vh] overflow-hidden rounded-md border bg-background shadow-xl transition-all duration-200 ease-out origin-top-left ${
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="border-b px-3 py-2 text-sm font-medium">Bug reports</div>
        <div className="border-b px-3 py-2 text-xs text-muted-foreground grid grid-cols-1 gap-1">
          {BUG_REPORT_STATUSES.map((state) => {
            const count = statusCounts[state];
            return (
              <div key={state} className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${BUG_REPORT_STATUS_META[state].dotClass}`} />
                <span>{BUG_REPORT_STATUS_META[state].label}: {count}</span>
              </div>
            );
          })}
        </div>
        <div className="max-h-[32vh] overflow-auto px-3 py-2">
          <BugReportBanner
            reports={reports}
            onDeleteFixed={onDeleteFixed}
            deletingReportId={deletingReportId}
          />
        </div>
      </div>
    </div>
  );
}
