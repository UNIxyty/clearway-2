// The address a client writes to (2026-11-09): the setting app_settings 'clients.support_email', edited on Admin ›
// Clients (lib/clients/onboarding.ts › supportEmail). Shown on their Account page and as the one way out of the holding
// pages (refused, removed). A setting, not a line of code, and not the docs' support address (content/docs/site.json):
// the docs point staff to Help & support, which a client cannot open. Empty, or unreadable, means nothing is shown.
// Server only: the page passes the string down.
import { supportEmail } from "@/lib/clients/onboarding";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

export async function clientContactEmail(): Promise<string> {
  try {
    const service = createSupabaseServiceRoleClient();
    return service ? await supportEmail(service) : "";
  } catch { return ""; }
}
