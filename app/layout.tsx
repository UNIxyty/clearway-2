import type { Metadata } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "@/shared/portal-tokens.css";
// The client-view and phone additions (--ca-*, --mx-*): only what the portal has no token for, loaded after it
// (docs/portal-tokens.md). Both are additive; neither redefines a --cw-* token.
import "@/shared/client-tokens.css";
import "@/shared/mobile-tokens.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { PortalFrame } from "@/components/portal/Shell";
import { THEME_SCRIPT } from "@/components/portal/theme-script";

// Portal redesign: the same type stack as the Display Console — Public Sans
// for UI, IBM Plex Mono for ICAOs / NOTAM ids / timestamps / raw METAR-TAF.
// Loaded via next/font (self-hosted at build, no runtime Google request).
const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clearway AIP Data Lookup Portal",
  description:
    "Operational aviation portal for searching airports, reviewing AIP and GEN sections, and tracking NOTAM information with map-aware context, background sync workflows, and country-based lookup support.",
  icons: {
    icon: "/PFP.png",
    shortcut: "/PFP.png",
    apple: "/PFP.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const bootstrapScript = `
    window.__supabaseUrl = ${JSON.stringify(supabaseUrl)};
    window.__supabaseAnonKey = ${JSON.stringify(supabaseAnonKey)};
  `;

  // data-theme is set by THEME_SCRIPT before first paint, so the server's markup and the browser's differ on <html>
  // by design: suppressHydrationWarning covers that one element (not its children).
  return (
    <html lang="en" className={`${publicSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-cw-bg-page font-sans text-cw-text">
        <script dangerouslySetInnerHTML={{ __html: bootstrapScript }} />
        {/* One persistent portal frame (sidebar, agent panel, viewer) around every page; only the content changes on
            navigation (portal foundations 3.1). Full-screen routes are left bare: components/portal/Shell.tsx. */}
        <Providers><PortalFrame>{children}</PortalFrame></Providers>
      </body>
    </html>
  );
}
