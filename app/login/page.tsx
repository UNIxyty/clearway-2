import LoginCard from "./ui/LoginCard";
import SigninPhoto from "./ui/SigninPhoto";
import { ClearwayLogo } from "@/components/portal/ClearwayLogo";
import { safeNextPath } from "@/lib/auth-next-path.mjs";

// Sign In v2 (Claude Design "Clearway Portal", Sign In v2.dc.html; 2026-10-28): the form on the portal's own page
// colours, a photograph panel beside it from 900 px. The form is the page: it is in the server HTML and paints with the
// page's own stylesheet; the photograph is added by SigninPhoto after load, never below 900 px. No animation runs here
// (the old animated backdrop is gone with the old card).
// This page uses useSearchParams() in a client component; force dynamic rendering
export const dynamic = "force-dynamic";

const CSS = `
.si-page{min-height:100vh;min-height:100dvh;display:grid;grid-template-columns:minmax(0,1fr);background:var(--cw-bg-page);color:var(--cw-text);font-family:'Public Sans',system-ui,sans-serif}
.si-side{display:none}
@media (min-width:900px){.si-page{grid-template-columns:460px minmax(0,1fr)}.si-side{display:flex;padding:12px 0 12px 12px;min-width:0}}
@media (min-width:1200px){.si-page{grid-template-columns:680px minmax(0,1fr)}}
.si-panel{position:relative;flex:1;border-radius:20px;overflow:hidden;background:var(--si-hero-base)}
.si-photo{transition:opacity .6s ease}
@media (prefers-reduced-motion:reduce){.si-photo{transition:none}}
.si-main{min-width:0;display:flex;flex-direction:column}
.si-formwrap{flex:1;display:flex;justify-content:center;align-items:flex-start;padding:28px 20px}
@media (min-width:700px){.si-formwrap{align-items:center;padding:48px 40px}}
.si-form{width:100%;max-width:400px;display:flex;flex-direction:column;gap:22px}
.si-logo{display:flex;color:var(--cw-text);margin-bottom:4px}
@media (min-width:700px){.si-logo{margin-bottom:12px}}
.si-h1{margin:0;font-size:26px;line-height:1.2;font-weight:650;letter-spacing:-.015em}
@media (min-width:700px){.si-h1{font-size:30px}}
.si-in{transition:border-color .14s ease, box-shadow .14s ease}
.si-in:focus-within{border-color:var(--cw-focus) !important;box-shadow:0 0 0 3px var(--cw-focus-halo)}
.si-btn{transition:background .15s ease}
.si-btn:hover:enabled{background:var(--cw-primary-hover) !important}
.si-link{color:var(--cw-text-link);font-weight:600;text-decoration:none}
.si-link:hover{text-decoration:underline;text-underline-offset:3px}
@keyframes sispin{to{transform:rotate(360deg)}}
`;

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const nextRaw = searchParams?.next;
  const next = safeNextPath(Array.isArray(nextRaw) ? nextRaw[0] : nextRaw, "");

  return (
    <div className="si-page">
      {/* raw text, not text children: React escapes the quotes in text children, and a style element keeps the escape (rig/check-style-text.mjs) */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <aside className="si-side" aria-hidden="true">
        <div className="si-panel">
          <SigninPhoto />
        </div>
      </aside>
      <main className="si-main">
        <div className="si-formwrap">
          <div className="si-form">
            <span className="si-logo"><ClearwayLogo height={36} /></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h1 className="si-h1">Sign in</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--cw-text-body)" }}>Use your work email and password.</p>
              {next && next !== "/" && (
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--cw-text-muted)", overflowWrap: "anywhere" }}>
                  After you sign in you return to{" "}
                  <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", color: "var(--cw-text)" }}>{next}</span>
                </p>
              )}
            </div>
            <LoginCard />
          </div>
        </div>
        <p style={{ flex: "none", margin: 0, padding: "16px 20px 22px", textAlign: "center", fontSize: 12.5, color: "var(--cw-text-muted)" }}>
          By continuing, you agree to use this data for operational purposes only.
        </p>
      </main>
    </div>
  );
}
