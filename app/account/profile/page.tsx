"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import PortalShell from "@/components/portal/Shell";
import { PCard, PButton, PSectionTitle } from "@/components/portal/ui";
import { BarChartIcon, LogOutIcon, BellIcon, Mail } from "lucide-react";

const inputClass =
  "h-10 w-full rounded-[10px] border border-[#d6d8dc] bg-white px-3 text-sm text-[#17181c] outline-none placeholder:text-[#9aa0a8] focus:border-[#2563eb]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#17181c]";
const errorBox =
  "rounded-[10px] border border-[#f0d4d4] bg-[#fdf2f2] px-3.5 py-2.5 text-sm text-[#a12a2e]";
const successBox =
  "rounded-[10px] border border-[#c7ead2] bg-[#e7f6ec] px-3.5 py-2.5 text-sm text-[#15803d]";
const amberBox =
  "rounded-[10px] border border-[#f4d4b8] bg-[#fdf1e8] px-3.5 py-2.5 text-sm text-[#c2703b]";
const readOnlyField =
  "rounded-[10px] bg-[#f5f6f7] px-3 py-2.5 font-mono text-[13px] text-[#3a3d44] break-all";

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailChangeSentTo, setEmailChangeSentTo] = useState<string | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailInfo, setEmailInfo] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [passwordResetEmailSentTo, setPasswordResetEmailSentTo] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordInfo, setPasswordInfo] = useState<string | null>(null);

  useEffect(() => {
    async function loadAccount() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      setEmail(user?.email ?? "");
      setUserId(user?.id ?? "");
      const pending =
        (user as unknown as { new_email?: string | null; email_change?: string | null })?.new_email ??
        (user as unknown as { new_email?: string | null; email_change?: string | null })?.email_change ??
        null;
      setPendingEmail(pending || null);
      if (!pending) {
        setEmailChangeSentTo(null);
      }
    }

    void loadAccount();

    fetch("/api/user/preferences")
      .then((res) => res.json())
      .then((data) => {
        if (data.preferences?.display_name) {
          setDisplayName(data.preferences.display_name);
        }
      })
      .catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadAccount();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const res = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function handleChangeEmail() {
    setEmailError(null);
    setEmailInfo(null);
    const targetEmail = newEmail.trim().toLowerCase();
    if (!targetEmail) {
      setEmailError("Enter a new email.");
      return;
    }
    if (targetEmail === email.trim().toLowerCase()) {
      setEmailError("New email must be different from current email.");
      return;
    }
    setEmailSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ email: targetEmail });
      if (updateError) throw updateError;
      setEmailInfo(
        "Confirmation sent. Open your new email inbox and confirm the change. If secure email change is enabled, you may also need to confirm from your current email inbox.",
      );
      setEmailChangeSentTo(targetEmail);
      setPendingEmail(targetEmail);
      setNewEmail("");
    } catch (e) {
      setEmailError((e as { message?: string })?.message || "Failed to start email change.");
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordInfo(null);
    if (!email.trim()) {
      setPasswordError("Current email is missing. Refresh and try again.");
      return;
    }
    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    setPasswordSaving(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: currentPassword,
      });
      if (signInError) {
        throw new Error("Current password is incorrect.");
      }

      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: boolean;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Failed to send verification email.");
      }

      setPasswordResetEmailSentTo(email.trim());
      setPasswordInfo(
        data.message ||
          "Verification email sent. Open your inbox and use the reset link to set a new password.",
      );
      setCurrentPassword("");
    } catch (e) {
      setPasswordError((e as { message?: string })?.message || "Failed to start password change.");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <PortalShell>
      <div className="max-w-[1100px] px-[30px] pb-10 pt-[26px]">
        <div className="mb-[5px] flex items-center gap-3">
          <img
            src="/PFP.png"
            alt="Profile picture"
            className="h-9 w-9 rounded-full border border-[#e6e7ea] bg-[#eef4ff] object-cover"
          />
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">Profile</h1>
        </div>
        <p className="m-0 mb-5 text-[15px] text-[#6c7079]">
          Manage your account settings and preferences
        </p>

        <div className="flex max-w-[680px] flex-col gap-4">
          {error && <div className={errorBox}>{error}</div>}

          {success && <div className={successBox}>Profile updated successfully</div>}

          <PCard className="p-[22px]">
            <PSectionTitle>Account Information</PSectionTitle>
            <p className="m-0 mt-1 text-[13px] text-[#6c7079]">
              Your authentication details (read-only)
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass}>Email</label>
                <div className={readOnlyField}>{email}</div>
              </div>
              {pendingEmail && (
                <div className={amberBox}>
                  Pending email change: {pendingEmail}. Confirm from your inbox(es) to finalize.
                </div>
              )}
              <div>
                <label className={labelClass}>User ID</label>
                <div className={readOnlyField}>{userId}</div>
              </div>
            </div>
          </PCard>

          <PCard className="p-[22px]">
            <PSectionTitle>Display Name</PSectionTitle>
            <p className="m-0 mt-1 text-[13px] text-[#6c7079]">
              Optional name shown in the portal (instead of your email)
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass} htmlFor="displayName">
                  Name
                </label>
                <input
                  id="displayName"
                  className={inputClass}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <PButton variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </PButton>
            </div>
          </PCard>

          <PCard className="p-[22px]">
            <PSectionTitle>Change Email</PSectionTitle>
            <p className="m-0 mt-1 text-[13px] text-[#6c7079]">
              Update the email used to sign in. A confirmation email is sent to the new address.
            </p>
            <div className="mt-4 space-y-4">
              {emailError && <div className={errorBox}>{emailError}</div>}
              {emailInfo && <div className={successBox}>{emailInfo}</div>}
              {emailChangeSentTo || pendingEmail ? (
                <div className="rounded-[12px] border border-[#e6e7ea] bg-[#fbfbfc] px-4 py-6 text-center">
                  <Mail className="mx-auto mb-2 h-6 w-6 text-[#9aa0a8]" />
                  <p className="m-0 text-sm font-semibold text-[#17181c]">Check your email</p>
                  <p className="m-0 mt-1 text-sm text-[#6c7079]">
                    We sent confirmation for{" "}
                    <span className="font-mono">{emailChangeSentTo || pendingEmail}</span>.
                  </p>
                  <button
                    type="button"
                    className="mt-4 cursor-pointer border-none bg-transparent p-0 text-xs text-[#6c7079] underline underline-offset-4 hover:text-[#17181c]"
                    onClick={() => {
                      setEmailChangeSentTo(null);
                      setEmailInfo(null);
                    }}
                  >
                    Change email again
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className={labelClass} htmlFor="newEmail">
                      New email
                    </label>
                    <input
                      id="newEmail"
                      className={inputClass}
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <PButton
                    variant="primary"
                    onClick={handleChangeEmail}
                    disabled={emailSaving || !newEmail.trim()}
                  >
                    {emailSaving ? "Sending confirmation…" : "Change email"}
                  </PButton>
                </>
              )}
            </div>
          </PCard>

          <PCard className="p-[22px]">
            <PSectionTitle>Change Password</PSectionTitle>
            <p className="m-0 mt-1 text-[13px] text-[#6c7079]">
              Verify your current password first. We then send a verification email with a secure reset link.
            </p>
            <div className="mt-4 space-y-4">
              {passwordError && <div className={errorBox}>{passwordError}</div>}
              {passwordInfo && <div className={successBox}>{passwordInfo}</div>}
              {passwordResetEmailSentTo ? (
                <div className="rounded-[12px] border border-[#e6e7ea] bg-[#fbfbfc] px-4 py-6 text-center">
                  <Mail className="mx-auto mb-2 h-6 w-6 text-[#9aa0a8]" />
                  <p className="m-0 text-sm font-semibold text-[#17181c]">Check your email</p>
                  <p className="m-0 mt-1 text-sm text-[#6c7079]">
                    We sent a password verification link to{" "}
                    <span className="font-mono">{passwordResetEmailSentTo}</span>.
                  </p>
                  <button
                    type="button"
                    className="mt-4 cursor-pointer border-none bg-transparent p-0 text-xs text-[#6c7079] underline underline-offset-4 hover:text-[#17181c]"
                    onClick={() => {
                      setPasswordResetEmailSentTo(null);
                      setPasswordInfo(null);
                    }}
                  >
                    Start again
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className={labelClass} htmlFor="currentPassword">
                      Current password
                    </label>
                    <input
                      id="currentPassword"
                      className={inputClass}
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <PButton
                    variant="primary"
                    onClick={handleChangePassword}
                    disabled={passwordSaving || !currentPassword}
                  >
                    {passwordSaving ? "Verifying…" : "Verify and send email"}
                  </PButton>
                </>
              )}
            </div>
          </PCard>

          <PCard className="p-[22px]">
            <PSectionTitle>Quick Links</PSectionTitle>
            <div className="mt-4 flex flex-col gap-2">
              <PButton
                variant="secondary"
                className="w-full justify-start"
                onClick={() => router.push("/stats")}
              >
                <BarChartIcon className="h-4 w-4" />
                Search Stats
              </PButton>
              <PButton
                variant="secondary"
                className="w-full justify-start"
                onClick={() => router.push("/settings/notifications")}
              >
                <BellIcon className="h-4 w-4" />
                Notification Settings
              </PButton>
            </div>
          </PCard>

          <PCard className="border-[#f0d4d4] p-[22px]">
            <PSectionTitle>Sign Out</PSectionTitle>
            <p className="m-0 mt-1 text-[13px] text-[#6c7079]">End your current session</p>
            <div className="mt-4">
              <button
                type="button"
                onClick={signOut}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#f0d4d4] bg-[#fdf2f2] px-4 py-[10px] text-sm font-semibold text-[#a12a2e] hover:bg-[#fbe8e8]"
              >
                <LogOutIcon className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </PCard>
        </div>
      </div>
    </PortalShell>
  );
}
