import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";
import { safeNextPath } from "@/lib/auth-next-path.mjs";
import { rigViolation } from "@/lib/rig-guard.mjs";
import { resolveRole } from "@/lib/role-resolve";
import { endpointFor, isWriteMethod } from "@/lib/permissions/catalogue.mjs";
import { can, canAny, REFUSED, roleKey } from "@/lib/permissions/grants.mjs";
import { DEFAULT_START, isStartPage } from "@/lib/user-settings";
import docsSite from "@/content/docs/site.json";

// APP metadata only (see lib/role-resolve.ts): a person can edit their own user_metadata, so a restriction kept only
// there could be removed by the person it restricts.
function isTemporaryUser(user: { app_metadata?: Record<string, unknown> | null; user_metadata?: Record<string, unknown> | null }): boolean { // metadata-ok: a type; only app_metadata is read below
  const appMeta = (user.app_metadata || {}) as Record<string, unknown>;
  const roleValue = String(appMeta.role || "").toLowerCase();
  if (roleValue === "temporary") return true;
  const rolesRaw = appMeta.roles;
  const roles = Array.isArray(rolesRaw) ? rolesRaw.map((v) => String(v).toLowerCase()) : [];
  if (roles.includes("temporary")) return true;
  return appMeta.is_temporary === true;
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

// Client access (Stage 5): the 404 a client gets for any page outside their world, and staff get under /client. Answered
// here, not by a React not-found page: under a streamed root layout notFound() arrives after the 200 has gone out, and the
// portal's root not-found payload would carry the docs. One sentence, the portal's tokens by name only, light and dark.
function clientNotFoundResponse() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found</title><meta name="robots" content="noindex"><style>:root{color-scheme:light dark}body{margin:0;min-height:100dvh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#f6f7f9;color:#1b1f24}@media (prefers-color-scheme:dark){body{background:#0f1216;color:#e6e9ee}}main{max-width:560px;padding:32px 16px}h1{font-size:22px;margin:0 0 8px}p{opacity:.8;margin:0 0 20px}a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid currentColor;color:inherit;text-decoration:none}</style></head><body><main data-client-notfound=""><h1>That is not on your account.</h1><p>If you reached this from a link, the flight or page is not one your account covers.</p><a href="/client">Your flights</a></main></body></html>`;
  return new NextResponse(html, { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
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
    pathname.startsWith("/api/auth/") ||  // Auth API routes used during signup/password-reset (unauthenticated)
    // The docs: behind sign-in until content/docs/site.json says "public": true (the one setting; docs/how-to-write-docs.md).
    (docsSite.public === true && (pathname === "/docs" || pathname.startsWith("/docs/")))
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

  // Client access (Stage 5, 2026-10-25). A client (app_metadata.role "client", written only with the service key when ops
  // decide) lives under /client and nowhere else. Their status (app_metadata.client_status, same writer) picks the page:
  // requested → the waiting screen, refused / removed → their page, approved → the client wall. Every other address in
  // the portal answers 404 for them — not 403, not a redirect to a page that exists: nothing outside their world is
  // confirmed to exist. The holding pages render under a bare route, so the shell, its navigation and its counts are
  // never in their page source.
  const appMetaForClient = (user.app_metadata ?? {}) as Record<string, unknown>;
  if (String(appMetaForClient.role ?? "").toLowerCase() === "client") {
    const status = String(appMetaForClient.client_status ?? "requested").toLowerCase();
    const holding = status === "approved" ? null : status === "refused" ? "/client/refused" : status === "removed" ? "/client/removed" : "/client/waiting";
    const isApi = pathname.startsWith("/api/");
    if (isApi) {
      // Their own request and sign-out only; the wall's API is reached at /digital-wall/api and enforces scope itself.
      if (pathname.startsWith("/api/client/") || pathname.startsWith("/api/auth/")) return response;
      return NextResponse.json({ ok: false, error: "That is not on your account." }, { status: 404 });
    }
    // The root is where sign-in lands them: their world's front door (approved) or their holding page. Nothing else
    // outside /client redirects — it is 404, so no portal page is confirmed to exist.
    if (pathname === "/") { const to = request.nextUrl.clone(); to.pathname = holding ?? "/client"; to.search = ""; return NextResponse.redirect(to); }
    if (holding) {
      if (pathname === holding || pathname.startsWith("/api/auth/")) return response;
      if (pathname.startsWith("/client")) { const to = request.nextUrl.clone(); to.pathname = holding; to.search = ""; return NextResponse.redirect(to); }
      return clientNotFoundResponse();
    }
    if (pathname.startsWith("/client/waiting") || pathname.startsWith("/client/refused") || pathname.startsWith("/client/removed")) { const to = request.nextUrl.clone(); to.pathname = "/client"; to.search = ""; return NextResponse.redirect(to); }
    if (pathname === "/client" || pathname.startsWith("/client/")) return response;
    return clientNotFoundResponse();
  }
  // Staff never land in the client's world.
  if (pathname === "/client" || pathname.startsWith("/client/")) return clientNotFoundResponse();

  // Approval lives in APP metadata (written only with the service key; a person cannot approve themselves by editing
  // their own user_metadata), and it must say true. A MISSING flag is NOT approved (2026-10-25): until then a missing
  // flag was read as "an old account, let it through", and seven accounts at other companies were inside on that
  // default alone. Every real account carries is_approved: true since scripts/metadata-to-app.mjs ran.
  const isApprovedMeta = (user.app_metadata as Record<string, unknown> | null)?.is_approved;
  if (isApprovedMeta !== true && !pathname.startsWith("/pending-approval")) {
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

  // Start page (Settings → Preferences, portal redesign stage 4): "/" — where sign-in lands when no other page was asked
  // for — sends the person to the page they chose, the Dashboard otherwise. Here, before anything renders, so it is a
  // real redirect. Their own row (RLS: user_preferences_all_own); before docs/supabase-portal-settings.sql has run the
  // read fails and the Dashboard stands. Legacy /?icao= links go on to the page, which forwards them to /aip.
  if (pathname === "/" && request.method === "GET" && !request.nextUrl.searchParams.has("icao")) {
    let dest = DEFAULT_START;
    try {
      const { data } = await supabase.from("user_preferences").select("start_page").eq("user_id", user.id).maybeSingle();
      const chosen = (data as { start_page?: unknown } | null)?.start_page;
      if (isStartPage(chosen)) dest = chosen;
    } catch { /* the Dashboard */ }
    // Built like the sign-in redirect above (nextUrl, which follows the host the request came in on).
    const to = request.nextUrl.clone();
    to.pathname = dest;
    to.search = "";
    const redirect = NextResponse.redirect(to);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

