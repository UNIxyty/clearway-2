'use client';

import { AdminRoute } from '@/components/AdminRoute';
import { R32DrawView } from '@/components/playoffs/R32DrawView';

export default function R32DrawPage() {
  return (
    <AdminRoute>
      <R32DrawView />
    </AdminRoute>
  );
}
