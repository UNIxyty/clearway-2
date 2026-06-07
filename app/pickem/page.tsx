import type { Metadata } from "next";
import { PickemApp } from "@/components/pickem/pickem-app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "World Cup 2026 Pickem | Clearway",
  description:
    "Make your FIFA World Cup 2026 predictions with group standings and match score picks, track live points, and compete on the Clearway Pickem leaderboard.",
  keywords: [
    "World Cup 2026 Pickem",
    "FIFA predictions",
    "football pickem",
    "group stage predictor",
    "match score predictions",
    "Clearway Pickem",
  ],
  alternates: {
    canonical: "https://clearway.verxyl.com/pickem",
  },
  openGraph: {
    title: "World Cup 2026 Pickem | Clearway",
    description:
      "Predict World Cup 2026 group standings and match scores, then follow live points and leaderboard rankings.",
    url: "https://clearway.verxyl.com/pickem",
    siteName: "Clearway",
    type: "website",
    images: [
      {
        url: "/PFP.png",
        width: 512,
        height: 512,
        alt: "Clearway Pickem",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "World Cup 2026 Pickem | Clearway",
    description:
      "Predict World Cup 2026 group standings and match scores, then follow live points and leaderboard rankings.",
    images: ["/PFP.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PickemPage() {
  return <PickemApp />;
}
