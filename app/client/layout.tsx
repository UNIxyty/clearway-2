// The client's world (Stage 5; the shell since 2026-11-04). The middleware decides who gets here and which page
// (lib/clients/allow.mjs). This layout gives an APPROVED client the client shell, whose menu is built here, on the
// server, from their switches and the allow-list — so the page source holds their menu and nothing else. The holding
// pages (refused, removed) render bare: no shell, no menu, no counts. Nothing here imports the portal's staff shell.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/client/client.css";
import ClientShell from "@/components/client/ClientShell";
import { currentClient } from "@/lib/clients/server-scope";
import { CLIENT_ACCOUNT_PAGE, clientMenu } from "@/lib/clients/allow.mjs";

// Nothing of the portal in the client's <head>: the title is theirs, and no description of what the portal does.
export const metadata: Metadata = { title: "Your flights", description: "Sign in to see your flights." };
export const dynamic = "force-dynamic";

export default async function ClientLayout({ children }: { children: ReactNode }) {
  let menu: { path: string; label: string; icon: string }[] = [];
  let company = ""; let initials = "";
  try {
    const { user, scope } = await currentClient();
    // an approved client with a scope gets the shell; anyone else here (a holding page) gets none
    if (scope && !scope.nobody) {
      menu = clientMenu(scope.switches);
      company = String(scope.company ?? "");
      const name = String((user?.user_metadata as Record<string, unknown> | undefined)?.full_name || company); // metadata-ok: the display name only, for the initials
      initials = name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
      return <div className="cl-root" data-client-root=""><ClientShell menu={menu} account={CLIENT_ACCOUNT_PAGE} company={company} initials={initials}>{children}</ClientShell></div>;
    }
  } catch { /* no shell on any failure: the page alone, which shows nothing it was not given */ }
  return <div className="cl-root" data-client-root="">{children}</div>;
}
