"use client";

// The set-password link a client gets when ops approve them (2026-11-02, lib/clients/onboarding.ts). Setting the
// password is where their account is made. The link works once and expires; an expired or replaced link offers a new
// one, which goes to the address on the request. Never a dead end: every state says what happened and what to do.
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, Lock } from "lucide-react";
import AuthBackdrop from "@/app/auth/ui/AuthBackdrop";
import { AuthAlert, AuthButton, AuthCard, AuthField, AuthHeading, PasswordStrength } from "@/app/auth/ui/auth-kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type State = "loading" | "valid" | "used" | "expired" | "replaced" | "closed" | "unknown" | "error";
type Again = null | "sending" | "sent" | "not-sent" | "too-soon" | "used" | "closed" | "unknown";

function Welcome() {
  const params = useSearchParams();
  const token = useRef(params.get("token") ?? "");
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [again, setAgain] = useState<Again>(null); const [againTo, setAgainTo] = useState<string | null>(null);

  useEffect(() => {
    // the token is read once and taken out of the address bar (it opens an account until it is used)
    if (token.current) window.history.replaceState(null, "", "/welcome");
    if (!token.current) { setState("unknown"); return; }
    fetch(`/api/client-invite?token=${encodeURIComponent(token.current)}`, { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setState((d?.state as State) ?? "error"); setEmail(d?.email ?? null); setCompany(d?.company ?? null);
    }).catch(() => setState("error"));
  }, []);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (pw.length < 10) { setError("The password needs at least 10 characters."); return; }
    if (pw !== pw2) { setError("The two passwords are not the same."); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/client-invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: token.current, password: pw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setError(typeof d.error === "string" ? d.error : "That did not work. Try again in a minute."); return; } // public-error-ok: our own route's sentence
      setMade(d.email);
      const { error: signInError } = await createSupabaseBrowserClient().auth.signInWithPassword({ email: d.email, password: pw });
      // the one step after the password (2026-11-10): Timeline or Flights list, then their flights
      if (!signInError) { window.location.href = "/client/start"; return; }
    } catch { setError("Nothing was saved. Check your connection and try again."); }
    finally { setBusy(false); }
  };

  const askAgain = async () => {
    setAgain("sending");
    try {
      const r = await fetch("/api/client-invite/new-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: token.current }) });
      const d = await r.json().catch(() => ({}));
      setAgain((d?.state as Again) ?? "not-sent"); setAgainTo(d?.to ?? email);
    } catch { setAgain("not-sent"); }
  };

  const signIn = <AuthButton onClick={() => { window.location.href = "/login"; }}>Go to sign in</AuthButton>;
  let body: React.ReactNode;
  if (made) body = <><AuthHeading title="Your account is ready" sub={`Sign in with ${made} and the password you just chose.`} />{signIn}</>;
  else if (state === "loading") body = <AuthHeading title="Checking your link…" sub="One moment." />;
  else if (state === "valid") body = (
    <form onSubmit={submit} noValidate data-welcome-form>
      <AuthHeading title="Set your password" sub={`Access for ${company ?? "your company"} is approved. Choose a password to finish; you sign in with ${email ?? "your email"} and this password from now on.`} />
      {error && <AuthAlert>{error}</AuthAlert>}
      <AuthField id="w-pw" label="New password" icon={Lock} password value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" bottom={<PasswordStrength value={pw} />} />
      <AuthField id="w-pw2" label="The same password again" icon={KeyRound} password value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      <AuthButton type="submit" loading={busy} loadingLabel="Making your account…" onClick={() => void submit()}>Set password and sign in</AuthButton>
    </form>
  );
  else if (state === "used") body = <><AuthHeading title="This link was used already" sub="Your account is made. Sign in with your email and password; if you have forgotten the password, the sign-in page can send a reset link." />{signIn}</>;
  else if (state === "expired" || state === "replaced") body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-welcome-expired>
      <AuthHeading title={state === "expired" ? "This link has expired" : "A newer link was sent"} sub={state === "expired" ? "Links to set a password work for 72 hours. Ask for a new one: it goes to the address on your request." : "Only the latest link works. Use the newest email, or ask for another link here: it goes to the address on your request."} />
      {again === "sent" && <AuthAlert tone="info">A new link is on its way to {againTo}. It was accepted by the mail service; if it hasn’t arrived in a few minutes, check spam.</AuthAlert>}
      {again === "too-soon" && <AuthAlert tone="info">A link was sent to {againTo} a moment ago. Check that inbox first; you can ask again in two minutes.</AuthAlert>}
      {again === "not-sent" && <AuthAlert>The new link could not be sent just now. Try again in a minute.</AuthAlert>}
      {again === "used" && <AuthAlert tone="info">Your account is made already. Sign in with your email and password.</AuthAlert>}
      {again === "closed" && <AuthAlert>This access is no longer open, so no new link can be sent. Write to the ops team about it.</AuthAlert>}
      {again !== "sent" && again !== "used" && again !== "closed" && <AuthButton loading={again === "sending"} loadingLabel="Sending…" onClick={() => void askAgain()} data-new-link>Send me a new link</AuthButton>}
      {(again === "used") && signIn}
    </div>
  );
  else if (state === "closed") body = <><AuthHeading title="This invitation is no longer open" sub="Access for this request was refused or has ended, so the link does nothing. If you think that is a mistake, write to the ops team, or ask for access again from the sign-in page." />{signIn}</>;
  else if (state === "unknown") body = <><AuthHeading title="This is not a link we know" sub="It may be incomplete — open it from the email again, the whole address. To ask for access, use the sign-in page." />{signIn}</>;
  else body = <><AuthHeading title="The link could not be checked" sub="Something went wrong on our side. Open the link again in a minute." /></>;
  return (
    <AuthBackdrop>
      <div style={{ width: "100%", maxWidth: 480 }} data-welcome={made ? "made" : state}><AuthCard>{body}</AuthCard></div>
    </AuthBackdrop>
  );
}

export default function WelcomePage() {
  return <Suspense fallback={null}><Welcome /></Suspense>;
}
