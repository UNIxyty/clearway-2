"use client";

// Profile on a phone (Tier 2 › form): one card of rows; name and email open an edit sheet, the password sends the
// reset email after the current one is checked, the role is read-only. Sign out at the foot. The same calls as the
// desktop (app/account/profile).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useIdentity } from "@/components/portal/Shell";
import { OFFLINE, ShownError, authErrorText, shownText } from "@/lib/error-text";
import { usePhonePage } from "@/components/m/chrome";
import { InputSheet } from "@/components/m/pick";
import { MButton, MError } from "@/components/m/ui";
import { T2Form, T2Page } from "@/components/m/tier2";
import { getJson, useResource } from "@/lib/m/t2";

export default function ProfilePhonePage() {
  usePhonePage({ title: "Profile", tab: "more" });
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { role, isDeveloper } = useIdentity();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)).catch(() => setEmail(null)); }, [supabase]);
  const prefs = useResource<{ preferences?: { display_name?: string } }>("/api/user/preferences");
  const [name, setName] = useState<string | null>(null);
  useEffect(() => { if (prefs.data) setName(prefs.data.preferences?.display_name ?? ""); }, [prefs.data]);
  const [sheet, setSheet] = useState<"name" | "email" | "password" | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const saveName = async (v: string) => { setBusy(true); setFailed(null); try { await getJson("/api/user/preferences", { json: { display_name: v } }); setName(v); setSheet(null); setSaid("Name saved."); } catch (e) { setFailed(shownText(e, "Couldn’t save your name. Try again.")); } finally { setBusy(false); } };
  // sent by us since 2026-11-02 (app/api/account/email-change): a link to each address, both in Mailbox › Sent
  const saveEmail = async (v: string) => { setBusy(true); setFailed(null); try { await getJson("/api/account/email-change", { json: { email: v } }); setSheet(null); setSaid(`We emailed a link to ${email ?? "your current address"} and to ${v}. The change happens once both are confirmed; until then your sign-in stays ${email ?? "as it is"}.`); } catch (e) { setFailed(shownText(e, "Couldn’t change the email. Try again.")); } finally { setBusy(false); } };
  const resetPassword = async (current: string) => {
    if (!email) { setFailed(OFFLINE); return; }
    setBusy(true); setFailed(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: current });
    if (error) { setBusy(false); setFailed(authErrorText(error, "That is not your current password.")); return; }
    try { const d = await getJson<{ sent?: boolean }>("/api/auth/password/forgot", { json: { email } }); if (d?.sent === false) throw new ShownError("The reset email could not be sent. Try again in a few minutes, or ask an admin to send one from Admin › Users."); setSheet(null); setSaid(`A reset link is on its way to ${email}. It works for one hour.`); } catch (e) { setFailed(shownText(e, "Couldn’t send the reset email. Try again.")); } finally { setBusy(false); }
  };
  const signOut = async () => { await supabase.auth.signOut().catch(() => {}); router.replace("/login"); };
  const roleLabel = isDeveloper ? "Developer" : role === "admin" ? "Admin" : "User";
  return (
    <T2Page loading={prefs.loading && name === null} error={prefs.error && !prefs.data ? prefs.error : null} empty={false} emptyCopy={["", ""]} errorCopy={["Couldn’t load your profile", "Try again in a moment."]} onRetry={prefs.reload}
      sticky={<MButton kind="danger-outline" icon="log-out" onClick={() => void signOut()}>Sign out</MButton>}>
      {said && <div role="status" className="rounded-[12px] border border-cw-success-border bg-cw-success-tint px-3.5 py-3 text-[14px] leading-snug text-cw-text">{said}</div>}
      {failed && !sheet && <MError title="Not saved." onRetry={() => setFailed(null)}>{failed}</MError>}
      <T2Form groups={[{ key: "you", h: "YOU", rows: [
        { key: "name", title: "Name", sub: name || "Not set — the portal shows your email", onClick: () => { setFailed(null); setSheet("name"); } },
        { key: "email", title: "Email", sub: email ?? "…", onClick: () => { setFailed(null); setSheet("email"); } },
        { key: "password", title: "Password", sub: "Send yourself a reset link", onClick: () => { setFailed(null); setSheet("password"); } },
        { key: "role", title: "Role", sub: roleLabel, readOnly: true },
      ], note: "Roles are given on a desk, under Admin › Users." }]} />
      <InputSheet open={sheet === "name"} onClose={() => setSheet(null)} title="Your name" label="Shown to colleagues and on the wall’s checks" value={name ?? ""} placeholder="First Last" onSave={(v) => void saveName(v)} busy={busy} failed={failed} autoComplete="name" />
      <InputSheet open={sheet === "email"} onClose={() => setSheet(null)} title="Change email" label="New email" value={email ?? ""} type="email" onSave={(v) => void saveEmail(v)} busy={busy} failed={failed} saveLabel="Send confirmation" note="We send a confirmation to the new address; the change happens when you open it." autoComplete="email" />
      <InputSheet open={sheet === "password"} onClose={() => setSheet(null)} title="Reset password" label="Your current password" value="" type="password" onSave={(v) => void resetPassword(v)} busy={busy} failed={failed} saveLabel="Send reset link" note={`The link goes to ${email ?? "your email"} and works for one hour.`} autoComplete="current-password" />
    </T2Page>
  );
}
