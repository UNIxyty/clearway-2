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
import { DevicePickerCard } from "./DevicePickerCard";

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
  const [corpUsername, setCorpUsername] = useState("");
  const [corpPassword, setCorpPassword] = useState("");
  const [credentialSetup, setCredentialSetup] = useState<{
    accountId: string;
    suggestedUsername: string;
  } | null>(null);
  const [newCorpUsername, setNewCorpUsername] = useState("");
  const [newCorpPassword, setNewCorpPassword] = useState("");
  const [confirmNewCorpPassword, setConfirmNewCorpPassword] = useState("");
  const [deviceSetup, setDeviceSetup] = useState<{
    accountId: string;
    profiles: { id: string; display_name: string | null }[];
    ipAddress: string;
    uaHash: string;
  } | null>(null);
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

  async function signInCorporate() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: corpUsername.trim(),
          password: corpPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Corporate login failed.");
      if (data?.needsCredentialSetup) {
        const suggestedUsername = String(data.accountUsername || corpUsername.trim() || "");
        setCredentialSetup({
          accountId: String(data.accountId || ""),
          suggestedUsername,
        });
        setNewCorpUsername(suggestedUsername);
        setNewCorpPassword("");
        setConfirmNewCorpPassword("");
        return;
      }
      if (data?.needsProfile) {
        setDeviceSetup({
          accountId: data.accountId,
          profiles: Array.isArray(data.profiles) ? data.profiles : [],
          ipAddress: data.fingerprint?.ipAddress || "unknown",
          uaHash: data.fingerprint?.uaHash || "unknown",
        });
        return;
      }
      window.location.href = next;
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Corporate login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function completeCredentialSetup() {
    if (!credentialSetup) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: credentialSetup.accountId,
          username: newCorpUsername.trim(),
          password: newCorpPassword,
          confirmPassword: confirmNewCorpPassword,
          temporaryPassword: corpPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to set new credentials.");
      setCredentialSetup(null);
      setCorpUsername(newCorpUsername.trim());
      setCorpPassword(newCorpPassword);
      setInfo("Credentials created. Sign in again with your new corporate credentials.");
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to set new credentials.");
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

        <div className="space-y-3">
          {!deviceSetup && !credentialSetup && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-sm font-medium">Corporate login</p>
              <div className="space-y-2">
                <Label htmlFor="corp-username">Username</Label>
                <Input
                  id="corp-username"
                  type="text"
                  value={corpUsername}
                  onChange={(e) => setCorpUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="admin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="corp-password">Password</Label>
                <Input
                  id="corp-password"
                  type="password"
                  value={corpPassword}
                  onChange={(e) => setCorpPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={signInCorporate}
                disabled={loading || !corpUsername.trim() || !corpPassword}
              >
                {loading ? "Signing in..." : "Sign in with corporate account"}
              </Button>
            </div>
          )}
          {credentialSetup && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-sm font-medium">Create permanent corporate credentials</p>
              <p className="text-xs text-muted-foreground">
                Temporary credentials were accepted. Set your permanent username and password.
              </p>
              <div className="space-y-2">
                <Label htmlFor="new-corp-username">New username</Label>
                <Input
                  id="new-corp-username"
                  type="text"
                  value={newCorpUsername}
                  onChange={(e) => setNewCorpUsername(e.target.value)}
                  autoComplete="username"
                  placeholder={credentialSetup.suggestedUsername || "ops-admin"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-corp-password">New password</Label>
                <Input
                  id="new-corp-password"
                  type="password"
                  value={newCorpPassword}
                  onChange={(e) => setNewCorpPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-corp-password">Confirm new password</Label>
                <Input
                  id="confirm-new-corp-password"
                  type="password"
                  value={confirmNewCorpPassword}
                  onChange={(e) => setConfirmNewCorpPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  className="flex-1"
                  onClick={completeCredentialSetup}
                  disabled={
                    loading ||
                    !newCorpUsername.trim() ||
                    !newCorpPassword ||
                    !confirmNewCorpPassword
                  }
                >
                  {loading ? "Saving..." : "Create credentials"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCredentialSetup(null)}
                  disabled={loading}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
          {deviceSetup && (
            <DevicePickerCard
              accountId={deviceSetup.accountId}
              profiles={deviceSetup.profiles}
              ipAddress={deviceSetup.ipAddress}
              uaHash={deviceSetup.uaHash}
              onComplete={() => {
                window.location.href = next;
              }}
              onBack={() => setDeviceSetup(null)}
            />
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
          <Button
            type="button"
            className="w-full"
            onClick={sendMagicLink}
            disabled={loading || !!deviceSetup || !!credentialSetup || !email.trim()}
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
            className="w-full gap-2"
            onClick={signInGoogle}
            disabled={loading || !!deviceSetup || !!credentialSetup}
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

