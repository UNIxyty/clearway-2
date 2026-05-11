import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { STORAGE_ROOT } from "@/lib/storage";
import { rm, readdir, stat } from "fs/promises";
import path from "path";

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

async function checkIsAdmin(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() {},
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const adminEmails = parseAdminEmails();
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return true;

  const admin = createSupabaseServiceRoleClient();
  const db = admin ?? supabase;
  const { data } = await db
    .from("user_preferences")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(data && (data as { is_admin?: boolean }).is_admin);
}

// Directories to wipe. All are auto-synced and will re-populate on next sync.
// Intentionally excludes aip/usa-pdf and aip/usa-gen-pdf (manually uploaded static files)
// and aip/ead-aip-extracted.json (global EAD index, not per-airport).
const CACHE_DIRS = [
  // PDFs
  "aip/ead-pdf",
  "aip/scraper-pdf",
  "aip/gen-pdf",
  "aip/scraper-gen-pdf",
  "aip/non-ead-gen-pdf",
  // Extracted JSON data (per-airport)
  "aip/ead",
  "aip/scraper",
  "aip/non-ead-gen",
  "aip/usa",
];

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.map((e) => path.join(dir, e));
  } catch {
    return [];
  }
}

export async function DELETE() {
  if (!(await checkIsAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deleted: string[] = [];
  const errors: string[] = [];

  for (const relDir of CACHE_DIRS) {
    const absDir = path.join(STORAGE_ROOT, relDir);
    const files = await listFiles(absDir);
    for (const absPath of files) {
      try {
        const s = await stat(absPath);
        if (!s.isFile()) continue;
        await rm(absPath, { force: true });
        // Return the relative storage key, not the absolute path
        deleted.push(path.relative(STORAGE_ROOT, absPath));
      } catch (e) {
        errors.push(`${path.relative(STORAGE_ROOT, absPath)}: ${(e as Error)?.message ?? "unknown"}`);
      }
    }
  }

  return NextResponse.json({ deleted, errors, total: deleted.length });
}
