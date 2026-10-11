'use client';

/* =============================================================================
 * EmailLogs — section 5. Searchable / filterable table of email_logs rows.
 * Read-only debug view. Failed rows expand to reveal the error_message.
 * ===========================================================================*/
import { useMemo, useState } from 'react';

import type { EmailLog, EmailStatus, EmailType } from '@/types/admin';

const EMAIL_TYPE_LABEL: Record<EmailType, string> = {
  bracket_confirmation: 'Bracket Confirmation',
  prediction_update: 'Prediction Update',
  group_stage_complete: 'Group Stage Complete',
  final_standings: 'Final Standings',
  playoffs_opened: 'Playoffs Opened',
  broadcast: 'Custom Broadcast',
};

const STATUS_STYLE: Record<EmailStatus, string> = {
  sent: 'bg-cw-success/12 text-cw-success-text',
  failed: 'bg-cw-danger-solid/12 text-cw-danger-text',
  pending: 'bg-cw-ink/[0.06] text-cw-text-muted',
};

const STATUS_FILTERS: ReadonlyArray<'all' | EmailStatus> = ['all', 'sent', 'failed', 'pending'];

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type EmailLogsProps = { logs: EmailLog[] };

export function EmailLogs({ logs }: EmailLogsProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | EmailStatus>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (status !== 'all' && log.status !== status) return false;
      if (!q) return true;
      return (
        log.recipient.toLowerCase().includes(q) ||
        EMAIL_TYPE_LABEL[log.emailType].toLowerCase().includes(q) ||
        (log.errorMessage?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [logs, query, status]);

  return (
    <div className="flex flex-col gap-4">
      {/* controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipient, type, or error…"
          className="h-10 flex-1 rounded-lg border border-cw-text/12 bg-cw-bg-surface px-3.5 text-[13px] font-semibold text-cw-text outline-none transition focus:border-cw-primary focus:ring-4 focus:ring-cw-primary/15"
        />
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`h-8 rounded-full px-3.5 text-[12.5px] font-bold capitalize transition ${
                status === s ? 'bg-cw-ink text-cw-on-ink shadow-sm' : 'bg-cw-ink/[0.05] text-cw-text-body hover:bg-cw-ink/[0.09]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-xl border border-cw-text/[0.08] bg-cw-bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-cw-text/[0.08] text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-cw-text-muted">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Test</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[13px] font-semibold text-cw-text-muted">
                    No log rows match this view.
                  </td>
                </tr>
              ) : (
                filtered.map((log, i) => {
                  const isOpen = expanded === log.id;
                  const canExpand = log.status === 'failed' && log.errorMessage;
                  return (
                    <tr
                      key={log.id}
                      onClick={() => canExpand && setExpanded(isOpen ? null : log.id)}
                      className={`border-b border-cw-text/[0.05] text-[13px] ${i % 2 === 1 ? 'bg-cw-ink/[0.015]' : ''} ${
                        canExpand ? 'cursor-pointer hover:bg-cw-primary/[0.04]' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold tabular-nums text-cw-text-muted whitespace-nowrap">
                        {fmt(log.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-cw-text">{EMAIL_TYPE_LABEL[log.emailType]}</td>
                      <td className="px-4 py-3 font-medium text-cw-text-body">{log.recipient}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] ${STATUS_STYLE[log.status]}`}
                        >
                          {log.status}
                        </span>
                        {canExpand && isOpen && (
                          <div className="mt-2 max-w-md rounded-md bg-cw-danger-solid/[0.06] px-3 py-2 text-[12px] font-semibold leading-relaxed text-cw-danger-text">
                            {log.errorMessage}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {log.isTest && (
                          <span className="inline-flex items-center rounded-md bg-cw-warning/15 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-cw-warning-text">
                            Test
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[12px] font-medium text-cw-text-muted">
        {filtered.length.toLocaleString()} of {logs.length.toLocaleString()} rows · click a failed row to read its
        error.
      </p>
    </div>
  );
}
