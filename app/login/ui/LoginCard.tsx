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
    "Session could not be created after Google sign-in. You may need to add this app URL to Supabase Redirect URLs.",
};

export default function LoginCard() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const urlError = searchParams.get("error");
  const urlMessage = searchParams.get("message");

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const redirectError = useMemo(() => {
    if (!urlError) return null;
    if (urlMessage) return urlMessage;
    return OAUTH_ERROR_MESSAGES[urlError] ?? `Sign-in failed (${urlError}).`;
  }, [urlError, urlMessage]);

  const displayError = error ?? redirectError;

  async function signInWithPassword() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInErr) throw signInErr;
      window.location.href = next;
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function requestConfirmationEmail() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email/request-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send confirmation email.");
      setInfo("Confirmation email sent. Open your inbox and follow the link to create your password.");
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to send confirmation email.");
    } finally {
      setLoading(false);
    }
  }

  async function sendForgotPasswordEmail() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send reset email.");
      setInfo("Password reset email sent. Use the link in your inbox to set a new password.");
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to send reset email.");
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
          Sign in to view AIP, GEN, NOTAM, and weather data.
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

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={signInWithPassword}
          disabled={loading || !email.trim() || !password}
        >
          {loading ? "Signing in..." : "Sign in with email"}
        </Button>

        <div className="flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={requestConfirmationEmail}
            disabled={loading || !email.trim()}
          >
            New account? Confirm email
          </button>
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={sendForgotPasswordEmail}
            disabled={loading || !email.trim()}
          >
            Forgot password?
          </button>
        </div>

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
          className="w-full gap-2"
          onClick={signInGoogle}
          disabled={loading}
        >
          <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </Button>
      </CardContent>
    </Card>
  );
}
