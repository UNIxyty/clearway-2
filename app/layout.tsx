import type { Metadata } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

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

  return (
    <html lang="en" className={`${publicSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-background font-sans">
        <script dangerouslySetInnerHTML={{ __html: bootstrapScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
