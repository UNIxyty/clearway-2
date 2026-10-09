import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";
import { safeNextPath } from "@/lib/auth-next-path.mjs";
import { rigViolation } from "@/lib/rig-guard.mjs";
import { resolveRole } from "@/lib/role-resolve";
import { endpointFor, isWriteMethod } from "@/lib/permissions/catalogue.mjs";
import { can, canAny, REFUSED, roleKey } from "@/lib/permissions/grants.mjs";

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
  // The test rig must never reach the production database (lib/rig-guard.mjs).
  // Checked twice: against the runtime env, and against the URL compiled into this build (Next.js inlines the
  // literal process.env.NEXT_PUBLIC_SUPABASE_URL at build time — a build made from .env carries production).
  { const why = rigViolation() ?? rigViolation({ ...process.env, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL }); if (why) return new NextResponse(`REFUSING: ${why}`, { status: 500 }); }

  const { pathname, search } = request.nextUrl;
  const disableAuthForTesting = String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true";
  // Cached PDFs under /files/* are NOT public assets even though they carry an
  // extension: they need the normal session (audit §8.3 — any file URL used to
  // be world-readable). The wall's server-side fetches carry the shared
  // secret header instead (digital-wall/lib/portal-client.mjs) and are let
  // through below, next to the /api bypass.
  const isStoredFile = pathname.startsWith("/files/");
  // Portal foundations 1.5: only real static assets are public — images, fonts, styles, scripts (the PDF worker and
  // the voice worklet). It used to be ANY path with a dot, which served internal HTML tools and JSON from public/ to
  // anyone (and rendered page shells such as /aip/X.json without a session). Everything else needs sign-in.
  const isPublicAsset = !isStoredFile && /\.(?:png|jpe?g|gif|svg|webp|ico|avif|woff2?|ttf|otf|css|js|mjs|map)$/i.test(pathname);

  // Bypass auth checks on isolated test environments.
  if (disableAuthForTesting) {
    return NextResponse.next();
  }

  // Internal server-to-server traffic (debug runner, the wall) can bypass
  // user session auth on /api/* and on the shared PDF cache under /files/*.
  if ((pathname.startsWith("/api") || isStoredFile) && hasInternalDebugAccess(request)) {
    return NextResponse.next();
  }

  // Telegram webhook must be reachable without browser session; endpoint validates its own secret header.
  if (pathname.startsWith("/api/telegram/debug")) {
    return NextResponse.next();
  }

  // The Telegram mini app runs inside Telegram's webview with no Supabase
  // session. The page is a shell; every /api/telegram/support call validates
  // the HMAC-signed initData itself and fails closed (401).
  if (pathname.startsWith("/telegram/support") || pathname.startsWith("/api/telegram/support")) {
    return NextResponse.next();
  }

  // The flight-intake answer page (one tap on "Yes, process it" / "No, skip it" from the E1 email) needs no
  // sign-in: the single-use token in the link is the authentication, and the agent service checks it.
  if (pathname === "/intake/answer") {
    return NextResponse.next();
  }

  // Static and asset routes
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || isPublicAsset) {
    return NextResponse.next();
  }

  // Health probes must answer even while auth is misconfigured, so ops can
  // see the outage instead of a 503 (§8.3 fail-closed exception).
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // Pick'em has been retired (portal foundations 4.1; archived on the server, docs/pickem-archive.md). Its paths
  // answer 410 Gone to everyone, signed in or not, so an old link or bookmark is told so rather than sent to sign-in.
  if (/^\/(api\/)?(pickem|playoffs)(\/|$)/.test(pathname)) {
    return new NextResponse("Pick'em has been retired.", { status: 410, headers: { "content-type": "text/plain; charset=utf-8" } });
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

  // Maintenance gate (portal foundations 1.2). While maintenance is on:
  //   - sign-in stays reachable (/login, and /auth/* for callbacks and password resets), so nobody is locked out;
  //   - an admin or developer is sent to /admin/maintenance, the page that turns it off;
  //   - everyone else sees /maintenance. /api keeps answering (each route checks its own access).
  // The way out from the server when even that fails: MAINTENANCE_FORCE_OFF=true in the portal's env ignores the flag,
  // or scripts/maintenance-off.sh records "off" in the database (docs/maintenance.md).
  const maintenanceForcedOff = String(process.env.MAINTENANCE_FORCE_OFF || "").toLowerCase() === "true";
  const maintenanceAllowed =
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/");

  if (!maintenanceAllowed && !maintenanceForcedOff) {
    let enabled = false;
    try {
      const { data: maintenance } = await supabase
        .from("maintenance")
        .select("enabled")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      enabled = Boolean(maintenance?.enabled);
    } catch {
      // If maintenance table is missing/unavailable, continue without blocking.
    }

    if (enabled) {
      let staff = false;
      let signedIn = false;
      try {
        const { data: { user: who } } = await supabase.auth.getUser();
        if (who) {
          signedIn = true;
          // Admins and developers, and anyone the grid lets switch maintenance (Admin → Permissions), reach the off switch.
          const role = await resolveRole(supabase, who, who.id, who.email ?? null);
          staff = role !== "none" || (await canAny(roleKey(role), ["portal.maintenance.disable", "portal.maintenance.enable"]));
        }
      } catch {
        // Unknown → treated as not staff: they see /maintenance, which links to sign-in.
      }
      const isOffSwitch = pathname.startsWith("/admin/maintenance");
      if (isOffSwitch && !signedIn) {
        // Fall through to the normal sign-in redirect below, which comes back here.
      } else if (staff && !isOffSwitch) {
        const offSwitch = request.nextUrl.clone();
        offSwitch.pathname = "/admin/maintenance";
        offSwitch.search = "";
        return NextResponse.redirect(offSwitch);
      } else if (!staff) {
        const maintenanceUrl = request.nextUrl.clone();
        maintenanceUrl.pathname = "/maintenance";
        maintenanceUrl.search = "";
        return NextResponse.redirect(maintenanceUrl);
      }
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

  // Permissions (docs/permissions.md): every write must be in lib/permissions/catalogue.mjs, and the person's role must
  // hold its action. An endpoint nobody listed is refused, not open. The handler checks again where the work happens.
  if (isWriteMethod(request.method)) {
    const entry = endpointFor("portal", request.method, pathname);
    if (!entry) {
      return NextResponse.json({ error: "This endpoint is not in the permissions list, so it is refused." }, { status: 403 });
    }
    if (!entry.public) {
      const role = roleKey(await resolveRole(supabase, user, user.id, user.email ?? null));
      const allowed = entry.any ? await canAny(role, entry.any) : await can(role, entry.action);
      if (!allowed) return NextResponse.json({ error: REFUSED, permission: entry.any ?? entry.action }, { status: 403 });
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

