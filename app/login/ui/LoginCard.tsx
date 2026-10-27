"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth-next-path.mjs";
import { AlertCircle, Eye, EyeOff, MailCheck } from "lucide-react";
import { OFFLINE, TRY_AGAIN_SIGNED_OUT, apiErrorText, authErrorText } from "@/lib/error-text";

// What the page says for each `?error=` code (set by app/auth/callback and app/auth/reset). Only these sentences are
// shown; text in the URL is never put on the page.
const REDIRECT_ERRORS: Record<string, string> = {
  missing_supabase: `Sign-in is not available right now. ${TRY_AGAIN_SIGNED_OUT}`,
  oauth_cancelled: "Sign-in was cancelled. Sign in again below.",
  oauth_failed: `Sign-in with your account provider did not finish. ${TRY_AGAIN_SIGNED_OUT}`,
  oauth_no_code: "This sign-in link is not complete. Open the link from your email again, or sign in below.",
  session_exchange_failed: "This link has expired or was already used. Request a new one, or sign in below.",
  reset_link_required: "Open the latest password reset email and click the reset link.",
};
const REDIRECT_ERROR_OTHER = "Sign-in did not finish. Sign in again below.";

// Sign In v2 (2026-10-28): the design's form — work email, password with "Forgot password?" beside its label, one
// Sign in button, and the way in for operators and brokers. The mechanics are unchanged: the validated `next`
// (lib/auth-next-path.mjs), window.location.href after sign-in, the reset email to the address typed. It is a real
// <form> now, so Enter signs in.

const label: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: "var(--cw-text)" };
const box = (bad: boolean): React.CSSProperties => ({
  height: 44, padding: "0 6px 0 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8,
  border: `1px solid ${bad ? "var(--cw-danger)" : "var(--cw-border-control)"}`,
  boxShadow: bad ? "0 0 0 3px var(--cw-danger-tint)" : "none", background: "var(--cw-bg-surface)",
});
const input: React.CSSProperties = { flex: 1, minWidth: 0, height: "100%", border: "none", outline: "none", fontFamily: "inherit", fontSize: 15, background: "transparent", color: "var(--cw-text)" };

export default function LoginCard() {
  const searchParams = useSearchParams();
  // Only same-origin relative paths survive; anything else falls back to "/".
  const next = safeNextPath(searchParams.get("next"));
  const urlError = searchParams.get("error");

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
    return REDIRECT_ERRORS[urlError] ?? REDIRECT_ERROR_OTHER;
  }, [urlError]);

  const displayError = error ?? redirectError;

  async function signInWithPassword(e?: React.FormEvent) {
    e?.preventDefault();
    if (loading) return;
    if (!email.trim() || !password) { setError("Type your work email and password."); return; }
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
    } catch (err: unknown) {
      setError(authErrorText(err, `Sign-in did not work. ${TRY_AGAIN_SIGNED_OUT}`));
      setLoading(false);
    }
  }

  async function sendForgotPasswordEmail() {
    if (loading) return;
    if (!email.trim()) { setError(null); setInfo("Type your work email above, then press Forgot password? again. We send the reset link there."); return; }
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
      if (!res.ok) {
        setError(apiErrorText(data, `The reset email could not be sent. ${TRY_AGAIN_SIGNED_OUT}`));
        return;
      }
      if (data.sent === false) {
        setInfo(data.message || `The reset email could not be sent right now. ${TRY_AGAIN_SIGNED_OUT}`);
      } else {
        setForgotEmailSentTo(normalizedEmail);
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setLoading(false);
    }
  }

  if (forgotEmailSentTo) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }} role="status">
        <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 650 }}>
          <MailCheck size={20} aria-hidden="true" style={{ color: "var(--cw-text-muted)" }} /> Check your email
        </span>
        <div style={{ border: "1px solid var(--cw-border)", borderRadius: 12, background: "var(--cw-bg-surface)", padding: "14px 16px", fontSize: 14, lineHeight: 1.55, color: "var(--cw-text-body)" }}>
          If there’s an account for <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", color: "var(--cw-text)", overflowWrap: "anywhere" }}>{forgotEmailSentTo}</span>, a reset link is on its way. Nothing arrived? Check spam, or ask again.
        </div>
        <button type="button" className="si-link" style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 14, cursor: "pointer" }} onClick={() => { setForgotEmailSentTo(null); setInfo(null); }}>
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <>
      {displayError && (
        <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "var(--cw-danger-tint)", border: "1px solid var(--cw-danger-border)", borderRadius: 12, padding: "12px 14px" }}>
          <AlertCircle size={17} aria-hidden="true" style={{ color: "var(--cw-danger)", flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--cw-danger-text)" }}>{displayError}</span>
        </div>
      )}
      {info && (
        <div role="status" style={{ fontSize: 14, lineHeight: 1.5, color: "var(--cw-info-text)", background: "var(--cw-info-tint)", border: "1px solid var(--cw-info-border)", borderRadius: 12, padding: "12px 14px" }}>
          {info}
        </div>
      )}

      <form onSubmit={signInWithPassword} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={label}>Work email</span>
          <span className="si-in" style={box(Boolean(displayError))}>
            <input id="email" type="email" name="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" style={input} />
          </span>
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <label htmlFor="password" style={{ ...label, flex: 1 }}>Password</label>
            <button type="button" className="si-link" onClick={sendForgotPasswordEmail} disabled={loading} style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 13.5, cursor: loading ? "default" : "pointer" }}>
              Forgot password?
            </button>
          </span>
          <span className="si-in" style={box(Boolean(displayError))}>
            <input id="password" type={showPw ? "text" : "password"} name="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={input} />
            <button type="button" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)} style={{ width: 32, height: 32, borderRadius: 7, border: "none", background: "transparent", color: "var(--cw-text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </div>
        <button type="submit" className="si-btn" disabled={loading} style={{ height: 46, marginTop: 4, borderRadius: 10, border: "none", background: loading ? "var(--cw-primary-hover)" : "var(--cw-primary)", color: "var(--cw-text-on-primary)", fontFamily: "inherit", fontSize: 15, fontWeight: 650, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: loading ? "default" : "pointer" }}>
          {loading && <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid color-mix(in srgb, var(--cw-text-on-primary) 45%, transparent)", borderTopColor: "var(--cw-text-on-primary)", animation: "sispin .7s linear infinite" }} />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {/* Client access (Stage 5): operators and brokers have their own way in. Everyone signs in with email and password;
          the request carries a company name only. Clearway staff have accounts made by an admin. */}
      <p data-client-ask style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--cw-text-muted)", textAlign: "center" }}>
        Operator or broker without an account? <a href="/request-access" className="si-link">Ask for access</a>
      </p>
      <p style={{ margin: "-8px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--cw-text-muted)", textAlign: "center" }}>
        Clearway staff: your account is set up by an admin.
      </p>
    </>
  );
}
