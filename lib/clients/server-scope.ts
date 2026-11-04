// The signed-in client's scope for a server component (2026-11-04): the same scopeFor the middleware uses, read from the
// session's own cookies. null for staff or no session; NOBODY on any read error (fail closed).
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { scopeFor } from "@/lib/clients/scope.mjs";

export async function currentClient() {
  try {
    const { data } = await createSupabaseServerClient().auth.getUser();
    if (!data.user) return { user: null, scope: null };
    return { user: data.user, scope: await scopeFor(data.user) };
  } catch { return { user: null, scope: null }; }
}
