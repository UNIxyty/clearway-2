'use client';
// Adapter: wraps the existing /api/admin/email-logs, camelCasing rows to EmailLog.
import { useEffect, useState } from 'react';
import type { EmailLog, EmailType, EmailStatus } from '@/types/admin';

interface RawLog {
  id: string; created_at: string; email_type: string; recipient_email: string;
  status: string; is_test?: boolean; error_message: string | null;
}

export function useEmailLogs(): { logs: EmailLog[] } {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  useEffect(() => {
    let mounted = true;
    fetch('/api/admin/email-logs', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { logs: [] }))
      .then((d: { logs?: RawLog[] }) => {
        if (!mounted) return;
        setLogs((d.logs ?? []).map((r): EmailLog => ({
          id: r.id,
          createdAt: r.created_at,
          emailType: r.email_type as EmailType,
          recipient: r.recipient_email,
          status: r.status as EmailStatus,
          isTest: !!r.is_test,
          errorMessage: r.error_message,
        })));
      })
      .catch(() => { if (mounted) setLogs([]); });
    return () => { mounted = false; };
  }, []);
  return { logs };
}
