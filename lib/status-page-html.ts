// The status screen as static HTML (2026-11-11), for the two pages the middleware answers itself — a client's 404 for
// anything outside their world (and staff under /client), and the 404 for a role nobody planned for. The same layout
// as components/portal/StatusScreen.tsx: centred card, the Clearway logo (currentColor, so light on dark), an eyebrow,
// a headline, one line, one button. Theme: the device's, overridden by the portal's saved choice (localStorage cw-theme)
// through a two-line script, with the portal's own colour values. No React: under a streamed root layout notFound()
// would arrive after the 200 has gone out, and the root not-found's payload carries the docs.
import { CLEARWAY_LOGO_PATHS, CLEARWAY_LOGO_VIEWBOX } from "@/lib/brand/clearway-logo-paths";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function statusPageHtml({ kind, eyebrow, title, line, action, tone = "neutral" }: { kind: string; eyebrow: string; title: string; line: string; action: { label: string; href: string } | { label: string; form: string }; tone?: "neutral" | "danger" }) {
  const logo = `<svg viewBox="${CLEARWAY_LOGO_VIEWBOX}" height="36" fill="currentColor" role="img" aria-label="Clearway" style="display:block;width:auto">${CLEARWAY_LOGO_PATHS.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
  const button = "href" in action
    ? `<a class="btn" href="${esc(action.href)}" data-status-action="">${esc(action.label)}</a>`
    : `<form method="post" action="${esc(action.form)}" style="margin:0"><button class="btn" type="submit" data-status-action="">${esc(action.label)}</button></form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(title)}</title><meta name="robots" content="noindex">
<style>
:root{color-scheme:light dark;--bg:#f3f5f8;--surface:#ffffff;--text:#13171d;--body:#3b4350;--muted:#6b7280;--border:#dde2ea;--ink:#13171d;--on-ink:#ffffff;--pill:#e8f0ff;--pill-text:#1d4ed8;--pill-border:#c6d8ff;--danger:#b42318;--danger-tint:#fdeceb;--danger-border:#f5c2bd}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1216;--surface:#171b22;--text:#e8ebf2;--body:#c0c6d2;--muted:#8a93a3;--border:#2a3140;--ink:#e8ebf2;--on-ink:#13171d;--pill:#1b2a4a;--pill-text:#9db7ff;--pill-border:#2c4476;--danger:#ff8a80;--danger-tint:#3a1d1c;--danger-border:#6b2c29}}
:root[data-theme="dark"]{--bg:#0f1216;--surface:#171b22;--text:#e8ebf2;--body:#c0c6d2;--muted:#8a93a3;--border:#2a3140;--ink:#e8ebf2;--on-ink:#13171d;--pill:#1b2a4a;--pill-text:#9db7ff;--pill-border:#2c4476;--danger:#ff8a80;--danger-tint:#3a1d1c;--danger-border:#6b2c29}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));font:15px/1.55 "Public Sans",system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}
.card{width:100%;max-width:672px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.18)}@media(min-width:640px){.card{padding:32px}}
.logo{color:var(--text)}.pill{display:inline-flex;align-items:center;margin-top:20px;padding:4px 12px;border-radius:999px;border:1px solid var(--pill-border);background:var(--pill);color:var(--pill-text);font-size:12px;font-weight:600}
.pill.danger{background:var(--danger-tint);border-color:var(--danger-border);color:var(--danger)}
h1{margin:12px 0 0;font-size:22px;line-height:1.2;font-weight:800;text-wrap:balance}@media(min-width:640px){h1{font-size:26px}}
p{margin:8px 0 0;max-width:60ch;color:var(--body)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-width:160px;height:44px;margin-top:24px;padding:0 20px;border-radius:10px;border:0;background:var(--ink);color:var(--on-ink);font:600 14px/1 inherit;text-decoration:none;cursor:pointer}
</style>
<script>try{var t=localStorage.getItem("cw-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
</head><body><main class="card" data-status-screen="${esc(kind)}"${kind === "client-not-found" ? " data-client-notfound=\"\"" : ""} role="region" aria-labelledby="t"><div class="logo">${logo}</div><div class="pill${tone === "danger" ? " danger" : ""}" data-status-eyebrow="">${esc(eyebrow)}</div><h1 id="t">${esc(title)}</h1><p>${esc(line)}</p>${button}</main></body></html>`;
}
