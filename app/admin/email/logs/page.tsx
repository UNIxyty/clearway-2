'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminRoute } from '@/components/AdminRoute';
import PortalShell from '@/components/portal/Shell';

interface EmailLog {
  id: string;
  user_id: string | null;
  email_type: string;
  recipient_email: string;
  subject: string;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  sent: 'bg-cw-success-tint text-cw-success-text',
  failed: 'bg-cw-danger-tint text-cw-danger-text',
  pending: 'bg-cw-warning-tint text-cw-warning-text',
};

export default function EmailLogsPage() {
  return (
    <AdminRoute>
      <EmailLogsContent />
    </AdminRoute>
  );
}

function EmailLogsContent() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/email-logs', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? 'Failed to load email logs');
        return;
      }
      setLogs((json as { logs: EmailLog[] }).logs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load email logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <PortalShell
      title="Email Logs"
      crumb="/admin/email/logs"
      subtitle="Most recent 200 email send attempts."
      headerRight={
        <button
          onClick={() => void load()}
          disabled={loading}
          className="h-9 px-4 rounded-lg bg-cw-primary hover:bg-cw-primary-hover text-cw-text-on-primary text-[13px] font-bold transition disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      }
    >
      <main className="max-w-6xl mx-auto px-5 py-6">
        {error && (
          <div className="mb-4 rounded-lg bg-cw-danger-tint border border-cw-danger-border px-4 py-3 text-[13px] font-semibold text-cw-danger-text">
            {error}
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-cw-border bg-cw-bg-surface">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="border-b border-cw-text/[0.07] text-left text-[11px] font-bold uppercase tracking-wider text-cw-text-muted">
                <th className="px-3 py-2.5">When</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Recipient</th>
                <th className="px-3 py-2.5">Subject</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Error</th>
              </tr>
            </thead>
            <tbody>
              {!loading && logs.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-cw-text-muted font-semibold">No email logs yet.</td></tr>
              )}
              {logs.map(log => (
                <tr key={log.id} className="border-b border-cw-text/[0.04] last:border-none align-top">
                  <td className="px-3 py-2.5 whitespace-nowrap text-cw-text/55 font-medium">
                    {new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-bold text-cw-text">{log.email_type}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-cw-text/65">{log.recipient_email}</td>
                  <td className="px-3 py-2.5 text-cw-text/65 max-w-[280px] truncate">{log.subject}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold tracking-wide ${STATUS_STYLES[log.status] ?? 'bg-cw-ink/5 text-cw-text/50'}`}>
                      {log.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-cw-danger-text font-medium max-w-[240px] truncate">{log.error_message ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </PortalShell>
  );
}
