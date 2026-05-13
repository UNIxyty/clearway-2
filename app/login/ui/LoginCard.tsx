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
import { Mail } from "lucide-react";

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
  const [forgotEmailSentTo, setForgotEmailSentTo] = useState<string | null>(null);

  const redirectError = useMemo(() => {
    if (!urlError) return null;
    return urlMessage || `Sign-in failed (${urlError}).`;
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

  async function sendForgotPasswordEmail() {
    setError(null);
    setInfo(null);
    setForgotEmailSentTo(null);
    setLoading(true);
    try {
      const normalizedEmail = email.trim();
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: boolean;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to send reset email.");
      if (data.sent === false) {
        setInfo(
          data.message ||
            "Reset email could not be sent right now. Please retry in a minute and verify your Supabase email provider configuration.",
        );
      } else {
        setForgotEmailSentTo(normalizedEmail);
        setInfo(data.message || "Password reset email sent.");
      }
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to send reset email.");
    } finally {
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
        {forgotEmailSentTo ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-5 text-center">
            <Mail className="mx-auto mb-2 size-6 text-muted-foreground" />
            <p className="text-sm text-foreground">Check your email</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a password reset link to {forgotEmailSentTo}.
            </p>
            <button
              type="button"
              className="mt-4 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => {
                setForgotEmailSentTo(null);
                setInfo(null);
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
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
                onClick={sendForgotPasswordEmail}
                disabled={loading || !email.trim()}
              >
                Forgot password?
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
