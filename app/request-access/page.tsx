"use client";

// Ask for access (Stage 5, design: Sign In › request). For operators and brokers whose flights Clearway handles.
// Everyone signs in with email and password — there is no sign-in by trip, flight number or reference, which identify a
// flight, not a person. The request carries a company name; ops set the scope when they approve. No password here: the
// email link sets it, and confirming the email sends the request to ops. No promise of a time.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Mail, User } from "lucide-react";
import AuthBackdrop from "@/app/auth/ui/AuthBackdrop";
import { AuthAlert, AuthButton, AuthCard, AuthField, AuthHeading, AuthLink, authMuted } from "@/app/auth/ui/auth-kit";

export default function RequestAccessPage() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<"operator" | "broker">("operator");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const ready = useMemo(() => name.trim() && company.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [name, company, email]);

  const send = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/email/request-confirmation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "client", name: name.trim(), company: company.trim(), email: email.trim(), clientKind: kind, note: note.trim(), next: "/client" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "The request could not be sent. Try again in a few minutes.");
      setSentTo(email.trim());
    } catch (e) { setError(e instanceof Error ? e.message : "Nothing was sent. Check your connection and try again."); } // public-error-ok: the Error carries our own route's sentence (Company is required, Valid email is required), or our offline line
    finally { setLoading(false); }
  };

  const seg = (v: "operator" | "broker", label: string) => (
    <button type="button" role="radio" aria-checked={kind === v} onClick={() => setKind(v)} data-you-are={v}
      style={{ height: 36, borderRadius: 8, border: "none", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", background: kind === v ? "var(--cw-bg-surface)" : "transparent", color: kind === v ? "var(--cw-text)" : "var(--cw-text-muted)", boxShadow: kind === v ? "var(--cw-shadow-1)" : "none" }}>{label}</button>
  );

  return (
    <AuthBackdrop>
      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 16 }} data-request-access>
        <AuthCard>
          {sentTo ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-request-sent>
              <AuthHeading title="Check your email" sub="Open the link we sent to set your password. That sends your request to Clearway ops." />
              <div style={{ border: "1px solid var(--cw-border)", borderRadius: 12, background: "var(--cw-bg-surface)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <Mail size={17} style={{ color: "var(--cw-text-muted)" }} /><span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500 }}>{sentTo}</span><span style={{ fontSize: 13, color: authMuted }}>Works for 24 h</span>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--cw-text-body)" }}>Nothing arrived? Check spam, or <AuthLink onClick={() => setSentTo(null)}>change the address</AuthLink>.</p>
            </div>
          ) : (
            <>
              <Link href="/login" className="cw-auth-link" style={{ alignSelf: "flex-start", fontSize: 14, fontWeight: 600, color: "var(--cw-text-body)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12 }}>← Sign in</Link>
              <AuthHeading title="Ask for access" sub="For operators and brokers whose flights Clearway handles. Clearway ops checks every request by hand." />
              {error && <AuthAlert>{error}</AuthAlert>}
              <AuthField id="ra-name" label="Full name" icon={User} placeholder="Jane Roberts" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              <AuthField id="ra-company" label="Company *" icon={Building2} placeholder="The one ops will recognise" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} />
              <AuthField id="ra-email" label="Work email" icon={Mail} type="email" placeholder="you@company.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <p style={{ margin: "-6px 0 10px", fontSize: 12.5, color: authMuted }}>We send the sign-in link here. Use your company address, not a personal one.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>You are</span>
                <div role="radiogroup" aria-label="You are" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: 3, borderRadius: 10, background: "var(--cw-bg-sunken)", border: "1px solid var(--cw-border)" }}>{seg("operator", "Operator")}{seg("broker", "Broker")}</div>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Anything we should know <span style={{ fontWeight: 400, color: authMuted }}>· optional</span></span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="Who at the operator can confirm you, or which flights you handle" data-note
                  style={{ minHeight: 64, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--cw-border-control)", background: "var(--cw-bg-surface)", color: "var(--cw-text)", font: "inherit", fontSize: 14.5, lineHeight: 1.5, resize: "vertical" }} />
              </label>
              <AuthButton loading={loading} loadingLabel="Sending…" disabled={!ready} onClick={send}>Send request</AuthButton>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: authMuted, margin: "14px 0 0" }}>You always sign in with your email and password. After you confirm your email, Clearway ops decides which flights you see and what you see of them.</p>
            </>
          )}
        </AuthCard>
      </div>
    </AuthBackdrop>
  );
}
