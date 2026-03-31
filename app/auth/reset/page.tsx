"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [readyForPassword, setReadyForPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initializeRecovery() {
      try {
        const currentUrl = new URL(window.location.href);
        const code = currentUrl.searchParams.get("code");
        const tokenHash = currentUrl.searchParams.get("token_hash") ?? currentUrl.searchParams.get("token");
        const tokenType = (currentUrl.searchParams.get("type") || "").toLowerCase();

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (tokenHash) {
          const verifyType =
            (tokenType as "recovery" | "signup" | "invite" | "email_change" | "email" | "") || "recovery";
          await supabase.auth.verifyOtp({ token_hash: tokenHash, type: verifyType });
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!mounted) return;
        if (user?.id) {
          setReadyForPassword(true);
          setInfo("Email verified. You can now set a new password.");
        } else {
          setInfo("To continue, open the latest reset email and click the reset link.");
        }
      } catch {
        if (!mounted) return;
        setError("Reset link is invalid or expired. Request a new one.");
      } finally {
        if (mounted) setCheckingLink(false);
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReadyForPassword(true);
        setCheckingLink(false);
        setError(null);
        setInfo("Email verified. You can now set a new password.");
      }
    });

    void initializeRecovery();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function submitReset() {
    setError(null);
    setInfo(null);
    if (!readyForPassword) {
      setError("Reset link is not verified yet. Open the latest reset email and click the link.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setInfo("Password updated. Redirecting to login...");
      window.setTimeout(() => {
        router.push("/login");
      }, 700);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Card className="shadow-lg border-border/70">
          <CardHeader>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>
              {readyForPassword
                ? "Set a new password for your account."
                : "Waiting for reset-link confirmation."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {info && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {info}
              </div>
            )}
            {checkingLink ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                Verifying reset link...
              </div>
            ) : readyForPassword ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={submitReset}
                  disabled={loading || !password || !confirmPassword}
                >
                  {loading ? "Saving..." : "Save new password"}
                </Button>
              </>
            ) : (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                To continue, click the reset link from your email. Password fields will appear after verification.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
