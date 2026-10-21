import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { CaptureUtm } from "@/components/capture-utm";
import { WebAnalytics } from "@/components/web-analytics";
import { SITE_URL } from "@/lib/site-url";
import { CollectionProvider } from "@/components/collection-provider";
import { ImageLightboxProvider } from "@/components/image-lightbox";
import { SocialProvider } from "@/components/social-provider";
import { BRAND_PURPLE } from "@/lib/pwa/manifest";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    >
      <body className="min-h-full font-sans">
        <ImageLightboxProvider>
          <SocialProvider>
            <CollectionProvider>
              <AppShell>{children}</AppShell>
            </CollectionProvider>
          </SocialProvider>
        </ImageLightboxProvider>
        <CaptureUtm />
        <WebAnalytics />
      </body>
    </html>
  );
}
