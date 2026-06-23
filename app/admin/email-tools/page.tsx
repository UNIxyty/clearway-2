'use client';

import { AdminRoute } from '@/components/AdminRoute';
import { AdminSubNav } from '@/components/AdminSubNav';
import { EmailToolsView } from '@/components/admin/EmailToolsView';

/*
 * Standalone Email Tools route — thin wrapper around the extracted EmailToolsView.
 * The unified console at /admin?section=email-tools mounts the same view embedded.
 * (Replaced by a redirect in the final wiring step.)
 */
export default function EmailToolsPage() {
  return (
    <AdminRoute>
      <AdminSubNav />
      <EmailToolsView />
    </AdminRoute>
  );
}
