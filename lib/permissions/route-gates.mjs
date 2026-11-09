// Every portal route handler checks who is asking, at the endpoint (2026-11-02, docs/permissions.md › Gates at the
// endpoint). The middleware is the second layer, never the only one: a client used to be refused by one middleware block
// and treated as the User role by everything beneath it.
//
// A handler passes when its body calls one of GATES. The files below call none, on purpose; each says why. Nothing joins
// this list without a reason, and a new route that is on neither side fails the build (lib/permissions/check.mjs).
import fs from "node:fs";
import path from "node:path";

export const GATES = ["staffGate", "requireAuthenticatedUser", "currentPerson", "requirePermission", "requireAdmin", "requireDeveloper", "requireClient"];

// The client allow-list is the set of handlers that call requireClient: today GET /api/client/me (their own standing)
// and POST /api/client/account/password (their own password, 2026-11-09).
// Everything else a client could reach is refused at the endpoint by the staff helpers.
export const UNGATED = {
  "app/api/health/route.ts": "the health probe compose and the image check call; answers ok and a version, no data",
  "app/api/maintenance/route.ts": "whether maintenance is on and its message: the signed-out maintenance page reads it",
  "app/api/auth/email/confirm/route.ts": "sign-up confirmation: the person has no session yet; the one-time token is the check",
  "app/api/auth/email/request-confirmation/route.ts": "sign-up: no session yet; rate-limited by the address",
  "app/api/auth/password/forgot/route.ts": "forgot password: signed out by definition; the same answer for every address",
  "app/api/auth/password/reset/route.ts": "sets a password for the session the reset link opened (it checks that session itself)",
  "app/auth/callback/route.ts": "where Supabase's links land; verifies the token itself",
  "app/auth/sign-out/route.ts": "signs out whoever asks; nothing to protect",
  "app/api/client-requests/route.ts": "ask for access: signed out, makes no account; rate-limited",
  "app/api/client-invite/route.ts": "the set-password link: the single-use token is the check",
  "app/api/client-invite/new-link/route.ts": "a new link, sent only to the address on the request; the old token is the check",
  "app/api/telegram/debug/route.ts": "Telegram's webhook: checked against the bot's secret header",
  "app/api/telegram/support/route.ts": "the Telegram mini app: checked against Telegram's signed initData",
  "app/api/telegram/support/attachment/[id]/route.ts": "the Telegram mini app: checked against Telegram's signed initData",
  "app/api/unsubscribe/route.ts": "the unsubscribe link from an email: its signed token is the check",
  "app/docs/404.css/route.ts": "the docs' stylesheet, built once (static)",
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); } else if (e.name === "route.ts" || e.name === "route.js") out.push(p);
  }
  return out;
}

/** Problems, one per handler that checks nobody and is not on UNGATED; [] when every handler is gated or excused. */
export function checkRouteGates(root) {
  const errors = [];
  const files = walk(path.join(root, "app")).map((f) => path.relative(root, f).split(path.sep).join("/"));
  if (!files.length) return ["checkRouteGates: no route file found under app/ — a gate with no input refuses (2026-10-21)"];
  for (const f of Object.keys(UNGATED)) if (!files.includes(f)) errors.push(`${f} is on the UNGATED list but no longer exists: remove it (lib/permissions/route-gates.mjs)`);
  for (const f of files) {
    if (UNGATED[f]) continue;
    const src = fs.readFileSync(path.join(root, f), "utf8");
    const hs = [...src.matchAll(/^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|^export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/gm)];
    hs.forEach((m, i) => {
      const body = src.slice(m.index, hs[i + 1]?.index ?? src.length);
      const alias = body.match(/^export\s+const\s+\w+\s*=\s*(\w+)\s*;/);
      const text = alias ? src : body;   // `export const HEAD = GET;` shares GET's gate
      if (!GATES.some((g) => new RegExp(`\\b${g}\\s*\\(`).test(text))) errors.push(`${f} ${m[1] ?? m[2]}: checks nobody at the endpoint — call one of ${GATES.join(", ")}, or put the file on UNGATED with a reason (lib/permissions/route-gates.mjs)`);
    });
  }
  return errors;
}
