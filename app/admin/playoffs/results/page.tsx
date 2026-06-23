'use client';

import { AdminRoute } from '@/components/AdminRoute';
import { AdminSubNav } from '@/components/AdminSubNav';
import { ResultsView } from '@/components/admin/ResultsView';

/*
 * Standalone Enter Results route — thin wrapper around the extracted ResultsView.
 * The unified console at /admin?section=results mounts the same view embedded.
 * (Replaced by a redirect in the final wiring step.)
 */
export default function PlayoffResultsPage() {
  return (
    <AdminRoute>
      <AdminSubNav />
      <ResultsView />
    </AdminRoute>
  );
}
