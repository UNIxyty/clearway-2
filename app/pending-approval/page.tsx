"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Lock, UserRoundCheck } from "lucide-react";
import AuthBackdrop from "@/app/auth/ui/AuthBackdrop";
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  AuthLogos,
  MessageIcon,
  authFaint,
  authMuted,
} from "@/app/auth/ui/auth-kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth-next-path.mjs";

// Visuals from Auth Flow.dc.html ("Email verified / admin review" checklist
// screen). Mechanics unchanged: poll the session every 4s and advance the
// moment an admin approves; approval returns to the validated `next` deep
// link when the middleware carried one.

export default function PendingApprovalPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
    const nextParam = safeNextPath(new URLSearchParams(window.location.search).get("next"));
    const interval = setInterval(async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        // Session gone — account was declined/deleted
        window.location.href = "/login";
        return;
      }
      if (data.session.user?.user_metadata?.is_approved === true) {
        const role = String(data.session.user?.user_metadata?.role || "").toLowerCase();
        const isTemporary =
          role === "temporary" ||
          data.session.user?.user_metadata?.is_temporary === true ||
          (Array.isArray(data.session.user?.user_metadata?.roles) &&
            (data.session.user?.user_metadata?.roles as unknown[]).some(
              (value) => String(value).toLowerCase() === "temporary",
            ));
        window.location.href = isTemporary ? "/pickem" : nextParam;
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const rows = [
    { icon: <Check size={13} style={{ color: "#15803d" }} />, bg: "#e7f6ec", label: "Email verified", color: "#15803d", weight: 600 },
    { spin: true, bg: "#fef3e2", label: "Admin review · in progress", color: "#b45309", weight: 700 },
    { icon: <Lock size={13} style={{ color: authFaint }} />, bg: "#f0f1f3", label: "Access granted", color: authFaint, weight: 600 },
  ];

  return (
    <AuthBackdrop>
      <div className="cw-fadeup" style={{ width: 452, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <AuthLogos />
        <AuthCard>
          <div style={{ textAlign: "center" }}>
            <MessageIcon icon={UserRoundCheck} bg="#fef3e2" color="#c2703b" />
            <AuthHeading
              center
              title="Request received"
              sub="Your email is verified. An admin needs to approve your account before you can use the portal — this page advances automatically."
            />
          </div>

          <div style={{ textAlign: "left", border: "1px solid #eef0f2", borderRadius: 12, padding: 14, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((row) => (
              <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: row.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {row.spin ? (
                    <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #e9b872", borderTopColor: "#b45309", animation: "cwspin .8s linear infinite" }} />
                  ) : (
                    row.icon
                  )}
                </span>
                <span style={{ fontSize: 13, fontWeight: row.weight, color: row.color }}>{row.label}</span>
              </div>
            ))}
          </div>

          <AuthButton variant="secondary" onClick={signOut}>
            Sign out
          </AuthButton>
          {email && (
            <div style={{ textAlign: "center", fontSize: 12.5, color: authMuted, marginTop: 14 }}>
              Signed in as {email}
            </div>
          )}
        </AuthCard>
      </div>
    </AuthBackdrop>
  );
}
