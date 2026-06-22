'use client';
// Adapter: design PlayoffsPage/AdminConsole expect useIsAdmin(): boolean.
import { useIsAdmin as useRealIsAdmin } from '@/lib/hooks/useIsAdmin';
export function useIsAdmin(): boolean {
  return useRealIsAdmin().isAdmin;
}
