import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CompassIcon, HomeIcon } from "lucide-react";
import DocsNotFound from "@/app/docs/not-found";

// Next answers an address no route knows with this page, and a real 404 — including /docs/<anything unknown>. The docs
// have their own not-found page in their own shell, so both are rendered, and a line of script run before the first
// paint shows the docs one under /docs, with the docs' styles from /docs/404.css (app/docs/404.css/route.ts). The
// docs CSS is not imported here: that would load it on every portal page. The docs version stays hidden until its
// stylesheet has loaded, so it never shows unstyled. The markup is the same either way, so hydration matches.
const DOCS_404 = `(function(){var p=location.pathname;if(p!=="/docs"&&p.indexOf("/docs/")!==0)return;var d=document.documentElement;d.setAttribute("data-docs-404","");var l=document.createElement("link");l.rel="stylesheet";l.href="/docs/404.css";l.onload=function(){d.setAttribute("data-docs-404","ready")};document.head.appendChild(l)})()`;
const SWITCH = ".nf-docs{display:none}html[data-docs-404] .nf-portal{display:none}html[data-docs-404=ready] .nf-docs{display:block}";

export default function NotFound() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: DOCS_404 }} />
      <style dangerouslySetInnerHTML={{ __html: SWITCH }} />
      <div className="nf-portal"><PortalNotFound /></div>
      <div className="nf-docs"><DocsNotFound /></div>
    </>
  );
}

function PortalNotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-cw-bg-page p-4 sm:p-6 lg:p-10 flex items-center justify-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.14),transparent_40%),radial-gradient(circle_at_80%_20%,hsl(var(--accent)/0.12),transparent_40%),radial-gradient(circle_at_50%_80%,hsl(var(--muted-foreground)/0.08),transparent_50%)]" />
      <Card className="relative w-full max-w-2xl border-cw-border/70 bg-cw-bg-surface/95 backdrop-blur-sm shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <img
              src="/header_logo_white.svg"
              alt="Clearway"
              className="h-8 sm:h-10 w-auto object-contain opacity-90"
              style={{ filter: "invert(1)" }}
            />
            <img src="/logo.png" alt="Verxyl" className="h-8 sm:h-10 w-auto object-contain opacity-90" />
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cw-primary/30 bg-cw-primary/10 px-3 py-1 text-xs text-cw-text-link">
            <CompassIcon className="size-3.5" />
            Error 404
          </div>
          <CardTitle className="text-xl sm:text-2xl">Page not found</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            The page you are looking for does not exist or was moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border border-cw-border/60 bg-cw-bg-page/70 p-4 text-cw-text-muted">
            Please check the URL or go back to the home page.
          </div>
          <Button asChild type="button" variant="outline" className="gap-2">
            <Link href="/">
              <HomeIcon className="size-4" />
              Go to home
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
