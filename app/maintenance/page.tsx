"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-10 flex items-center justify-center">
      <Card className="w-full max-w-2xl border-border/70">
        <CardHeader>
          <CardTitle className="text-xl">Portal currently under maintenance</CardTitle>
          <CardDescription>
            We are improving the service. Please check back soon.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {loading ? (
            <p className="text-muted-foreground">Loading maintenance details…</p>
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
                <p>
                  <span className="font-medium">Estimated time:</span> {data.eta_text}
                </p>
              )}
              {data?.updated_at && (
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date(data.updated_at).toLocaleString()}
                </p>
              )}
            </>
          )}
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
