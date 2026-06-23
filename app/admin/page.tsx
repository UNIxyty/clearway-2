'use client';

import { AdminRoute } from '@/components/AdminRoute';
import AdminConsole from '@/components/admin/AdminConsole';

/* Unified admin console — section via ?section= (overview by default). */
export default function AdminPage() {
  return (
    <AdminRoute>
      <AdminConsole />
    </AdminRoute>
  );
}
