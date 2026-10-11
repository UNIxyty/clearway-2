import LoginCard from "./ui/LoginCard";
import AuthBackdrop from "@/app/auth/ui/AuthBackdrop";
import Link from "next/link";
import { CornerDownRight } from "lucide-react";
import { safeNextPath } from "@/lib/auth-next-path.mjs";

// This page uses useSearchParams() in a client component; force dynamic rendering
export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const nextRaw = searchParams?.next;
  const next = safeNextPath(Array.isArray(nextRaw) ? nextRaw[0] : nextRaw, "");
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <AuthBackdrop>
      <div className="cw-fadeup" style={{ width: 452, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* logos above the card, forced white on the dark mesh */}
        <div className="cw-auth-logos" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
          <img
            src="https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/header_logo_white.svg"
            alt="Clearway Handling & Operations"
            style={{ height: 44, display: "block" }}
          />
          <span style={{ width: 1, height: 30, background: "color-mix(in srgb, var(--cw-text-on-primary) 28%, transparent)" }} />
          <img
            src="https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/logo.png"
            alt="Verxyl"
            style={{ height: 21, display: "block", filter: "brightness(0) invert(1)" }}
          />
        </div>

        <LoginCard />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13.5, color: "color-mix(in srgb, var(--cw-text-on-primary) 85%, transparent)" }}>
            Don&apos;t have an account?{" "}
            <Link
              href={signupHref}
              style={{ fontWeight: 700, color: "var(--cw-text-on-primary)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Create account
            </Link>
          </div>
          <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--cw-text-on-primary) 50%, transparent)", marginTop: 8 }}>
            By continuing, you agree to use this data for operational purposes only.
          </div>
          {next && next !== "/" && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                marginTop: 16,
                background: "color-mix(in srgb, var(--cw-text-on-primary) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--cw-text-on-primary) 20%, transparent)",
                borderRadius: 999,
                padding: "8px 15px",
                backdropFilter: "blur(4px)",
                maxWidth: "100%",
              }}
            >
              <CornerDownRight size={15} style={{ color: "color-mix(in srgb, var(--cw-text-on-primary) 75%, transparent)", flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--cw-text-on-primary) 82%, transparent)", whiteSpace: "nowrap" }}>
                After sign-in you&apos;ll return to
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--cw-text-on-primary)",
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {next}
              </span>
            </div>
          )}
        </div>
      </div>
    </AuthBackdrop>
  );
}
