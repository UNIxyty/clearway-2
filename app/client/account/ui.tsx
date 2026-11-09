"use client";

// The client's Account page (2026-11-09). The password change asks for the current password and the server checks it
// (app/api/client/account/password); the page says what happened only once the server has answered.
import { useState, type FormEvent } from "react";
import MaskIcon from "@/components/portal/Icon";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Done = { noticeSent: boolean };

export default function ClientAccount({ email, name, company, contact }: { email: string; name: string; company: string; contact: string }) {
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<{ text: string; field?: string } | null>(null); const [done, setDone] = useState<Done | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function change(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null); setDone(null);
    if (!current) { setError({ text: "Enter your current password.", field: "current" }); return; }
    if (next.length < 10) { setError({ text: "The new password needs at least 10 characters.", field: "next" }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/client/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current, next }) });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; field?: string; noticeSent?: boolean };
      if (!r.ok || !d.ok) { setError({ text: d.error || "The password was not changed. Try again in a few minutes.", field: d.field }); return; }
      // the change ended every session of the account, this one too: sign this device in again with the new password.
      // If that does not work, the password is still changed: the sign-in page is the honest place to be.
      const again = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password: next });
      if (again.error) { window.location.href = "/login"; return; }
      setCurrent(""); setNext(""); setShow(false); setDone({ noticeSent: Boolean(d.noticeSent) });
    } catch { setError({ text: "The password was not changed: no connection. Check the network and try again." }); }
    finally { setBusy(false); }
  }
  async function signOut() { setLeaving(true); try { await createSupabaseBrowserClient().auth.signOut(); } finally { window.location.href = "/login"; } }

  const type = show ? "text" : "password";
  return (
    <main className="clw-tab" data-tab="account">
      <h2 className="clw-h">Account</h2>
      <section className="clw-card" data-card="you">
        <div className="clw-card-head"><MaskIcon name="circle-user" size={16} /><span>Signed in as</span></div>
        <dl className="clw-facts">
          {name && <div><dt>Name</dt><dd>{name}</dd></div>}
          <div><dt>Email</dt><dd data-account-email="">{email}</dd></div>
          {company && <div><dt>Company</dt><dd>{company}</dd></div>}
        </dl>
      </section>

      <section className="clw-card" data-card="password">
        <div className="clw-card-head"><MaskIcon name="key-round" size={16} /><span>Password</span></div>
        <form className="clw-form" onSubmit={change} noValidate>
          <label className="clw-field"><span>Current password</span>
            <input className="clw-input" type={type} name="current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={error?.field === "current" || undefined} /></label>
          <label className="clw-field"><span>New password</span>
            <input className="clw-input" type={type} name="next" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={error?.field === "next" || undefined} aria-describedby="clw-pw-hint" />
            <small id="clw-pw-hint" className="clw-muted">At least 10 characters.</small></label>
          <div className="clw-form-row">
            <button type="submit" className="cl-btn primary" disabled={busy} data-change-password="">{busy ? "Changing…" : "Change password"}</button>
            <button type="button" className="cl-btn" onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? "Hide passwords" : "Show passwords"}</button>
          </div>
          <div role="status" aria-live="polite" className="clw-form-status">
            {error && <p className="clw-form-error" data-password-error="">{error.text}</p>}
            {done && <p className="clw-form-ok" data-password-changed=""><MaskIcon name="check" size={15} />Password changed. Your other devices are signed out.{done.noticeSent ? ` A note went to ${email}.` : ""}</p>}
          </div>
        </form>
      </section>

      {contact && (
        <section className="clw-card" data-card="help">
          <div className="clw-card-head"><MaskIcon name="mail" size={16} /><span>Help</span></div>
          <p className="clw-card-text" data-client-contact="">Questions about a flight, or about what you can see here: write to <a href={`mailto:${contact}`}>{contact}</a>.</p>
        </section>
      )}

      <div className="clw-form-row"><button type="button" className="cl-btn" onClick={signOut} disabled={leaving} data-signout=""><MaskIcon name="log-out" size={16} />{leaving ? "Signing out…" : "Sign out"}</button></div>
    </main>
  );
}
