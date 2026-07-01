import type { Metadata, Viewport } from "next";
import { Newsreader, Hanken_Grotesk, Space_Mono } from "next/font/google";
import { RumSnippet } from "@/components/RumSnippet";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
  // Next.js has no fallback-metric override data for Newsreader, which emits a build-time
  // "Failed to find font override values" warning. The auto-adjusted fallback can't be
  // generated anyway, so opt out explicitly — silences the warning, no behavior change.
  adjustFontFallback: false,
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const DESCRIPTION =
  "An AI climbing guide for your song: a genre-aware craft grade, your Top 3 fixes, and the route to the summit.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d0a06",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Cumbre — Get your song to the summit",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Cumbre",
    title: "Cumbre — Get your song to the summit",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Cumbre — Get your song to the summit",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${hanken.variable} ${spaceMono.variable}`}>
      <body>
        <RumSnippet />
        {children}
      </body>
    </html>
  );
}
