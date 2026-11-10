"use client";

// The client's Account page (2026-11-09). The password change asks for the current password and the server checks it
// (app/api/client/account/password); the page says what happened only once the server has answered.
import { useEffect, useState, type FormEvent } from "react";
import MaskIcon from "@/components/portal/Icon";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { readChoice, setChoice, type ThemeChoice } from "@/components/portal/theme";

type Done = { noticeSent: boolean };
type Start = "timeline" | "flights";
type Grant = { oprId: string; name: string; regs: { reg: string; type: string }[] };

/** The operators and aircraft granted, read from the wall's own scoped answer (the fleet the server sends IS the grant). */
function useGrants() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  useEffect(() => {
    const now = new Date(); const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)); const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4));
    fetch(`/digital-wall/api/timeline/flights?allOperators=true&refresh=false&from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" }).then((r) => r.json()).then((d) => {
      const map = new Map<string, Grant>();
      for (const g of (d?.aircraft ?? []) as { oprId?: string; operatorName?: string; registration?: string; acftTypeIcao?: string }[]) {
        const key = String(g.oprId ?? "").toLowerCase();
        if (!map.has(key)) map.set(key, { oprId: key, name: g.operatorName || key.toUpperCase(), regs: [] });
        if (g.registration) map.get(key)!.regs.push({ reg: g.registration, type: g.acftTypeIcao || "" });
      }
      setGrants([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => setGrants([]));
  }, []);
  return grants;
}

export default function ClientAccount({ email, name, company, contact, start: start0 }: { email: string; name: string; company: string; contact: string; start: Start | null }) {
  const [start, setStart] = useState<Start>(start0 ?? "timeline");
  const [startNote, setStartNote] = useState("");
  const [choice, setTheme] = useState<ThemeChoice>("system");
  useEffect(() => setTheme(readChoice()), []);
  const grants = useGrants();
  async function pickStart(k: Start) {
    const was = start; setStart(k); setStartNote("");
    const r = await fetch("/api/client/prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ start: k }) }).catch(() => null);
    if (!r || !r.ok) { setStart(was); setStartNote("The choice could not be saved. Try again."); } else setStartNote(`Saved. ${k === "flights" ? "Flights" : "Timeline"} opens after you sign in.`);
  }
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

      <section className="clw-card" data-card="start-page">
        <div className="clw-card-head"><MaskIcon name="sparkles" size={16} /><span>Start page</span></div>
        <div className="clw-pref"><span><b>Opens after you sign in</b><small>Both stay in the sidebar.</small></span>
          <div className="clw-seg2" role="radiogroup" aria-label="Start page">{(["timeline", "flights"] as Start[]).map((k) => <button type="button" key={k} role="radio" aria-checked={start === k} className={start === k ? "on" : ""} onClick={() => pickStart(k)} data-start-option={k}><MaskIcon name={k === "timeline" ? "chart-gantt" : "list"} size={14} />{k === "timeline" ? "Timeline" : "Flights list"}</button>)}</div>
        </div>
        {startNote && <p className="clw-card-text clw-muted" role="status" data-start-note="">{startNote}</p>}
        <div className="clw-pref"><span><b>Appearance</b><small>Light, dark or the same as this device.</small></span>
          <div className="clw-seg2" role="radiogroup" aria-label="Appearance">{([["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "This device", "monitor"]] as [ThemeChoice, string, string][]).map(([k, t, i]) => <button type="button" key={k} role="radio" aria-checked={choice === k} className={choice === k ? "on" : ""} onClick={() => { setTheme(k); setChoice(k); }} data-theme-option={k}><MaskIcon name={i} size={14} />{t}</button>)}</div>
        </div>
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

      <section className="clw-card" data-card="grants">
        <div className="clw-card-head"><MaskIcon name="plane" size={16} /><span>Operators and aircraft you can see</span></div>
        <p className="clw-card-text clw-muted">Granted by Clearway ops.{contact ? <> To change it, write to <a href={`mailto:${contact}`}>{contact}</a>.</> : null}</p>
        {grants === null && <p className="clw-card-text clw-muted">Reading…</p>}
        {grants !== null && grants.length === 0 && <p className="clw-card-text clw-muted" data-grants-empty="">No operators or aircraft are on your account yet.</p>}
        {grants?.map((g) => <div key={g.oprId} className="clw-grant" data-grant={g.oprId}><span><b>{g.name}</b><small>{g.regs.length} aircraft</small></span><span className="clw-regs">{g.regs.map((r) => <span key={r.reg} className="clw-reg">{r.reg}{r.type && <small>{r.type}</small>}</span>)}</span></div>)}
        <p className="clw-card-text clw-muted">To hide some of them on your screen, use Operators &amp; aircraft on Timeline or Flights.</p>
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
