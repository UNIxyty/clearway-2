import type { Metadata } from "next";
import { ShieldXIcon, HomeIcon } from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";
import { PickemAdminClient } from "./admin-page-client";

export const metadata: Metadata = {
  title: "Pickem Admin | Clearway",
  description: "Admin panel for manual Pickem match score updates and points recomputation.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PickemAdminPage() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background p-4 sm:p-6 lg:p-10 flex items-center justify-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.14),transparent_40%),radial-gradient(circle_at_80%_20%,hsl(var(--accent)/0.12),transparent_40%),radial-gradient(circle_at_50%_80%,hsl(var(--muted-foreground)/0.08),transparent_50%)]" />
        <main className="relative w-full max-w-2xl rounded-xl border border-border/70 bg-card/95 p-6 shadow-2xl backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <img
              src="/header_logo_white.svg"
              alt="Clearway"
              className="h-8 sm:h-10 w-auto object-contain opacity-90"
              style={{ filter: "invert(1)" }}
            />
            <img src="/logo.png" alt="Verxyl" className="h-8 sm:h-10 w-auto object-contain opacity-90" />
          </div>
          <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs text-destructive">
            <ShieldXIcon className="size-3.5" />
            Error 403
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground">Forbidden</h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            Admin or developer role is required to access Pickem admin.
          </p>
          <a
            href="/pickem"
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            <HomeIcon className="size-4" />
            Go to Pickem
          </a>
        </main>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6">
      <PickemAdminClient />
    </main>
  );
}

