/* =============================================================================
 * resolveRecipients — single source of truth for "who receives this email".
 * Shared by the admin email endpoints, the recipient-count endpoint, and the
 * send-broadcast CLI. ALWAYS excludes opted-out users, regardless of filters.
 *
 * Points-based filters (minPoints/maxPoints/topN) use the COMBINED leaderboard
 * (getLeaderboard — group ledger + playoff points), so they match the unified
 * standings. Pick-submission filters use the prediction tables directly.
 * ===========================================================================*/
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateToken } from '@/server/utils/unsubscribeToken';
import { getActiveCompetition, getLeaderboard } from '@/lib/pickem-store';

export interface RecipientFilters {
  mode: 'all' | 'filtered' | 'list';
  hasGroupPicks?: boolean;
  hasPlayoffPicks?: boolean;
  noPlayoffPicks?: boolean;
  minPoints?: number;
  maxPoints?: number;
  topN?: number;
  emailList?: string[];
}

export interface RecipientUser {
  userId: string;
  email: string;
  firstName: string;
  unsubscribeToken: string;
}

function numParam(v: string | null): number | undefined {
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse RecipientFilters from a query string (used by the count endpoint). */
export function filtersFromParams(sp: URLSearchParams): RecipientFilters {
  const modeRaw = sp.get('mode');
  const mode: RecipientFilters['mode'] = modeRaw === 'filtered' || modeRaw === 'list' ? modeRaw : 'all';
  return {
    mode,
    hasGroupPicks: sp.get('hasGroupPicks') === 'true' || undefined,
    hasPlayoffPicks: sp.get('hasPlayoffPicks') === 'true' || undefined,
    noPlayoffPicks: sp.get('noPlayoffPicks') === 'true' || undefined,
    minPoints: numParam(sp.get('minPoints')),
    maxPoints: numParam(sp.get('maxPoints')),
    topN: numParam(sp.get('topN')),
    emailList: (sp.get('emailList') ?? '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean),
  };
}

function firstNameFrom(displayName: string | null, meta: Record<string, unknown> | undefined, email: string): string {
  const raw = String(displayName || (meta?.display_name as string) || (meta?.name as string) || '').trim()
    || email.split('@')[0];
  return raw.split(/\s+/)[0] || 'there';
}

/**
 * Resolve the final recipient set for the given filters. Opted-out users are
 * always removed last, so no filter combination can email them.
 */
export async function resolveRecipients(filters: RecipientFilters): Promise<RecipientUser[]> {
  const supabase = createSupabaseAdminClient();

  // Base: every auth user + their preferences (display name, opt-out).
  const { data: authData, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Failed to list users: ${error.message}`);

  const { data: prefRows } = await supabase
    .from('user_preferences')
    .select('user_id, display_name, email_opt_out');
  const prefByUser = new Map(
    (prefRows ?? []).map(p => [p.user_id as string, p as { display_name: string | null; email_opt_out: boolean | null }]),
  );

  type Base = { userId: string; email: string; firstName: string };
  let pool: Base[] = [];
  for (const u of authData.users) {
    if (!u.email) continue;
    const prefs = prefByUser.get(u.id);
    if (prefs?.email_opt_out) continue; // opted out — always excluded
    pool.push({
      userId: u.id,
      email: u.email,
      firstName: firstNameFrom(prefs?.display_name ?? null, u.user_metadata as Record<string, unknown> | undefined, u.email),
    });
  }

  // ── mode: list (pasted emails) ──
  if (filters.mode === 'list') {
    const wanted = new Set((filters.emailList ?? []).map(e => e.trim().toLowerCase()).filter(Boolean));
    pool = pool.filter(u => wanted.has(u.email.toLowerCase()));
  }

  // ── mode: filtered ──
  if (filters.mode === 'filtered') {
    // Pick-submission filters.
    if (filters.hasGroupPicks) {
      const ids = await distinctUserIds(supabase, 'pickem_prediction_submissions');
      pool = pool.filter(u => ids.has(u.userId));
    }
    if (filters.hasPlayoffPicks) {
      const ids = await playoffPickUserIds(supabase);
      pool = pool.filter(u => ids.has(u.userId));
    }
    if (filters.noPlayoffPicks) {
      const ids = await playoffPickUserIds(supabase);
      pool = pool.filter(u => !ids.has(u.userId));
    }

    // Points / rank filters — from the combined leaderboard.
    const needsPoints = filters.minPoints !== undefined || filters.maxPoints !== undefined || filters.topN !== undefined;
    if (needsPoints) {
      const comp = await getActiveCompetition();
      const board = comp ? await getLeaderboard(comp.id) : [];
      const pointsByUser = new Map(board.map(r => [r.userId, r.points]));
      const rankByUser = new Map(board.map(r => [r.userId, r.rank]));
      pool = pool.filter(u => {
        const pts = pointsByUser.get(u.userId) ?? 0;
        if (filters.minPoints !== undefined && pts < filters.minPoints) return false;
        if (filters.maxPoints !== undefined && pts > filters.maxPoints) return false;
        if (filters.topN !== undefined) {
          const rank = rankByUser.get(u.userId);
          if (rank === undefined || rank > filters.topN) return false;
        }
        return true;
      });
    }
  }

  return pool.map(u => ({ ...u, unsubscribeToken: generateToken(u.userId) }));
}

async function distinctUserIds(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: string,
): Promise<Set<string>> {
  const { data } = await supabase.from(table).select('user_id');
  return new Set((data ?? []).map(r => String((r as { user_id: string }).user_id)));
}

/**
 * Email addresses of all admins/developers — from ADMIN_EMAILS env plus
 * user_preferences (is_admin / is_developer). Used for "send to admins only".
 */
export async function getAdminEmails(): Promise<string[]> {
  const supabase = createSupabaseAdminClient();
  const out = new Set(
    String(process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  );
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('user_id')
    .or('is_admin.eq.true,is_developer.eq.true');
  const ids = new Set((prefs ?? []).map(p => String((p as { user_id: string }).user_id)));
  if (ids.size > 0) {
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data.users) {
      if (u.email && ids.has(u.id)) out.add(u.email.toLowerCase());
    }
  }
  return [...out];
}

async function playoffPickUserIds(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<Set<string>> {
  const { data } = await supabase
    .from('playoff_predictions')
    .select('user_id')
    .not('predicted_winner_id', 'is', null);
  return new Set((data ?? []).map(r => String((r as { user_id: string }).user_id)));
}
