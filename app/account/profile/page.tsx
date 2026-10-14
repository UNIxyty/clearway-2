"use client";

// Account → Profile (portal redesign, stage 3 — "Page Profile"): one account card with the labels on the left —
// display name, sign-in email (change it: a confirmation goes to the new address), password (we check the current
// one, then email a secure link), role, user ID — and Sign out. Search statistics and notification settings are no
// longer linked from here; appearance and the dashboard are in Settings (stage 4), and the page says so.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import PortalShell, { useIdentity } from "@/components/portal/Shell";
import { Button, Callout, Card, ErrorState, IconButton, RoleBadge, SkeletonRows, TextInput, useToast } from "@/components/kit";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLE_TEXT = { developer: "Developer", admin: "Admin", user: "User" } as const;

function Row({ label, hint, children, last = false }: { label: ReactNode; hint?: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <div className={`grid items-start gap-x-6 gap-y-2 px-6 py-5 md:grid-cols-[220px_minmax(0,1fr)] ${last ? "" : "border-b border-cw-divider"}`}>
      <div><div className="text-[14px] font-semibold text-cw-text">{label}</div>{hint && <div className="mt-0.5 text-[12.5px] leading-normal text-cw-text-muted">{hint}</div>}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function ProfilePage() {
  const toast = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { role, roleKnown, isDeveloper } = useIdentity();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSentTo, setPwSentTo] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) { setState("error"); return; }
    const user = data.user as typeof data.user & { new_email?: string | null; email_change?: string | null };
    setEmail(user.email ?? ""); setUserId(user.id); setCreatedAt(user.created_at ?? null);
    setPendingEmail(user.new_email || user.email_change || null);
    setState("ready");
  }, [supabase]);

  useEffect(() => {
    void loadAccount();
    fetch("/api/user/preferences").then((r) => r.json()).then((d) => { const n = d.preferences?.display_name ?? ""; setDisplayName(n); setSavedName(n); }).catch(() => {});
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void loadAccount(); });
    return () => subscription.unsubscribe();
  }, [supabase, loadAccount]);

  async function saveName() {
    setSavingName(true);
    const res = await fetch("/api/user/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name: displayName }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSavingName(false);
    if (!res?.ok) { toast.show({ tone: "danger", title: "Couldn't save your name", body: data.error || `The server said ${res?.status ?? "nothing"}.` }); return; }
    setSavedName(displayName.trim());
    toast.show({ tone: "success", title: displayName.trim() ? "Name saved" : "Name removed — your email shows instead" });
  }

  async function changeEmail() {
    setEmailError(null);
    const target = newEmail.trim().toLowerCase();
    if (!EMAIL.test(target)) { setEmailError("That doesn't look like an email address."); return; }
    if (target === email.trim().toLowerCase()) { setEmailError("That is already your sign-in email."); return; }
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email: target });
    setEmailSaving(false);
    if (error) { setEmailError(error.message || "Couldn't start the change."); return; }
    setPendingEmail(target); setEditingEmail(false); setNewEmail("");
  }

  async function changePassword() {
    setPwError(null);
    if (!currentPassword) { setPwError("Enter your current password."); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: currentPassword });
      if (error) throw new Error("That isn't your current password.");
      const res = await fetch("/api/auth/password/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; sent?: boolean };
      if (!res.ok) throw new Error(data.error || "Couldn't send the email.");
      // The route answers ok even when sending failed, so the public "forgot password" page does not reveal which
      // addresses exist. Here the person is signed in with this address, so a failure is a real one: say so.
      if (data.sent === false) throw new Error("The email could not be sent. Try again in a few minutes, or ask an admin to send a password reset from Admin › Users.");
      setPwSentTo(email.trim()); setPwOpen(false); setCurrentPassword("");
    } catch (e) {
      setPwError((e as Error).message);
    } finally {
      setPwSaving(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const name = savedName || email;
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  const roleKey = isDeveloper ? "developer" : role === "admin" ? "admin" : "user";
  const since = createdAt ? new Date(createdAt) : null;

  return (
    <PortalShell crumb="Account" title="Profile">
      <div className="flex max-w-[880px] flex-col gap-5" style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        <div className="flex items-center gap-4">
          <span aria-hidden className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-cw-primary text-[20px] font-bold text-cw-text-on-primary">{state === "ready" ? initials : ""}</span>
          <div className="min-w-0">
            <div className="truncate text-[20px] font-extrabold tracking-[-0.01em] text-cw-text">{state === "ready" ? name : " "}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13.5px] text-cw-text-muted">
              {roleKnown && <RoleBadge role={roleKey} />}
              {since && <span>Member since <span className="font-mono">{String(since.getUTCDate()).padStart(2, "0")} {since.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} {since.getUTCFullYear()}</span></span>}
            </div>
          </div>
        </div>

        {state === "loading" ? <Card padded={false}><SkeletonRows rows={4} avatar={false} label="Loading your profile" /></Card>
          : state === "error" ? <Card padded={false}><ErrorState title="Couldn't load your profile" detail="You're still signed in. Reload the page, or sign in again if it keeps failing." onRetry={() => { setState("loading"); void loadAccount(); }} /></Card>
          : (
            <>
              <Card title="Account" padded={false}>
                <Row label="Display name" hint="Shown instead of your email.">
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void saveName(); }}>
                    <span className="flex-1"><TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" aria-label="Display name" maxLength={80} /></span>
                    {displayName.trim() !== savedName.trim() && <Button type="submit" variant="primary" loading={savingName} loadingLabel="Saving…">Save</Button>}
                  </form>
                </Row>
                <Row label="Sign-in email" hint="A confirmation goes to the new address.">
                  {editingEmail ? (
                    <form noValidate className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void changeEmail(); }}>
                      <div className="flex h-9 items-center rounded-[8px] border border-cw-border bg-cw-bg-sunken px-3 font-mono text-[13.5px] text-cw-text-body">{email}</div>
                      <div className="flex flex-wrap gap-2">
                        <span className="min-w-[220px] flex-1"><TextInput mono autoFocus type="email" autoComplete="email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setEmailError(null); }} placeholder="New address" aria-label="New sign-in email" invalid={Boolean(emailError)} /></span>
                        <Button variant="quiet" onClick={() => { setEditingEmail(false); setNewEmail(""); setEmailError(null); }}>Cancel</Button>
                        {newEmail.trim() && <Button type="submit" variant="primary" loading={emailSaving} loadingLabel="Sending…">Send confirmation</Button>}
                      </div>
                      {emailError && <p role="alert" className="m-0 text-[13px] text-cw-danger-text">{emailError}</p>}
                    </form>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-mono text-[14px] text-cw-text">{email}</span><Button size="sm" onClick={() => setEditingEmail(true)}>Change</Button></div>
                      {pendingEmail && (
                        <Callout tone="info" icon="mail" title={<>Waiting for you to confirm <span className="font-mono">{pendingEmail}</span></>}>
                          Open the link we sent there. Until then you sign in with <span className="font-mono">{email}</span>. If the confirmation asks for both addresses, confirm from both inboxes.
                        </Callout>
                      )}
                    </div>
                  )}
                </Row>
                <Row label="Password">
                  {pwOpen ? (
                    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void changePassword(); }}>
                      <div className="flex flex-wrap gap-2">
                        <span className="min-w-[220px] flex-1"><TextInput autoFocus type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setPwError(null); }} placeholder="Current password" aria-label="Current password" invalid={Boolean(pwError)} /></span>
                        <Button variant="quiet" onClick={() => { setPwOpen(false); setCurrentPassword(""); setPwError(null); }}>Cancel</Button>
                        {currentPassword && <Button type="submit" variant="primary" loading={pwSaving} loadingLabel="Checking…">Check and send the link</Button>}
                      </div>
                      {pwError && <p role="alert" className="m-0 text-[13px] text-cw-danger-text">{pwError}</p>}
                    </form>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 text-[13.5px] text-cw-text-body">We check your current password, then email you a secure link to set a new one.</span><Button size="sm" onClick={() => { setPwOpen(true); setPwSentTo(null); }}>Change password</Button></div>
                      {pwSentTo && <Callout tone="success" icon="mail" title="Check your email">We sent a link to <span className="font-mono">{pwSentTo}</span>. It opens a page where you choose the new password.</Callout>}
                    </div>
                  )}
                </Row>
                <Row label="Role">
                  <span className="text-[13.5px] text-cw-text-body">{roleKnown ? ROLE_TEXT[roleKey] : "…"} — set by an admin in Admin → Users.</span>
                </Row>
                <Row label="User ID" last>
                  <div className="flex items-center gap-1.5"><span className="min-w-0 truncate font-mono text-[13px] text-cw-text-body">{userId}</span>
                    <IconButton icon="copy" label="Copy your user ID" size="sm" onClick={() => { void navigator.clipboard?.writeText(userId).then(() => toast.show({ tone: "info", title: "User ID copied" })).catch(() => {}); }} /></div>
                </Row>
              </Card>
              <section aria-label="Sign out" className="flex flex-wrap items-center gap-4 rounded-[14px] border border-cw-border bg-cw-bg-surface px-6 py-[18px] shadow-cw-1">
                <div className="min-w-[220px] flex-1"><div className="text-[14px] font-semibold text-cw-text">Sign out</div><div className="mt-0.5 text-[12.5px] text-cw-text-muted">Ends this session. Your theme, pinned tabs and dashboard layout stay with your account.</div></div>
                <Button variant="danger-quiet" icon="log-out" className="border border-cw-danger-border" onClick={() => void signOut()}>Sign out</Button>
              </section>
              <p className="m-0 text-[13px] text-cw-text-muted">Looking for appearance or dashboard options? They are in <Link href="/settings" className="font-semibold text-cw-text-link no-underline hover:text-cw-primary-hover">Settings</Link>.</p>
            </>
          )}
      </div>
    </PortalShell>
  );
}
