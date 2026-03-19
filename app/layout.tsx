import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "AIP Data Portal",
  description: "Aeronautical Information Publication data lookup",
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
    <html lang="en">
      <body className="min-h-screen bg-background font-sans">
        <script dangerouslySetInnerHTML={{ __html: bootstrapScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
