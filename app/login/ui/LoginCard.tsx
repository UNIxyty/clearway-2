"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed:
    "Google sign-in was denied or misconfigured. Check Supabase Redirect URLs and Google authorized redirect URI.",
  oauth_no_code: "Google did not return a sign-in code. Try again.",
  session_exchange_failed:
    "Session could not be created after Google sign-in. You may need to add this app’s URL to Supabase Redirect URLs.",
};

export default function LoginCard() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const urlError = searchParams.get("error");
  const urlMessage = searchParams.get("message");

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const redirectError = useMemo(() => {
    if (!urlError) return null;
    if (urlMessage) return urlMessage;
    return OAUTH_ERROR_MESSAGES[urlError] ?? `Sign-in failed (${urlError}).`;
  }, [urlError, urlMessage]);

  const displayError = error ?? redirectError;

  async function sendMagicLink() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            next,
          )}`,
        },
      });
      if (otpErr) throw otpErr;
      setInfo(
        "We sent you a sign-in link. Open your email and click the link to finish signing in.",
      );
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "";
      if (msg.includes("429") || /rate limit|too many requests/i.test(msg)) {
        setError(
          "Too many sign-in emails. Wait a few minutes or sign in with Google instead.",
        );
      } else {
        setError(msg || "Failed to send sign-in link.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function signInGoogle() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            next,
          )}`,
        },
      });
      if (oauthErr) throw oauthErr;
      // Supabase will redirect; keep loading until navigation.
    } catch (e: unknown) {
      setError(
        (e as { message?: string })?.message ||
          "Failed to start Google sign-in.",
      );
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-lg border-border/70">
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          Sign in to view AIP, GEN, and NOTAM data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {displayError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {displayError}
          </div>
        )}
        {info && (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            {info}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={sendMagicLink}
            disabled={loading || !email.trim()}
          >
            {loading ? "Sending…" : "Send sign-in link"}
          </Button>
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-xs text-muted-foreground">
                or
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={signInGoogle}
            disabled={loading}
          >
            Continue with Google
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

