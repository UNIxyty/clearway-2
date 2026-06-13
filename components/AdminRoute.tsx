'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * Client-side guard for admin-only sections.
 * Redirects to /forbidden if the user is not an admin.
 * Use this as a wrapper in client page components.
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { isAdmin, loading } = useIsAdmin();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/forbidden');
    }
  }, [isAdmin, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-bk-blue/30 border-t-bk-blue animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}
