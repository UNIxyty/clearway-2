'use client';
import { useAdminConsoleData } from '@/hooks/useAdminConsoleData';
export function useR32Bracket(): { assignedSlots: number } {
  return { assignedSlots: useAdminConsoleData().assignedSlots };
}
