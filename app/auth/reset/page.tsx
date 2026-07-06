"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Lock, ShieldCheck } from "lucide-react";
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
} from "@/app/auth/ui/auth-kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Visuals from Auth Flow.dc.html ("Reset" + "Password updated" screens).
// The Supabase recovery mechanics (code / token_hash / hash-fragment session
// recovery, PASSWORD_RECOVERY listener) are unchanged.

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [readyForPassword, setReadyForPassword] = useState(false);
  const [updated, setUpdated] = useState(false);
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
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const hashType = (hashParams.get("type") || "").toLowerCase();
        const hasRecoveryInHash = Boolean(accessToken && refreshToken && hashType === "recovery");
        const hasRecoveryInQuery = Boolean(code || tokenHash);

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (tokenHash) {
          const verifyType =
            (tokenType as "recovery" | "signup" | "invite" | "email_change" | "email" | "") || "recovery";
          await supabase.auth.verifyOtp({ token_hash: tokenHash, type: verifyType });
        } else if (hasRecoveryInHash) {
          await supabase.auth.setSession({
            access_token: accessToken as string,
            refresh_token: refreshToken as string,
          });
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!mounted) return;
        if (user?.id) {
          setReadyForPassword(true);
          setInfo("Email verified. You can now set a new password.");
        } else {
          if (!hasRecoveryInQuery && !hasRecoveryInHash) {
            router.replace(
              "/login?error=reset_link_required&message=" +
                encodeURIComponent("Open the latest password reset email and click the reset link."),
            );
            return;
          }
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
      setUpdated(true);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  const match = confirmPassword.length > 0 && password === confirmPassword;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <AuthBackdrop>
      <div className="cw-fadeup" style={{ width: 452, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <AuthLogos />
        <AuthCard shake={Boolean(error)}>
          {updated ? (
            <div style={{ textAlign: "center" }}>
              <MessageIcon icon={ShieldCheck} bg="#e4f6ee" color="#0e9f6e" />
              <AuthHeading
                center
                title="Password updated"
                sub="Your password has been changed. Use it next time you sign in to the Clearway suite."
              />
              <AuthButton onClick={() => router.push("/")}>
                Continue to the portal <ArrowRight size={16} />
              </AuthButton>
            </div>
          ) : (
            <>
              <MessageIcon icon={ShieldCheck} bg="#ede9fe" color="#6d28d9" />
              <AuthHeading
                title="Set a new password"
                sub={readyForPassword ? "Choose a new password to finish resetting your account." : "Waiting for reset-link confirmation."}
              />
              {error && <AuthAlert>{error}</AuthAlert>}
              {info && <AuthAlert tone="info">{info}</AuthAlert>}
              {checkingLink ? (
                <AuthAlert tone="info">Verifying reset link…</AuthAlert>
              ) : readyForPassword ? (
                <>
                  <AuthField
                    id="password"
                    label="New password"
                    icon={Lock}
                    password
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    bottom={<PasswordStrength value={password} />}
                  />
                  <AuthField
                    id="confirm-password"
                    label="Confirm new password"
                    icon={Lock}
                    password
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    value={confirmPassword}
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
                    loadingLabel="Updating…"
                    disabled={!password || !confirmPassword}
                    onClick={submitReset}
                    style={{ marginTop: 4 }}
                  >
                    Update password
                  </AuthButton>
                </>
              ) : !info ? (
                <AuthAlert tone="info">
                  To continue, click the reset link from your email. Password fields will appear after verification.
                </AuthAlert>
              ) : null}
            </>
          )}
        </AuthCard>
      </div>
    </AuthBackdrop>
  );
}
