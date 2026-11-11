import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CaptureUtm } from "@/components/capture-utm";
import { NativeBoot } from "@/components/native/native-boot";
import { WebAnalytics } from "@/components/web-analytics-lazy";
import { SITE_URL } from "@/lib/site-url";
import { SESSION_HINT_SCRIPT } from "@/lib/auth/session-hint";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// Mono for numbers and short tags. Preloaded: they are above the fold on most screens.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "./" },
  title: "Slabhold",
  description: "Comp your sports cards with recent sold prices, track your collection, and talk cards with collectors who get it.",
  applicationName: "Slabhold",
  // Safari's Smart App Banner for the iOS app. Safari only, so never inside the app.
  itunes: { appId: "6831357026" },
  appleWebApp: {
    capable: true,
    title: "Slabhold",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Slabhold",
    description: "Comp your sports cards with recent sold prices, track your collection, and talk cards with collectors who get it.",
    siteName: "Slabhold",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Slabhold",
    description: "Comp your sports cards with recent sold prices, track your collection, and talk cards with collectors who get it.",
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
        <NativeBoot />
        <WebAnalytics />
      </body>
    </html>
  );
}
