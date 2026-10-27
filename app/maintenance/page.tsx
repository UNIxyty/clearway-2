"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dayTimeZ } from "@/lib/time";
import { WrenchIcon, ShieldCheckIcon, RefreshCwIcon } from "lucide-react";
import { ClearwayLogo } from "@/components/portal/ClearwayLogo";

type MaintenancePayload = {
  enabled: boolean;
  message: string | null;
  eta_text: string | null;
  updated_at?: string | null;
};

export default function MaintenancePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MaintenancePayload | null>(null);

  useEffect(() => {
    fetch("/api/maintenance", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => setData(payload))
      .catch(() => setData({ enabled: true, message: null, eta_text: null }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-cw-bg-page p-4 sm:p-6 lg:p-10 flex items-center justify-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.14),transparent_40%),radial-gradient(circle_at_80%_20%,hsl(var(--accent)/0.12),transparent_40%),radial-gradient(circle_at_50%_80%,hsl(var(--muted-foreground)/0.08),transparent_50%)]" />
      <Card className="relative w-full max-w-2xl border-cw-border/70 bg-cw-bg-surface/95 backdrop-blur-sm shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* The logos follow the theme (2026-10-28): the Clearway logo in currentColor (one file, the text colour), and
                Verxyl's dark and white files swapped by --cw-show-light / --cw-show-dark, as the shell's footer does. The
                white logo used to be inverted to black, so on the dark theme both logos were black on a dark card. */}
            <span className="text-cw-text"><ClearwayLogo height={40} className="h-8 sm:h-10" title="Clearway" /></span>
            <span className="inline-flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/verxyl-footer.png" srcSet="/brand/verxyl-footer.png 1x, /brand/verxyl-footer@2x.png 2x, /brand/verxyl-footer@3x.png 3x" alt="Verxyl" className="h-5 sm:h-6 w-auto" style={{ display: "var(--cw-show-light)" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/verxyl-footer-white.png" srcSet="/brand/verxyl-footer-white.png 1x, /brand/verxyl-footer-white@2x.png 2x, /brand/verxyl-footer-white@3x.png 3x" alt="Verxyl" className="h-5 sm:h-6 w-auto" style={{ display: "var(--cw-show-dark)" }} />
            </span>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cw-primary/30 bg-cw-primary/10 px-3 py-1 text-xs text-cw-text-link">
            <WrenchIcon className="size-3.5" />
            Scheduled maintenance in progress
          </div>
          <CardTitle className="text-xl sm:text-2xl">Portal currently under maintenance</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            We are improving reliability and performance. Thank you for your patience.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border border-cw-border/60 bg-cw-bg-page/70 p-4">
            {loading ? (
              <p className="text-cw-text-muted">Loading maintenance details...</p>
            ) : (
              <>
                {data?.message ? (
                  <p>{data.message}</p>
                ) : (
                  <p className="text-cw-text-muted">
                    Maintenance is currently active for the portal.
                  </p>
                )}
                {data?.eta_text && (
                  <p className="mt-3">
                    <span className="font-medium">Estimated time:</span> {data.eta_text}
                  </p>
                )}
                {data?.updated_at && (
                  <p className="mt-3 text-xs text-cw-text-muted">
                    Last updated: <span className="font-mono">{dayTimeZ(data.updated_at, { alwaysDate: true })}</span>
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-cw-text-muted">
            <ShieldCheckIcon className="size-3.5 text-cw-text-link" />
            Your account and data remain secure during maintenance windows.
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            <RefreshCwIcon className="size-4" />
            Try again
          </Button>
          {/* Portal foundations 1.2: sign-in stays open during maintenance; an admin or developer who signs in lands
              on the page that turns it off. */}
          <p className="text-xs text-cw-text-muted">
            Clearway admin?{" "}
            <a className="underline underline-offset-2 hover:text-cw-text" href="/login?next=%2Fadmin%2Fmaintenance">
              Sign in to turn maintenance off
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
