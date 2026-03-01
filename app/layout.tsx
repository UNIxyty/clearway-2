import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIP Data Portal",
  description: "Aeronautical Information Publication data lookup",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans">{children}</body>
    </html>
  );
}
