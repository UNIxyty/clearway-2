"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, KeyRound, Lock } from "lucide-react";
import AuthBackdrop from "@/app/auth/ui/AuthBackdrop";
import {
  AuthAlert,
  AuthButton,
  AuthCard,
  AuthField,
  AuthHeading,
  AuthLogos,
  MessageIcon,
  PasswordStrength,
  authFaint,
} from "@/app/auth/ui/auth-kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth-next-path.mjs";

// Visuals from Auth Flow.dc.html ("Set a new password" screen with the key
// icon, strength meter and match hint). Mechanics unchanged: the emailed
// token is validated, the password is set via /api/auth/email/confirm, then
// we sign in and continue to the (validated) deep link the signup started
// from.

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<ConfirmShell><AuthAlert tone="info">Preparing confirmation details…</AuthAlert></ConfirmShell>}>
      <ConfirmEmailContent />
    </Suspense>
  );
}

function ConfirmShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthBackdrop>
      <div className="cw-fadeup" style={{ width: 452, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <AuthLogos />
        <AuthCard>{children}</AuthCard>
      </div>
    </AuthBackdrop>
  );
}

function ConfirmEmailContent() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  // Same-origin relative paths only — the emailed link's continue target is
  // attacker-influencable input like any other.
  const continuePath = useMemo(() => safeNextPath(searchParams.get("continue")), [searchParams]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validating, setValidating] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState<string>("");

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
        if (!cancelled) {
          const email = String(data.email || "");
          setConfirmedEmail(email);
          setInfo(`Email confirmed for ${email || "your account"}.`);
        }
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
      const nextAfterLogin = continuePath === "/signup" ? "/" : continuePath;
      if (confirmedEmail) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: confirmedEmail,
          password,
        });
        if (!signInError) {
          router.push(nextAfterLogin);
          return;
        }
      }
      router.push(`/login?next=${encodeURIComponent(nextAfterLogin)}`);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to set password.");
    } finally {
      setLoading(false);
    }
  }

  const match = confirmPassword.length > 0 && password === confirmPassword;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <ConfirmShell>
      {validating ? (
        <AuthAlert tone="info">Validating your confirmation link…</AuthAlert>
      ) : error && !confirmedEmail ? (
        <div style={{ textAlign: "center" }}>
          <MessageIcon icon={AlertTriangle} bg="#fdecec" color="#e5484d" />
          <AuthHeading center title="Link problem" sub={error} />
          <AuthButton onClick={() => router.push("/signup")}>Back to sign up</AuthButton>
        </div>
      ) : (
        <>
          <MessageIcon icon={KeyRound} bg="#ede9fe" color="#6d28d9" />
          <AuthHeading title="Set your password" sub="Create a password to finish setting up your account." />
          {error && <AuthAlert>{error}</AuthAlert>}
          {info && <AuthAlert tone="info">{info}</AuthAlert>}
          <AuthField
            id="password"
            label="Password"
            icon={Lock}
            password
            placeholder="Minimum 8 characters"
            autoComplete="new-password"
            value={password}
            disabled={loading}
            onChange={(e) => setPassword(e.target.value)}
            bottom={<PasswordStrength value={password} />}
          />
          <AuthField
            id="confirm-password"
            label="Confirm password"
            icon={Lock}
            password
            placeholder="Repeat password"
            autoComplete="new-password"
            value={confirmPassword}
            disabled={loading}
            error={mismatch}
            onChange={(e) => setConfirmPassword(e.target.value)}
            bottom={
              match ? (
                <div style={{ fontSize: 11.5, color: "#15803d", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <Check size={13} />Passwords match
                </div>
              ) : mismatch ? (
                <div style={{ fontSize: 11.5, color: "#b45309", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={13} />Passwords don&rsquo;t match yet
                </div>
              ) : null
            }
          />
          <AuthButton
            loading={loading}
            loadingLabel="Saving…"
            disabled={!password || !confirmPassword}
            onClick={setPasswordAndContinue}
            style={{ marginTop: 4 }}
          >
            Set password &amp; continue
          </AuthButton>
          {continuePath !== "/" && (
            <div style={{ fontSize: 12, color: authFaint, marginTop: 12, textAlign: "center" }}>
              You&rsquo;ll continue to {continuePath}
            </div>
          )}
        </>
      )}
    </ConfirmShell>
  );
}
