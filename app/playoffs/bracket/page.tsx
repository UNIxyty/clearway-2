'use client';

import { AdminRoute } from '@/components/AdminRoute';
import { FullBracketView } from '@/components/playoffs/FullBracketView';

/*
 * ADMIN-ONLY standalone route. The user-facing entry is the Playoffs tab shell
 * (/playoffs), which mounts the same FullBracketView with embedded chrome.
 */
export default function FullBracketPage() {
  return (
    <AdminRoute>
      <FullBracketView />
    </AdminRoute>
  );
}
