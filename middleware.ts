import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";
import { safeNextPath } from "@/lib/auth-next-path.mjs";

function isTemporaryUser(user: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}): boolean {
  const appMeta = (user.app_metadata || {}) as Record<string, unknown>;
  const userMeta = (user.user_metadata || {}) as Record<string, unknown>;
  const roleValue = String(appMeta.role || userMeta.role || "").toLowerCase();
  if (roleValue === "temporary") return true;
  const rolesRaw = appMeta.roles || userMeta.roles;
  const roles = Array.isArray(rolesRaw) ? rolesRaw.map((v) => String(v).toLowerCase()) : [];
  if (roles.includes("temporary")) return true;
  return appMeta.is_temporary === true || userMeta.is_temporary === true;
}

function isTemporaryAllowedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/pickem") ||
    pathname.startsWith("/api/pickem") ||
    pathname.startsWith("/playoffs") ||
    pathname.startsWith("/api/playoffs") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/pending-approval") ||
    pathname.startsWith("/access-blocked") ||
    pathname.startsWith("/maintenance")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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

  // Telegram webhook must be reachable without browser session; endpoint validates its own secret header.
  if (pathname.startsWith("/api/telegram/debug")) {
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

  // Public routes when maintenance mode is not active. Login/signup are
  // handled below so an already-signed-in user bounces straight to `next`.
  if (
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||  // Auth API routes used during signup/password-reset (unauthenticated)
    pathname === "/api/pickem/health" ||
    pathname === "/pickem/api/health" ||
    pathname === "/api/health" ||  // Portal health probe: must answer without a session (uptime checkers)

    pathname.startsWith("/maintenance")
  ) {
    return NextResponse.next();
  }

  const isAuthEntryPage = pathname.startsWith("/login") || pathname.startsWith("/signup");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isAuthEntryPage) {
    if (user) {
      // Already authenticated: skip the form and return to the origin page.
      // safeNextPath only ever yields a same-origin relative path.
      const destination = safeNextPath(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
    }
    return response;
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // Carry only `next`; inheriting the original query could smuggle stray
    // error/message params onto the login card.
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect accounts pending admin approval (is_approved explicitly false in metadata).
  // Undefined means existing account (not subject to approval flow) → allowed through.
  const isApprovedMeta = (user.user_metadata as Record<string, unknown> | null)?.is_approved;
  if (isApprovedMeta === false && !pathname.startsWith("/pending-approval")) {
    const pendingUrl = request.nextUrl.clone();
    pendingUrl.pathname = "/pending-approval";
    // Keep the deep link: once approved, the page returns the user there.
    pendingUrl.search = "";
    pendingUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(pendingUrl);
  }

  if (isTemporaryUser(user) && !isTemporaryAllowedPath(pathname)) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Forbidden for temporary user." }, { status: 403 });
    }
    const blockedUrl = request.nextUrl.clone();
    blockedUrl.pathname = "/access-blocked";
    blockedUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(blockedUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

