import type { Metadata } from "next";
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
      <main className="mx-auto max-w-[900px] px-4 py-10">
        <div className="rounded-xl border border-red-200 bg-white p-6">
          <h1 className="text-xl font-black text-red-700">Forbidden</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Admin or developer role is required to access Pickem admin.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6">
      <PickemAdminClient />
    </main>
  );
}

