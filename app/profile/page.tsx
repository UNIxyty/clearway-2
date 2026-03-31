"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BarChartIcon, ArrowLeftIcon, LogOutIcon, BellIcon, Mail } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailChangeSentTo, setEmailChangeSentTo] = useState<string | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailInfo, setEmailInfo] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [passwordResetEmailSentTo, setPasswordResetEmailSentTo] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordInfo, setPasswordInfo] = useState<string | null>(null);

  useEffect(() => {
    async function loadAccount() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      setEmail(user?.email ?? "");
      setUserId(user?.id ?? "");
      const pending =
        (user as unknown as { new_email?: string | null; email_change?: string | null })?.new_email ??
        (user as unknown as { new_email?: string | null; email_change?: string | null })?.email_change ??
        null;
      setPendingEmail(pending || null);
      if (!pending) {
        setEmailChangeSentTo(null);
      }
    }

    void loadAccount();

    fetch("/api/user/preferences")
      .then((res) => res.json())
      .then((data) => {
        if (data.preferences?.display_name) {
          setDisplayName(data.preferences.display_name);
        }
      })
      .catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadAccount();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const res = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function handleChangeEmail() {
    setEmailError(null);
    setEmailInfo(null);
    const targetEmail = newEmail.trim().toLowerCase();
    if (!targetEmail) {
      setEmailError("Enter a new email.");
      return;
    }
    if (targetEmail === email.trim().toLowerCase()) {
      setEmailError("New email must be different from current email.");
      return;
    }
    setEmailSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ email: targetEmail });
      if (updateError) throw updateError;
      setEmailInfo(
        "Confirmation sent. Open your new email inbox and confirm the change. If secure email change is enabled, you may also need to confirm from your current email inbox.",
      );
      setEmailChangeSentTo(targetEmail);
      setPendingEmail(targetEmail);
      setNewEmail("");
    } catch (e) {
      setEmailError((e as { message?: string })?.message || "Failed to start email change.");
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordInfo(null);
    if (!email.trim()) {
      setPasswordError("Current email is missing. Refresh and try again.");
      return;
    }
    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    setPasswordSaving(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: currentPassword,
      });
      if (signInError) {
        throw new Error("Current password is incorrect.");
      }

      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: boolean;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Failed to send verification email.");
      }

      setPasswordResetEmailSentTo(email.trim());
      setPasswordInfo(
        data.message ||
          "Verification email sent. Open your inbox and use the reset link to set a new password.",
      );
      setCurrentPassword("");
    } catch (e) {
      setPasswordError((e as { message?: string })?.message || "Failed to start password change.");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
          >
            <ArrowLeftIcon className="size-4 mr-1" />
            Back
          </Button>
        </div>

        <div>
          <div className="flex items-center gap-3">
            <img
              src="/PFP.png"
              alt="Profile picture"
              className="size-9 rounded-full object-cover border border-primary/20 bg-primary/10"
            />
            <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account settings and preferences
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            Profile updated successfully
          </div>
        )}

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Account Information</CardTitle>
            <CardDescription>Your authentication details (read-only)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} readOnly disabled className="bg-muted/50" />
            </div>
            {pendingEmail && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                Pending email change: {pendingEmail}. Confirm from your inbox(es) to finalize.
              </div>
            )}
            <div className="space-y-2">
              <Label>User ID</Label>
              <Input value={userId} readOnly disabled className="bg-muted/50 font-mono text-xs" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Display Name</CardTitle>
            <CardDescription>
              Optional name shown in the portal (instead of your email)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Change Email</CardTitle>
            <CardDescription>
              Update the email used to sign in. A confirmation email is sent to the new address.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {emailError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {emailError}
              </div>
            )}
            {emailInfo && (
              <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                {emailInfo}
              </div>
            )}
            {emailChangeSentTo || pendingEmail ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-5 text-center">
                <Mail className="mx-auto mb-2 size-6 text-muted-foreground" />
                <p className="text-sm text-foreground">Check your email</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent confirmation for {emailChangeSentTo || pendingEmail}.
                </p>
                <button
                  type="button"
                  className="mt-4 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  onClick={() => {
                    setEmailChangeSentTo(null);
                    setEmailInfo(null);
                  }}
                >
                  Change email again
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="newEmail">New email</Label>
                  <Input
                    id="newEmail"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <Button onClick={handleChangeEmail} disabled={emailSaving || !newEmail.trim()}>
                  {emailSaving ? "Sending confirmation…" : "Change email"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Change Password</CardTitle>
            <CardDescription>
              Verify your current password first. We then send a verification email with a secure reset link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {passwordError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {passwordError}
              </div>
            )}
            {passwordInfo && (
              <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                {passwordInfo}
              </div>
            )}
            {passwordResetEmailSentTo ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-5 text-center">
                <Mail className="mx-auto mb-2 size-6 text-muted-foreground" />
                <p className="text-sm text-foreground">Check your email</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent a password verification link to {passwordResetEmailSentTo}.
                </p>
                <button
                  type="button"
                  className="mt-4 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  onClick={() => {
                    setPasswordResetEmailSentTo(null);
                    setPasswordInfo(null);
                  }}
                >
                  Start again
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={passwordSaving || !currentPassword}
                >
                  {passwordSaving ? "Verifying…" : "Verify and send email"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push("/stats")}
            >
              <BarChartIcon className="size-4 mr-2" />
              Search Stats
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push("/settings/notifications")}
            >
              <BellIcon className="size-4 mr-2" />
              Notification Settings
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70 border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base">Sign Out</CardTitle>
            <CardDescription>End your current session</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={signOut}>
              <LogOutIcon className="size-4 mr-2" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
