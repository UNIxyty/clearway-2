import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (typeof window !== "undefined") {
    // Fallback to values bootstrapped from RootLayout (always available in the browser)
    const w = window as unknown as {
      __supabaseUrl?: string;
      __supabaseAnonKey?: string;
    };
    if (!url && w.__supabaseUrl) url = w.__supabaseUrl;
    if (!anonKey && w.__supabaseAnonKey) anonKey = w.__supabaseAnonKey;
  }

  if (!url || !anonKey) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("Supabase URL/anon key missing; auth will not work in this environment.");
    }
  }

  return createBrowserClient(url, anonKey);
}

