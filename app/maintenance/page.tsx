"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WrenchIcon, ShieldCheckIcon, RefreshCwIcon } from "lucide-react";

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
    <div className="relative min-h-screen overflow-hidden bg-background p-4 sm:p-6 lg:p-10 flex items-center justify-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.14),transparent_40%),radial-gradient(circle_at_80%_20%,hsl(var(--accent)/0.12),transparent_40%),radial-gradient(circle_at_50%_80%,hsl(var(--muted-foreground)/0.08),transparent_50%)]" />
      <Card className="relative w-full max-w-2xl border-border/70 bg-card/95 backdrop-blur-sm shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <img
              src="/header_logo_white.svg"
              alt="Clearway"
              className="h-8 sm:h-10 w-auto object-contain opacity-90"
              style={{ filter: "invert(1)" }}
            />
            <img
              src="/logo.png"
              alt="Verxyl"
              className="h-8 sm:h-10 w-auto object-contain opacity-90"
            />
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            <WrenchIcon className="size-3.5" />
            Scheduled maintenance in progress
          </div>
          <CardTitle className="text-xl sm:text-2xl">Portal currently under maintenance</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            We are improving reliability and performance. Thank you for your patience.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border border-border/60 bg-background/70 p-4">
            {loading ? (
              <p className="text-muted-foreground">Loading maintenance details...</p>
            ) : (
              <>
                {data?.message ? (
                  <p>{data.message}</p>
                ) : (
                  <p className="text-muted-foreground">
                    Maintenance is currently active for the portal.
                  </p>
                )}
                {data?.eta_text && (
                  <p className="mt-3">
                    <span className="font-medium">Estimated time:</span> {data.eta_text}
                  </p>
                )}
                {data?.updated_at && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Last updated: {new Date(data.updated_at).toLocaleString()}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 text-primary" />
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
        </CardContent>
      </Card>
    </div>
  );
}
