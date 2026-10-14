import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { isValidPassword } from "@/lib/auth-email-flow-utils.mjs";
import { failure } from "@/lib/public-error";
import { TRY_AGAIN_SIGNED_OUT } from "@/lib/error-text";

const NOT_CHANGED = `The password was not changed. ${TRY_AGAIN_SIGNED_OUT}`;

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return failure(500, NOT_CHANGED, { tag: "AUTH-RESET", what: "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set" });
  }

  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
  };
  const password = String(body.password ?? "");
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // No-op
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Reset session is missing. Open the reset link again." }, { status: 401 });
  }

  const service = createSupabaseServiceRoleClient();
  if (!service) {
    return failure(503, NOT_CHANGED, { tag: "AUTH-RESET", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  const { error } = await service.auth.admin.updateUserById(user.id, { password });
  if (error) {
    return failure(500, NOT_CHANGED, { tag: "AUTH-RESET", what: "updateUserById failed", detail: error });
  }

  return NextResponse.json({ ok: true });
}
