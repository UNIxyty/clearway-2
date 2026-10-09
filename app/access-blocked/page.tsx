"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AccessBlockedPage() {
  const [from, setFrom] = useState("/");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFrom(params.get("from") || "/");
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Card className="shadow-lg border-border/70">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <ShieldAlert className="size-8 text-amber-500" />
            </div>
            <CardTitle>Access restricted</CardTitle>
            <CardDescription>
              This is a temporary guest account. Pick&apos;em, the area it was made for, has been retired, so there is
              nothing it can open. Ask a Clearway admin for a full account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground break-all">
              Blocked path: <span className="font-semibold text-foreground">{from}</span>
            </p>
            <Button type="button" variant="outline" className="w-full" onClick={signOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
