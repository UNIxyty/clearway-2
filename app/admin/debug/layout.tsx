import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireDeveloper } from "@/lib/admin-auth";

// The debug runner (and its raw output) is a developer tool: no nav entry, reachable by URL on purpose
// (docs/portal-inventory.md), for the developer role only — checked here on the server, like the /developer segment.
// Starting and stopping runs is portal.debug.run, developer only by default. FAIL CLOSED: an errored check denies.
export const dynamic = "force-dynamic";

export default async function DebugRunnerLayout({ children }: { children: ReactNode }) {
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
