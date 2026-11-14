"use client";

// The client's Account page (2026-11-09; the v3 look 2026-11-13: who is signed in, one card of choices — start page,
// appearance, display settings, password — the granted operators and aircraft, help (the sidebar's "Help & support" lands on it), sign out). The password form is
// closed until asked for; the change asks for the current password and the server checks it
// (app/api/client/account/password); the page says what happened only once the server has answered.
import { useEffect, useState, type FormEvent } from "react";
import MaskIcon from "@/components/portal/Icon";
import PartBoundary from "@/components/client/PartBoundary";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { readChoice, setChoice, type ThemeChoice } from "@/components/portal/theme";

type Done = { noticeSent: boolean };
type Start = "timeline" | "flights";
type Grant = { oprId: string; name: string; regs: { reg: string; type: string }[] };

/** The operators and aircraft granted, read from the wall's own scoped answer (the fleet the server sends IS the grant). */
function useGrants() {
  const [grants, setGrants] = useState<Grant[] | null | "failed">(null);   // null while reading; "failed" is said in words, never drawn as "none"
  useEffect(() => {
    const now = new Date(); const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)); const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4));
    fetch(`/digital-wall/api/timeline/flights?allOperators=true&refresh=false&from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("not read"); return r.json(); }).then((d) => {
      const map = new Map<string, Grant>();
      for (const g of (d?.aircraft ?? []) as { oprId?: string; operatorName?: string; registration?: string; acftTypeIcao?: string }[]) {
        const key = String(g.oprId ?? "").toLowerCase();
        if (!map.has(key)) map.set(key, { oprId: key, name: g.operatorName || key.toUpperCase(), regs: [] });
        if (g.registration) map.get(key)!.regs.push({ reg: g.registration, type: g.acftTypeIcao || "" });
      }
      setGrants([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => setGrants("failed"));
  }, []);
  return grants;
}

/** The granted operators and aircraft: its own part, so a list that cannot be drawn leaves the rest of the page working. */
function GrantsCard({ contact }: { contact: string }) {
  const grants = useGrants();
  return (
    <section className="clw-card" data-card="grants">
      <div className="clw-card-head"><b>Operators and aircraft you can see</b><span>Granted by Clearway ops.{contact ? <> To change it, write to <a href={`mailto:${contact}`} className="clw-addr">{contact}</a>.</> : null}</span></div>
      {grants === null && <p className="clw-card-line" data-grants-reading="">Reading…</p>}
      {grants === "failed" && <p className="clw-card-line" role="status" data-grants-failed="">The list could not be read. Reload the page to try again.</p>}
      {Array.isArray(grants) && grants.length === 0 && <p className="clw-card-line" data-grants-empty="">No operators or aircraft are on your account yet.</p>}
      {Array.isArray(grants) && grants.map((g) => <div key={g.oprId} className="clw-grant" data-grant={g.oprId}><span><b>{g.name}</b><small>{g.regs.length} aircraft</small></span><span className="clw-regs">{g.regs.map((r) => <span key={r.reg} className="clw-reg" title={r.type || undefined}>{r.reg}{r.type && <small>{r.type}</small>}</span>)}</span></div>)}
      <p className="clw-card-line">To hide some of them on your screen, use Operators &amp; aircraft on Timeline or Flights.</p>
    </section>
  );
}

export default function ClientAccount({ email, name, company, contact, start: start0 }: { email: string; name: string; company: string; contact: string; start: Start | null }) {
  const [start, setStart] = useState<Start>(start0 ?? "timeline");
  const [startNote, setStartNote] = useState("");
  const [choice, setTheme] = useState<ThemeChoice>("system");
  useEffect(() => setTheme(readChoice()), []);
  // "Help & support" in the sidebar opens this page at #help: bring the help card into view, on arriving and when the
  // hash changes while the page is open
  useEffect(() => {
    const show = () => { if (window.location.hash === "#help") document.getElementById("help")?.scrollIntoView({ block: "start" }); };
    const t = window.setTimeout(show, 0);
    window.addEventListener("hashchange", show);
    return () => { window.clearTimeout(t); window.removeEventListener("hashchange", show); };
  }, []);
  async function pickStart(k: Start) {
    const was = start; setStart(k); setStartNote("");
    const r = await fetch("/api/client/prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ start: k }) }).catch(() => null);
    if (!r || !r.ok) { setStart(was); setStartNote("The choice could not be saved. Try again."); } else setStartNote(`Saved. ${k === "flights" ? "Flights" : "Timeline"} opens after you sign in.`);
  }
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [repeat, setRepeat] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<{ text: string; field?: string } | null>(null); const [done, setDone] = useState<Done | null>(null);
  const [leaving, setLeaving] = useState(false);
  const closeForm = () => { if (busy) return; setOpen(false); setCurrent(""); setNext(""); setRepeat(""); setShow(false); setError(null); };

  async function change(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null); setDone(null);
    if (!current) { setError({ text: "Enter your current password.", field: "current" }); return; }
    if (next.length < 10) { setError({ text: "The new password needs at least 10 characters.", field: "next" }); return; }
    if (repeat !== next) { setError({ text: "The two new passwords are not the same. Type the new one again.", field: "repeat" }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/client/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current, next }) });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; field?: string; noticeSent?: boolean };
      if (!r.ok || !d.ok) { setError({ text: d.error || "The password was not changed. Try again in a few minutes.", field: d.field }); return; }
      // the change ended every session of the account, this one too: sign this device in again with the new password.
      // If that does not work, the password is still changed: the sign-in page is the honest place to be.
      const again = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password: next });
      if (again.error) { window.location.href = "/login"; return; }
      setCurrent(""); setNext(""); setRepeat(""); setShow(false); setOpen(false); setDone({ noticeSent: Boolean(d.noticeSent) });
    } catch { setError({ text: "The password was not changed: no connection. Check the network and try again." }); }
    finally { setBusy(false); }
  }
  async function signOut() { setLeaving(true); try { await createSupabaseBrowserClient().auth.signOut(); } finally { window.location.href = "/login"; } }

  const type = show ? "text" : "password";
  const initials = (name || company || email).split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <main className="clw-tab" data-tab="account">
      <h1 className="clw-h">Account</h1>
      <div className="clw-stack">
        <section className="clw-card clw-you" data-card="you">
          <span className="clw-avatar is-big" aria-hidden>{initials || "·"}</span>
          <span className="clw-you-text">
            <b>{name || company || "Signed in"}</b>
            <span className="clw-mono" data-account-email="">{email}</span>
            <small>{company ? `${company} · client access` : "Client access"}</small>
          </span>
        </section>

        <section className="clw-card" data-card="choices">
          <div data-card="start-page">
            <div className="clw-row">
              <span className="clw-row-text"><b>Start page</b><small>Opens after you sign in. Both stay in the sidebar.</small></span>
              <div className="clw-seg" role="radiogroup" aria-label="Start page">{(["timeline", "flights"] as Start[]).map((k) => <button type="button" key={k} role="radio" aria-checked={start === k} className={start === k ? "on" : ""} onClick={() => pickStart(k)} data-start-option={k}><MaskIcon name={k === "timeline" ? "chart-gantt" : "list"} size={16} />{k === "timeline" ? "Timeline" : "Flights list"}</button>)}</div>
            </div>
            {startNote && <p className={`clw-note${/^Saved/.test(startNote) ? "" : " is-bad"}`} role="status" data-start-note="">{startNote}</p>}
          </div>
          <div className="clw-row" data-card="appearance">
            <span className="clw-row-text"><b>Appearance</b><small>Light, dark or the same as this computer</small></span>
            <div className="clw-seg" role="radiogroup" aria-label="Appearance">{([["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "This computer", "monitor"]] as [ThemeChoice, string, string][]).map(([k, t, i]) => <button type="button" key={k} role="radio" aria-checked={choice === k} className={choice === k ? "on" : ""} onClick={() => { setTheme(k); setChoice(k); }} data-theme-option={k}><MaskIcon name={i} size={16} />{t}</button>)}</div>
          </div>
          <div className="clw-row" data-card="display">
            <span className="clw-row-text"><b>Display settings</b><small>Size, spacing, colours and the font of your timeline. Saved on your account, so your phone follows.</small></span>
            <a href="/client/settings" className="clw-btn" data-display-settings=""><MaskIcon name="sliders-horizontal" size={16} />Open settings</a>
          </div>
          <div data-card="password" data-password-form={open ? "open" : "closed"}>
            <div className="clw-row">
              <span className="clw-row-text"><b>Password</b><small>Changing it signs your other devices out.</small></span>
              {!open && <button type="button" className="clw-btn" onClick={() => { setDone(null); setError(null); setOpen(true); }} data-open-password=""><MaskIcon name="key-round" size={16} />Change password</button>}
            </div>
            {open && (
              <form className="clw-form" onSubmit={change} noValidate>
                <label className="clw-field is-wide"><span>Current password</span>
                  <input className="clw-input" type={type} name="current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={error?.field === "current" || undefined} /></label>
                <label className="clw-field"><span>New password</span>
                  <input className="clw-input" type={type} name="next" autoComplete="new-password" placeholder="At least 10 characters" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={error?.field === "next" || undefined} /></label>
                <label className="clw-field"><span>Repeat new password</span>
                  <input className="clw-input" type={type} name="repeat" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-invalid={error?.field === "repeat" || undefined} /></label>
                <div role="status" aria-live="polite" className="clw-form-status">{error && <p className="clw-form-error" data-password-error="">{error.text}</p>}</div>
                <div className="clw-form-actions">
                  <button type="button" className="clw-btn" onClick={() => setShow((v) => !v)} aria-pressed={show} data-show-passwords=""><MaskIcon name={show ? "eye-off" : "eye"} size={16} />{show ? "Hide passwords" : "Show passwords"}</button>
                  <span className="clw-grow" />
                  <button type="button" className="clw-btn" onClick={closeForm} disabled={busy} data-cancel-password="">Cancel</button>
                  <button type="submit" className="clw-btn is-primary" disabled={busy} data-change-password="">{busy ? "Saving…" : "Save password"}</button>
                </div>
              </form>
            )}
            {!open && done && <p className="clw-note is-ok" role="status" data-password-changed=""><MaskIcon name="check" size={16} /><span>Password changed. Your other devices are signed out.{done.noticeSent ? ` A note went to ${email}.` : ""}</span></p>}
          </div>
        </section>

        <PartBoundary where="client/account/grants"><GrantsCard contact={contact} /></PartBoundary>

        <section className="clw-card clw-help" id="help" data-card="help">
          <b>Help &amp; support</b>
          {contact
            ? <p data-client-contact="">Questions about a flight or your access go to Clearway ops at <a href={`mailto:${contact}`} className="clw-addr">{contact}</a>.</p>
            : <p>Questions about a flight or your access go to Clearway ops.</p>}
        </section>

        <button type="button" className="clw-out" onClick={signOut} disabled={leaving} data-signout=""><MaskIcon name="log-out" size={16} />{leaving ? "Signing out…" : "Sign out"}</button>
      </div>
    </main>
  );
}
