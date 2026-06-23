'use client';

import { AdminRoute } from '@/components/AdminRoute';
import { AdminSubNav } from '@/components/AdminSubNav';
import { BracketSetupView } from '@/components/admin/BracketSetupView';

/*
 * Standalone Bracket Setup route — thin wrapper around the extracted
 * BracketSetupView (mounted non-embedded so it keeps its own header). The
 * unified console at /admin?section=bracket-setup mounts the same view embedded.
 * (This route is replaced by a redirect in the final wiring step.)
 */
export default function BracketSetupPage() {
  return (
    <AdminRoute>
      <AdminSubNav />
      <BracketSetupView />
    </AdminRoute>
  );
}
