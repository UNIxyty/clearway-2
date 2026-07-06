"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mail, MailCheck, User } from "lucide-react";
import AuthBackdrop from "@/app/auth/ui/AuthBackdrop";
import {
  AuthAlert,
  AuthButton,
  AuthCard,
  AuthField,
  AuthHeading,
  AuthLink,
  AuthLogos,
  MessageIcon,
  authMuted,
} from "@/app/auth/ui/auth-kit";
import { safeNextPath } from "@/lib/auth-next-path.mjs";

// Visuals from Auth Flow.dc.html ("Sign Up" + its success message screen).
// Mechanics unchanged: signup collects name + work email only; the password
// is created on /auth/confirm after the emailed link is opened (the design's
// password-at-signup variant doesn't fit the confirmation-first flow, so the
// password screens live on /auth/confirm and /auth/reset instead). `next`
// rides along the whole chain so a deep-link signup returns to it.

export default function SignupPage() {
  const [nextPath, setNextPath] = useState("/signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextParam = safeNextPath(params.get("next"), "");
    if (nextParam) {
      setNextPath(nextParam);
    }
  }, []);

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
        body: JSON.stringify({ name: name.trim(), email: normalizedEmail, next: nextPath }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sent?: boolean;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to send confirmation email.");

      if (!res.ok || data.sent === false || !data.ok) {
        setError(
          data.message || data.error ||
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

  const loginHref = nextPath !== "/signup" ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";

  return (
    <AuthBackdrop>
      <div className="cw-fadeup" style={{ width: 452, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <AuthLogos />

        <AuthCard shake={Boolean(error)}>
          {confirmationSentTo ? (
            <div style={{ textAlign: "center" }}>
              <MessageIcon icon={MailCheck} bg="#e8effe" color="#2563eb" />
              <AuthHeading
                center
                title="Confirm your email"
                sub={`We sent a verification link to ${confirmationSentTo}. Open it to finish setting up your account — it expires in 30 minutes.`}
              />
              {info && <AuthAlert tone="info">{info}</AuthAlert>}
              <AuthButton loading={loading} loadingLabel="Resending…" onClick={requestConfirmationEmail}>
                Resend link
              </AuthButton>
              <div style={{ textAlign: "center", fontSize: 12.5, color: authMuted, marginTop: 14 }}>
                Wrong address?{" "}
                <AuthLink
                  onClick={() => {
                    setConfirmationSentTo(null);
                    setInfo(null);
                  }}
                >
                  Change email
                </AuthLink>
              </div>
            </div>
          ) : (
            <>
              <AuthHeading title="Create account" sub="Request access to the Clearway suite." />
              {error && <AuthAlert>{error}</AuthAlert>}
              {info && <AuthAlert tone="info">{info}</AuthAlert>}
              <AuthField
                id="signup-name"
                label="Full name"
                icon={User}
                placeholder="Jane Roberts"
                autoComplete="name"
                value={name}
                error={Boolean(error)}
                onChange={(e) => setName(e.target.value)}
              />
              <AuthField
                id="signup-email"
                label="Work email"
                icon={Mail}
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                value={email}
                error={Boolean(error)}
                onChange={(e) => setEmail(e.target.value)}
              />
              <AuthButton
                loading={loading}
                loadingLabel="Sending…"
                disabled={!name.trim() || !email.trim()}
                onClick={requestConfirmationEmail}
                style={{ marginTop: 4 }}
              >
                Send confirmation email
              </AuthButton>
              <p style={{ textAlign: "center", fontSize: 13, color: authMuted, marginTop: 16, marginBottom: 0 }}>
                Already have an account?{" "}
                <Link href={loginHref} className="cw-auth-link" style={{ fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
                  Sign in
                </Link>
              </p>
            </>
          )}
        </AuthCard>

        <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.55)", lineHeight: 1.5, maxWidth: 400, margin: "0 auto" }}>
          By creating an account you agree to use this data for operational purposes only. Access requires admin
          approval — after confirming your email you&rsquo;ll create a password.
        </div>
      </div>
    </AuthBackdrop>
  );
}
