import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireDeveloper } from "@/lib/admin-auth";

// The developer gate, server-side, for the whole /developer segment. The same
// flag gates the nav group and the API scope. Admin deliberately gets the same
// Forbidden as everyone else — the inbox holds every ops complaint about the
// product, and an ops manager reading it changes what people are willing to
// file. FAIL CLOSED: an errored flag check denies.
export const dynamic = "force-dynamic";

export default async function DeveloperLayout({ children }: { children: ReactNode }) {
  let allowed = false;
  try {
    const auth = await requireDeveloper();
    allowed = !("error" in auth);
  } catch {
    allowed = false;
  }
  if (!allowed) redirect("/forbidden");
  return <>{children}</>;
}
