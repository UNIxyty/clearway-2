"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Step = "email" | "code";

export default function LoginCard() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (otpErr) throw otpErr;
      setStep("code");
      setInfo("We sent a confirmation email. Enter the code if provided, or use the link in the email.");
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to send code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const token = code.trim();
      if (!token) throw new Error("Enter the confirmation code from the email.");
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "email",
      });
      if (verifyErr) throw verifyErr;
      window.location.href = next;
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to verify code.");
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
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (oauthErr) throw oauthErr;
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to start Google sign-in.");
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-lg border-border/70">
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to view AIP, GEN, and NOTAM data.</CardDescription>
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

        {step === "email" ? (
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
            <Button type="button" className="w-full" onClick={sendCode} disabled={loading || !email.trim()}>
              {loading ? "Sending…" : "Send confirmation code"}
            </Button>
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-xs text-muted-foreground">or</span>
              </div>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={signInGoogle} disabled={loading}>
              Continue with Google
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="code">Confirmation code</Label>
              <Input
                id="code"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
              />
            </div>
            <Button type="button" className="w-full" onClick={verifyCode} disabled={loading}>
              {loading ? "Verifying…" : "Verify and sign in"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("email");
                setCode("");
                setInfo(null);
                setError(null);
              }}
              disabled={loading}
            >
              Use a different email
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

