"use client";

import { useState } from "react";
import { AlertCircle, Eye, EyeOff, type LucideIcon } from "lucide-react";

// Shared presentational pieces for the redesigned auth flow (design:
// Auth Flow.dc.html). Purely visual — every page keeps its own mechanics.
// Sits on AuthBackdrop; same card idiom as the shipped Sign In page.

export const authInk = "#17181c";
export const authMuted = "#6c7079";
export const authFaint = "#9aa0a8";

export function AuthLogos() {
  return (
    <div className="cw-auth-logos" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <img
        src="https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/header_logo_white.svg"
        alt="Clearway Handling & Operations"
        style={{ height: 44, display: "block" }}
      />
      <span style={{ width: 1, height: 30, background: "rgba(255,255,255,.28)" }} />
      <img
        src="https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/logo.png"
        alt="Verxyl"
        style={{ height: 21, display: "block", filter: "brightness(0) invert(1)" }}
      />
    </div>
  );
}

export function AuthCard({ shake = false, children }: { shake?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={shake ? "cw-shake" : undefined}
      style={{
        background: "#fff",
        borderRadius: 22,
        boxShadow: "0 30px 80px rgba(6,11,28,.45), 0 2px 6px rgba(0,0,0,.1)",
        padding: "34px 40px 28px",
        color: authInk,
      }}
    >
      {children}
    </div>
  );
}

export function AuthHeading({ title, sub, center = false }: { title: string; sub: string; center?: boolean }) {
  return (
    <>
      <h2 style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 6px", textAlign: center ? "center" : "left" }}>
        {title}
      </h2>
      <p style={{ fontSize: 14.5, color: authMuted, margin: "0 0 20px", lineHeight: 1.5, textAlign: center ? "center" : "left" }}>{sub}</p>
    </>
  );
}

export function AuthAlert({ tone = "error", children }: { tone?: "error" | "info"; children: React.ReactNode }) {
  if (tone === "info") {
    return (
      <div style={{ fontSize: 13, lineHeight: 1.45, color: authMuted, background: "#fbfbfc", border: "1px solid #e6e7ea", borderRadius: 11, padding: "11px 13px", marginBottom: 16 }}>
        {children}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#fdf0f0", border: "1px solid #f4cdcd", borderRadius: 11, padding: "11px 13px", marginBottom: 16 }}>
      <AlertCircle size={17} style={{ color: "#e5484d", flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13, lineHeight: 1.45, color: "#b3383c" }}>{children}</span>
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
  color: authInk,
};

export function AuthField({
  id,
  label,
  icon: FieldIcon,
  error = false,
  password = false,
  bottom,
  ...inputProps
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  error?: boolean;
  password?: boolean;
  bottom?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 15 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 7, color: authInk }}>
        {label}
      </label>
      <div
        className="cw-auth-in"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: `1px solid ${error ? "#e5484d" : "#d6d8dc"}`,
          borderRadius: 11,
          padding: "0 13px",
          height: 47,
          background: error ? "#fffafa" : "#fff",
        }}
      >
        <FieldIcon size={17} style={{ color: authFaint, flexShrink: 0 }} />
        <input id={id} style={inputStyle} {...inputProps} type={password ? (show ? "text" : "password") : inputProps.type || "text"} />
        {password && (
          <button
            type="button"
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((v) => !v)}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: authFaint, padding: 5, display: "flex" }}
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
      {bottom}
    </div>
  );
}

/** Live strength meter (design: 4 bars + label). */
export function PasswordStrength({ value }: { value: string }) {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  if (value.length === 0) score = 0;
  const paint = score >= 3 ? "#16a34a" : score === 2 ? "#d97706" : "#e5484d";
  const labels = ["Enter a password", "Weak — add length & a number", "Fair — add a capital or symbol", "Strong · 8+ chars, mixed case", "Very strong"];
  const labelColors = [authFaint, "#e5484d", "#d97706", "#15803d", "#15803d"];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < score ? paint : "#e6e7ea" }} />
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: labelColors[score] }}>{labels[score]}</div>
    </div>
  );
}

export function AuthButton({
  loading = false,
  loadingLabel,
  variant = "primary",
  children,
  style,
  disabled,
  ...rest
}: {
  loading?: boolean;
  loadingLabel?: string;
  variant?: "primary" | "secondary";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const primary = variant === "primary";
  return (
    <button
      type="button"
      className={primary ? "cw-auth-btn" : undefined}
      disabled={disabled || loading}
      style={{
        width: "100%",
        fontFamily: "inherit",
        fontSize: 15,
        fontWeight: primary ? 700 : 600,
        color: primary ? "#fff" : authInk,
        background: primary ? (loading ? "#9db8f2" : "#2563eb") : "#fff",
        border: primary ? "none" : "1px solid #d6d8dc",
        borderRadius: 11,
        padding: 13,
        cursor: loading || disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        opacity: disabled && !loading ? 0.75 : 1,
        ...style,
      }}
      {...rest}
    >
      {loading && (
        <span style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,.5)", borderTopColor: "#fff", animation: "cwspin .7s linear infinite" }} />
      )}
      {loading ? loadingLabel || children : children}
    </button>
  );
}

/** Centered message-card icon tile ("Confirm your email", "Password updated", …). */
export function MessageIcon({ icon: TileIcon, bg, color }: { icon: LucideIcon; bg: string; color: string }) {
  return (
    <div style={{ width: 56, height: 56, borderRadius: 16, background: bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
      <TileIcon size={28} style={{ color }} />
    </div>
  );
}

export function AuthLink({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="cw-auth-link"
      style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#2563eb", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
      {...rest}
    >
      {children}
    </button>
  );
}
