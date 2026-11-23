import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

const LANDING_STILLS = ["public/landing/screens/*.png", "public/landing/screens/*.webp", "public/landing/hero-card.jpg"];

/** The recordings in public/landing/screens, by file name, read once at build. */
function landingClips(): string {
  try {
    return readdirSync(join(process.cwd(), "public/landing/screens"))
      .filter((name) => name.endsWith(".mp4"))
      .sort()
      .join(",");
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  // Signed-out Home checks which real pictures exist, and reads their size,
  // when it renders (lib/landing/media.ts), so the stills travel with the two
  // routes that draw it. The recordings do not: the server never opens an
  // .mp4, it only needs to know which ones exist, and LANDING_CLIPS says so.
  outputFileTracingIncludes: {
    "/": LANDING_STILLS,
    "/welcome": LANDING_STILLS,
  },
  // Sharp is the self-hosted next/image optimizer (next start). On Vercel that
  // optimizer runs outside the function, and next/og uses bundled resvg when
  // sharp is absent. No route imports it at runtime.
  outputFileTracingExcludes: {
    "*": ["node_modules/sharp/**", "node_modules/@img/**", "public/landing/screens/*.mp4"],
  },
  // Collection tile photos, and the post photos on the signed-out landing
  // timeline. Both are uploaded under random UUID paths and never change, so
  // a long cache is safe. One quality and short
  // size lists keep the number of transformations small.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "knuwflptobyutrauxblj.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/card-photos/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "knuwflptobyutrauxblj.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/post-images/**",
        search: "",
      },
    ],
    qualities: [75],
    deviceSizes: [640, 828, 1200],
    imageSizes: [256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },
  // The push service worker must never be served stale, so a fix reaches
  // every installed app on its next open.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Universal links for the iOS app. No extension, so name the type.
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      {
        // One segment, so /p/:player/opengraph-image keeps its own image cache.
        // Unknown players must not sit on a year-long 404.
        source: "/p/:player",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/mail-day",
        destination: "/cards/new",
        permanent: false,
      },
      {
        source: "/mail-day/:path*",
        destination: "/cards/new",
        permanent: false,
      },
      // The updates account moved from /u/grokbotreview to /u/slabholdupdates.
      // The old profile 404s. This runs before the missing-profile rewrite.
      {
        source: "/u/grokbotreview",
        destination: "/u/slabholdupdates",
        permanent: true,
      },
      {
        source: "/u/grokbotreview/:path*",
        destination: "/u/slabholdupdates/:path*",
        permanent: true,
      },
    ];
  },
  env: {
    // Which recordings exist in public/landing/screens (lib/landing/media.ts).
    LANDING_CLIPS: landingClips(),
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || "",
    // Always inlined. Unset, Next leaves a runtime process.env read in the
    // client; "" lets a build with Quick Comp off drop its nav code.
    NEXT_PUBLIC_QUICK_COMP: process.env.NEXT_PUBLIC_QUICK_COMP === "1" ? "1" : "",
  },
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
