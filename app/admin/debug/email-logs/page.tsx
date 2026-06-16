'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminRoute } from '@/components/AdminRoute';

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
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-800',
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
    <div className="min-h-screen bg-page">
      <div className="bg-white border-b border-black/[0.07]">
        <div className="max-w-6xl mx-auto px-5 pt-6 pb-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="text-[11px] font-extrabold tracking-[0.12em] text-bk-amber-dark bg-bk-amber/15 px-2 py-1 rounded-md">ADMIN</span>
              <h1 className="text-[22px] font-black tracking-tight text-navy">Email Logs</h1>
            </div>
            <p className="text-[13px] font-semibold text-black/45">Most recent 200 email send attempts.</p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="h-9 px-4 rounded-lg bg-bk-blue hover:bg-bk-blue-dark text-white text-[13px] font-bold transition disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-5 py-6">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-[13px] font-semibold text-red-700">
            {error}
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-black/[0.08] bg-white">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="border-b border-black/[0.07] text-left text-[11px] font-bold uppercase tracking-wider text-black/40">
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
                <tr><td colSpan={6} className="px-3 py-8 text-center text-black/35 font-semibold">No email logs yet.</td></tr>
              )}
              {logs.map(log => (
                <tr key={log.id} className="border-b border-black/[0.04] last:border-none align-top">
                  <td className="px-3 py-2.5 whitespace-nowrap text-black/55 font-medium">
                    {new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-bold text-navy">{log.email_type}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-black/65">{log.recipient_email}</td>
                  <td className="px-3 py-2.5 text-black/65 max-w-[280px] truncate">{log.subject}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold tracking-wide ${STATUS_STYLES[log.status] ?? 'bg-black/5 text-black/50'}`}>
                      {log.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-red-600 font-medium max-w-[240px] truncate">{log.error_message ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
