// Every account, a page at a time (2026-11-07). The auth admin list answers one page per call; a single call with
// page 1 is "the first N", not "every account", and a decision taken on it (no such account, N people waiting) is
// wrong past N without a word. Past `max` it throws: a ceiling that is reached says so.
import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function listAllUsers(service: SupabaseClient, { perPage = 1000, max = 100_000 } = {}): Promise<User[]> {
  const all: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers page ${page}: ${error.message}`);
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < perPage) return all;
    if (all.length >= max) throw new Error(`more than ${max} accounts: refusing to treat a partial list as every account`);
  }
}
