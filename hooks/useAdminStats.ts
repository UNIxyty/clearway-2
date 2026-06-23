'use client';
import type { AdminStats } from '@/types/admin';
import { useAdminConsoleData } from '@/hooks/useAdminConsoleData';
export function useAdminStats(): AdminStats {
  return useAdminConsoleData().stats;
}
