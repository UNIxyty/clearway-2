// The client's world (Stage 5). A bare route: components/portal/Shell.tsx leaves it without the portal shell, so no
// navigation, no counts and no page titles of the portal are ever in a client's page source. The middleware decides
// who gets here and which page; these pages assume that and render nothing about anyone else.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/client/client.css";

// Nothing of the portal in the client's <head>: the title is theirs, and no description of what the portal does.
export const metadata: Metadata = { title: "Your flights", description: "Sign in to see your flights." };

export default function ClientLayout({ children }: { children: ReactNode }) {
  return <div className="cl-root" data-client-root="">{children}</div>;
}
