'use client';

import dynamic from 'next/dynamic';
import { AdminRoute } from '@/components/AdminRoute';

/*
 * Unified admin console — section via ?section= (overview by default).
 * Client-only: AdminConsole initializes its active section from ?section= in a
 * useState initializer. ssr:false makes that run once on the client so a direct
 * ?section=email-logs load is honored without an SSR default-then-correct flash.
 */
const AdminConsole = dynamic(() => import('@/components/admin/AdminConsole'), { ssr: false });

export default function AdminPage() {
  return (
    <AdminRoute>
      <AdminConsole />
    </AdminRoute>
  );
}
