import LoginCard from "./ui/LoginCard";
import Link from "next/link";

// This page uses useSearchParams() in a client component; force dynamic rendering
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <img
              src="https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/header_logo_white.svg"
              alt="Clearway"
              className="h-8 w-auto"
              style={{ filter: "invert(1)" }}
            />
            <div className="h-6 w-px bg-border/70" />
            <img
              src="https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/logo.png"
              alt="Verxyl"
              className="h-7 w-auto opacity-90"
            />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your email and password.
          </p>
        </div>

        <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          All accounts created before 13.05 have been deleted along with their history. Please create a new account to use the portal.
        </div>

        <LoginCard />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="underline underline-offset-4 hover:text-foreground">
            Create account
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          By continuing, you agree to use this data for operational purposes only.
        </p>
      </div>
    </div>
  );
}

