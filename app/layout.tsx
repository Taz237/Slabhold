import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { CollectionProvider } from "@/components/collection-provider";
import { ImageLightboxProvider } from "@/components/image-lightbox";
import { SocialProvider } from "@/components/social-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function metadataBaseUrl(): URL {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, "").trim();
  if (production) return new URL(`https://${production}`);
  const current = process.env.VERCEL_URL?.replace(/^https?:\/\//, "").trim();
  if (current) return new URL(`https://${current}`);
  return new URL("https://slabhold.vercel.app");
}

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  title: "Slabhold",
  description: "Sports card portfolio, flips, and a feed of collectors",
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
      </body>
    </html>
  );
}
