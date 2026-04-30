import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const disableAuthForTesting = String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true";
  const isPublicAsset = /\.[^/]+$/.test(pathname);

  // Bypass auth checks on isolated test environments.
  if (disableAuthForTesting) {
    return NextResponse.next();
  }

  // Internal server-to-server debug runner traffic can bypass user session auth.
  if (pathname.startsWith("/api") && hasInternalDebugAccess(request)) {
    return NextResponse.next();
  }

  // Static and asset routes
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || isPublicAsset) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // If Supabase isn't configured, don't block the app.
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Maintenance gate: allow only maintenance/admin/api while enabled.
  const maintenanceAllowed =
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/admin/maintenance");

  if (!maintenanceAllowed) {
    try {
      const { data: maintenance } = await supabase
        .from("maintenance")
        .select("enabled")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (maintenance?.enabled) {
        const maintenanceUrl = request.nextUrl.clone();
        maintenanceUrl.pathname = "/maintenance";
        return NextResponse.redirect(maintenanceUrl);
      }
    } catch {
      // If maintenance table is missing/unavailable, continue without blocking.
    }
  }

  // Public routes when maintenance mode is not active.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/maintenance")
  ) {
    return NextResponse.next();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

