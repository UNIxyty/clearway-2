// The status screen as static HTML (2026-11-11), for the two pages the middleware answers itself — a client's 404 for
// anything outside their world (and staff under /client), and the 404 for a role nobody planned for. The same layout
// as components/portal/StatusScreen.tsx: centred card, the Clearway logo (currentColor, so light on dark), an eyebrow,
// a headline, one line, one button. Theme: the device's (prefers-color-scheme) with the portal's own tokens (the values
// come from shared/portal-tokens.json, light and dark, so no colour is written out here — 2026-11-12); no
// script at all (the gate walk holds the unknown-role page to that), so the portal's saved theme choice is not read
// here. No React: under a streamed root layout notFound()
// would arrive after the 200 has gone out, and the root not-found's payload carries the docs.
import { CLEARWAY_LOGO_PATHS, CLEARWAY_LOGO_VIEWBOX } from "@/lib/brand/clearway-logo-paths";
import portalTokens from "@/shared/portal-tokens.json";

// the tokens this page uses, by their names in shared/portal-tokens.json; each theme's block carries that theme's values
const USED = ["--cw-bg-page", "--cw-bg-surface", "--cw-bg-scrim", "--cw-text", "--cw-text-body", "--cw-text-muted", "--cw-text-link", "--cw-border", "--cw-ink", "--cw-on-ink", "--cw-primary-tint", "--cw-primary-tint-border", "--cw-danger-text", "--cw-danger-tint", "--cw-danger-border"] as const;
const tokens = (portalTokens as { tokens: Record<string, { light: string; dark: string }> }).tokens;
const vars = (theme: "light" | "dark") => USED.map((k) => `${k}:${tokens[k.slice(5)]?.[theme] ?? "inherit"}`).join(";");
const palette = `:root{color-scheme:light dark;${vars("light")}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${vars("dark")}}}
:root[data-theme="dark"]{${vars("dark")}}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function statusPageHtml({ kind, eyebrow, title, line, action, tone = "neutral" }: { kind: string; eyebrow: string; title: string; line: string; action: { label: string; href: string } | { label: string; form: string }; tone?: "neutral" | "danger" }) {
  const logo = `<svg viewBox="${CLEARWAY_LOGO_VIEWBOX}" height="36" fill="currentColor" role="img" aria-label="Clearway" style="display:block;width:auto">${CLEARWAY_LOGO_PATHS.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
  const button = "href" in action
    ? `<a class="btn" href="${esc(action.href)}" data-status-action="">${esc(action.label)}</a>`
    : `<form method="post" action="${esc(action.form)}" style="margin:0"><button class="btn" type="submit" data-status-action="">${esc(action.label)}</button></form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(title)}</title><meta name="robots" content="noindex">
<style>
${palette}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));font:15px/1.55 "Public Sans",system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--cw-bg-page);color:var(--cw-text)}
.card{width:100%;max-width:672px;background:var(--cw-bg-surface);border:1px solid var(--cw-border);border-radius:16px;padding:24px;box-shadow:0 20px 60px var(--cw-bg-scrim)}@media(min-width:640px){.card{padding:32px}}
.logo{color:var(--cw-text)}.pill{display:inline-flex;align-items:center;margin-top:20px;padding:4px 12px;border-radius:999px;border:1px solid var(--cw-primary-tint-border);background:var(--cw-primary-tint);color:var(--cw-text-link);font-size:12px;font-weight:600}
.pill.danger{background:var(--cw-danger-tint);border-color:var(--cw-danger-border);color:var(--cw-danger-text)}
h1{margin:12px 0 0;font-size:22px;line-height:1.2;font-weight:800;text-wrap:balance}@media(min-width:640px){h1{font-size:26px}}
p{margin:8px 0 0;max-width:60ch;color:var(--cw-text-body)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-width:160px;height:44px;margin-top:24px;padding:0 20px;border-radius:10px;border:0;background:var(--cw-ink);color:var(--cw-on-ink);font:600 14px/1 inherit;text-decoration:none;cursor:pointer}
</style>
</head><body><main class="card" data-status-screen="${esc(kind)}"${kind === "client-not-found" ? " data-client-notfound=\"\"" : kind === "unknown-role" ? " data-unknown-role=\"\"" : ""} role="region" aria-labelledby="t"><div class="logo">${logo}</div><div class="pill${tone === "danger" ? " danger" : ""}" data-status-eyebrow="">${esc(eyebrow)}</div><h1 id="t">${esc(title)}</h1><p>${esc(line)}</p>${button}</main></body></html>`;
}
