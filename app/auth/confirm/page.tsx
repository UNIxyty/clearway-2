"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ConfirmEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const continuePath = useMemo(() => searchParams.get("continue") || "/", [searchParams]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validating, setValidating] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function validateToken() {
      if (!token) {
        setError("Missing confirmation token.");
        setValidating(false);
        return;
      }
      try {
        const res = await fetch(`/api/auth/email/confirm?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Token validation failed.");
        if (!cancelled) setInfo(`Email confirmed for ${String(data.email || "your account")}.`);
      } catch (e: unknown) {
        if (!cancelled) {
          setError((e as { message?: string })?.message || "Token validation failed.");
        }
      } finally {
        if (!cancelled) setValidating(false);
      }
    }
    void validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function setPasswordAndContinue() {
    setError(null);
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
      const res = await fetch("/api/auth/email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to set password.");
      router.push(`/login?next=${encodeURIComponent(continuePath)}`);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to set password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Card className="shadow-lg border-border/70">
          <CardHeader>
            <CardTitle>Confirm your email</CardTitle>
            <CardDescription>Create your password to activate this account.</CardDescription>
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

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={validating || loading || !!error}
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
                disabled={validating || loading || !!error}
              />
            </div>

            <Button
              type="button"
              className="w-full"
              onClick={setPasswordAndContinue}
              disabled={validating || loading || !!error || !password || !confirmPassword}
            >
              {loading ? "Saving..." : "Create password"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
