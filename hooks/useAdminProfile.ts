'use client';
import { useAdminConsoleData } from '@/hooks/useAdminConsoleData';
export function useAdminProfile(): { name: string; initials: string } {
  return useAdminConsoleData().profile;
}
