import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CaptureUtm } from "@/components/capture-utm";
import { WebAnalytics } from "@/components/web-analytics-lazy";
import { SITE_URL } from "@/lib/site-url";
import { BRAND_PURPLE } from "@/lib/pwa/manifest";
import { SESSION_HINT_SCRIPT } from "@/lib/auth/session-hint";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// Small uppercase tags. Preloaded: they are above the fold on most screens.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: BRAND_PURPLE,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "./" },
  title: "Slabhold",
  description: "Sports card portfolio, flips, and a feed of collectors",
  applicationName: "Slabhold",
  appleWebApp: {
    capable: true,
    title: "Slabhold",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Slabhold",
    description: "Sports card portfolio, flips, and a feed of collectors",
    siteName: "Slabhold",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Slabhold",
    description: "Sports card portfolio, flips, and a feed of collectors",
  },
  icons: {
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The session hint below tags <html> before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SESSION_HINT_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        {/* The app's providers and shell live in app/(app)/layout.tsx, so the
            signed-out landing page (app/welcome) ships none of them. */}
        {children}
        <CaptureUtm />
        <WebAnalytics />
      </body>
    </html>
  );
}
