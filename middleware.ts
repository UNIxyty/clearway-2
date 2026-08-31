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

// Auth fails CLOSED (audit §8.3): when Supabase is misconfigured or the auth
// client fails unexpectedly, deny instead of allowing everything through.
// APIs get a 503 JSON body; pages land on /maintenance (which is allowed
// through explicitly, so there is no redirect loop).
function failClosed(request: NextRequest, pathname: string) {
  if (pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: "Authentication is unavailable. Try again shortly." },
      { status: 503, headers: { "retry-after": "60" } }
    );
  }
  const maintenanceUrl = request.nextUrl.clone();
  maintenanceUrl.pathname = "/maintenance";
  maintenanceUrl.search = "";
  return NextResponse.redirect(maintenanceUrl);
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

  // Health probes must answer even while auth is misconfigured, so ops can
  // see the outage instead of a 503 (§8.3 fail-closed exception).
  if (
    pathname === "/api/health" ||
    pathname === "/api/pickem/health" ||
    pathname === "/pickem/api/health"
  ) {
    return NextResponse.next();
  }

  // /maintenance must always render: it is both the maintenance-mode page and
  // the fail-closed landing page. Allowing it here prevents a redirect loop.
  if (pathname.startsWith("/maintenance")) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Supabase not configured → fail CLOSED (audit §8.3). The wall's
    // x-debug-runner-secret bypass above still works: it never needs Supabase.
    return failClosed(request, pathname);
  }

  let response = NextResponse.next({ request });

  let supabase;
  try {
    supabase = createServerClient(url, anonKey, {
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
  } catch {
    return failClosed(request, pathname);
  }

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
    pathname.startsWith("/api/auth/")  // Auth API routes used during signup/password-reset (unauthenticated)
    // Health probes and /maintenance are allowed earlier, before the Supabase
    // env check, so they keep answering while auth is misconfigured.
  ) {
    return NextResponse.next();
  }

  const isAuthEntryPage = pathname.startsWith("/login") || pathname.startsWith("/signup");

  let user;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    // Unexpected auth-client failure → deny, don't allow through (§8.3).
    return failClosed(request, pathname);
  }

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

