"use client";

import { useEffect, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

export default function PendingApprovalPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        // Session gone — account was declined/deleted
        window.location.href = "/login";
        return;
      }
      if (data.session.user?.user_metadata?.is_approved === true) {
        const role = String(data.session.user?.user_metadata?.role || "").toLowerCase();
        const isTemporary =
          role === "temporary" ||
          data.session.user?.user_metadata?.is_temporary === true ||
          (Array.isArray(data.session.user?.user_metadata?.roles) &&
            (data.session.user?.user_metadata?.roles as unknown[]).some(
              (value) => String(value).toLowerCase() === "temporary",
            ));
        window.location.href = isTemporary ? "/pickem" : "/";
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <img
              src="https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/header_logo_white.svg"
              alt="Clearway"
              className="h-8 w-auto"
              style={{ filter: "invert(1)" }}
            />
            <div className="h-6 w-px bg-border/70" />
            <img
              src="https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/logo.png"
              alt="Verxyl"
              className="h-7 w-auto opacity-90"
            />
          </div>
        </div>

        <Card className="shadow-lg border-border/70">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <Clock className="size-8 text-muted-foreground" />
            </div>
            <CardTitle>Account pending approval</CardTitle>
            <CardDescription>
              Your account has been created and is waiting for approval by an administrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              You will receive access once an admin confirms your account. This usually happens within a short time.
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
