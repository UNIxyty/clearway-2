"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  async function requestConfirmationEmail() {
    setError(null);
    setInfo(null);
    setConfirmationSentTo(null);
    setLoading(true);
    try {
      const normalizedEmail = email.trim();
      const res = await fetch("/api/auth/email/request-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: normalizedEmail, next: "/signup" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: boolean;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to send confirmation email.");

      if (data.sent === false) {
        setInfo(
          data.message ||
            "We could not send the email right now. Check the address and try again in a minute.",
        );
      } else {
        setConfirmationSentTo(normalizedEmail);
        setInfo(data.message || "Confirmation email sent.");
      }
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to send confirmation email.");
    } finally {
      setLoading(false);
    }
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
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Create account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email and we will send a confirmation link.
          </p>
        </div>

        <Card className="shadow-lg border-border/70">
          <CardHeader>
            <CardTitle>Account setup</CardTitle>
            <CardDescription>
              After confirming email, you will create your password.
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
            {confirmationSentTo ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-5 text-center">
                <Mail className="mx-auto mb-2 size-6 text-muted-foreground" />
                <p className="text-sm text-foreground">Check your email</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent a confirmation link to {confirmationSentTo}.
                </p>
                <button
                  type="button"
                  className="mt-4 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  onClick={() => {
                    setConfirmationSentTo(null);
                    setInfo(null);
                  }}
                >
                  Change details
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
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
                  onClick={requestConfirmationEmail}
                  disabled={loading || !name.trim() || !email.trim()}
                >
                  {loading ? "Sending..." : "Send confirmation email"}
                </Button>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
