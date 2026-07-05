"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth-next-path.mjs";
import { AlertCircle, Eye, EyeOff, Lock, Mail } from "lucide-react";

// Visuals from the Claude Design "Sign In" handoff. The redirect-back
// mechanics (validated `next`, window.location.href after sign-in) are
// deliberately unchanged — see lib/auth-next-path.mjs.

const ink = "#17181c";
const mutedText = "#6c7079";
const faint = "#9aa0a8";
const inputBorder = "#d6d8dc";
const errBorder = "#e5484d";

function Field({
  id,
  label,
  icon,
  error,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  error: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 7, color: ink }}>
        {label}
      </label>
      <div
        className="cw-auth-in"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: `1px solid ${error ? errBorder : inputBorder}`,
          borderRadius: 11,
          padding: "0 13px",
          height: 47,
          background: error ? "#fffafa" : "#fff",
        }}
      >
        <span style={{ color: faint, display: "flex", flexShrink: 0 }}>{icon}</span>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  fontFamily: "inherit",
  fontSize: 14.5,
  background: "transparent",
  color: ink,
};

export default function LoginCard() {
  const searchParams = useSearchParams();
  // Only same-origin relative paths survive; anything else falls back to "/".
  const next = safeNextPath(searchParams.get("next"));
  const urlError = searchParams.get("error");
  const urlMessage = searchParams.get("message");

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
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
    <div
      style={{
        background: "#fff",
        borderRadius: 22,
        boxShadow: "0 30px 80px rgba(6,11,28,.45), 0 2px 6px rgba(0,0,0,.1)",
        padding: "34px 40px 26px",
        color: ink,
      }}
    >
      <h2 style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 6px" }}>Welcome back</h2>
      <p style={{ fontSize: 14.5, color: mutedText, margin: "0 0 22px", lineHeight: 1.5 }}>
        Sign in to view AIP, GEN, NOTAM and weather data.
      </p>

      {displayError && (
        <div
          className="cw-shake"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            background: "#fdf0f0",
            border: "1px solid #f4cdcd",
            borderRadius: 11,
            padding: "11px 13px",
            marginBottom: 16,
          }}
        >
          <AlertCircle size={17} style={{ color: errBorder, flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, lineHeight: 1.45, color: "#b3383c" }}>{displayError}</span>
        </div>
      )}
      {info && (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.45,
            color: mutedText,
            background: "#fbfbfc",
            border: "1px solid #e6e7ea",
            borderRadius: 11,
            padding: "11px 13px",
            marginBottom: 16,
          }}
        >
          {info}
        </div>
      )}

      {forgotEmailSentTo ? (
        <div
          style={{
            border: "1px solid #e6e7ea",
            background: "#fbfbfc",
            borderRadius: 14,
            padding: "24px 16px",
            textAlign: "center",
          }}
        >
          <Mail size={24} style={{ color: mutedText, margin: "0 auto 8px", display: "block" }} />
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Check your email</p>
          <p style={{ fontSize: 13, color: mutedText, margin: "6px 0 0", lineHeight: 1.5 }}>
            We sent a password reset link to {forgotEmailSentTo}.
          </p>
          <button
            type="button"
            className="cw-auth-link"
            style={{
              marginTop: 16,
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#2563eb",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 15, marginBottom: 18 }}>
            <Field id="email" label="Email" icon={<Mail size={17} />} error={Boolean(displayError)}>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                style={inputStyle}
              />
            </Field>

            <Field id="password" label="Password" icon={<Lock size={17} />} error={Boolean(displayError)}>
              <input
                id="password"
                type={showPw ? "text" : "password"}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                style={inputStyle}
              />
              <button
                type="button"
                aria-label={showPw ? "Hide password" : "Show password"}
                onClick={() => setShowPw((v) => !v)}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: faint, padding: 5, display: "flex" }}
              >
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </Field>
          </div>

          <button
            type="button"
            className="cw-auth-btn"
            onClick={signInWithPassword}
            disabled={loading || !email.trim() || !password}
            style={{
              width: "100%",
              fontFamily: "inherit",
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
              background: loading ? "#9db8f2" : "#2563eb",
              border: "none",
              borderRadius: 11,
              padding: 13,
              cursor: loading ? "default" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              opacity: !loading && (!email.trim() || !password) ? 0.75 : 1,
            }}
          >
            {loading && (
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,.5)",
                  borderTopColor: "#fff",
                  animation: "cwspin .7s linear infinite",
                }}
              />
            )}
            {loading ? "Signing in..." : "Sign in with email"}
          </button>

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="cw-auth-link"
              onClick={sendForgotPasswordEmail}
              disabled={loading || !email.trim()}
              style={{
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                color: "#2563eb",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: loading || !email.trim() ? "default" : "pointer",
                opacity: loading || !email.trim() ? 0.6 : 1,
              }}
            >
              Forgot password?
            </button>
          </div>
        </>
      )}
    </div>
  );
}
