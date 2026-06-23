'use client';
import type { TournamentState } from '@/types/admin';
import { useAdminConsoleData } from '@/hooks/useAdminConsoleData';
export function useTournamentState(): { state: TournamentState } {
  return { state: useAdminConsoleData().state };
}
