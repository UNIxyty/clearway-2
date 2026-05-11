import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { deleteFile, fileExists } from "@/lib/storage";

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

function storageKeysForIcao(icao: string): string[] {
  const upper = icao.toUpperCase();
  const prefix = upper.slice(0, 2);
  return [
    // EAD
    `aip/ead-pdf/${upper}.pdf`,
    `aip/ead/${upper}.json`,
    `aip/gen-pdf/${prefix}-GEN-1.2.pdf`,
    // Scraper
    `aip/scraper-pdf/${upper}.pdf`,
    `aip/scraper/${upper}.json`,
    `aip/scraper-gen-pdf/${upper}-GEN-1.2.pdf`,
    // Non-EAD GEN
    `aip/non-ead-gen-pdf/${upper}-GEN-1.2.pdf`,
    `aip/non-ead-gen/${upper}.json`,
    // USA
    `aip/usa-pdf/${upper}.pdf`,
    `aip/usa/${upper}.json`,
  ];
}

export async function DELETE(request: NextRequest) {
  if (!(await checkIsAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  const keys = storageKeysForIcao(icao);
  const deleted: string[] = [];
  const errors: string[] = [];

  for (const key of keys) {
    try {
      if (await fileExists(key)) {
        await deleteFile(key);
        deleted.push(key);
      }
    } catch (e) {
      errors.push(`${key}: ${(e as Error)?.message ?? "unknown error"}`);
    }
  }

  return NextResponse.json({ deleted, errors });
}
