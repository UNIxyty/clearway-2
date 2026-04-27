import Link from "next/link";
import { ArrowLeftIcon, ExternalLinkIcon, MonitorIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ViewerPageProps = {
  searchParams?: {
    src?: string | string[];
    sessionId?: string | string[];
  };
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function isAllowedUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default function LithuaniaHitlViewerPage({ searchParams }: ViewerPageProps) {
  const noVncUrl = firstParam(searchParams?.src);
  const sessionId = firstParam(searchParams?.sessionId);
  const hasValidViewer = isAllowedUrl(noVncUrl);

  return (
    <div className="min-h-dvh bg-background px-4 py-6 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href="/lithuania-hitl-auto-test"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to Lithuania HITL test
        </Link>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-balance">Lithuania verification viewer</CardTitle>
                <CardDescription className="text-pretty">
                  Complete captcha and verification directly inside the portal-style noVNC panel, then return to the test page to run collect/GEN/AD2.
                </CardDescription>
              </div>
              <Button asChild variant="outline" disabled={!hasValidViewer}>
                <a href={hasValidViewer ? noVncUrl : "#"} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon className="mr-2 size-4" />
                  Open in new tab
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground md:grid-cols-2">
              <p>
                Session: <span className="font-mono text-xs tabular-nums">{sessionId || "not provided"}</span>
              </p>
              <p className="truncate">
                Viewer URL: <span className="font-mono text-xs">{hasValidViewer ? noVncUrl : "missing or invalid"}</span>
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card">
              {hasValidViewer ? (
                <iframe
                  src={noVncUrl}
                  title="Lithuania noVNC viewer"
                  className="h-[78dvh] w-full border-0"
                  allow="clipboard-read; clipboard-write"
                />
              ) : (
                <div className="flex min-h-[52dvh] items-center justify-center px-6 py-10 text-center">
                  <div className="max-w-md space-y-3">
                    <MonitorIcon className="mx-auto size-8 text-muted-foreground" />
                    <p className="font-medium text-foreground">Viewer is not ready</p>
                    <p className="text-sm text-muted-foreground text-pretty">
                      Start a session from the Lithuania HITL page first. The viewer opens automatically with a valid noVNC URL.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
