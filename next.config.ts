import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sharp is the self-hosted next/image optimizer (next start). On Vercel that
  // optimizer runs outside the function, and next/og uses bundled resvg when
  // sharp is absent. No route imports it. The landing screenshot is read from
  // disk at build time and otherwise fetched from the public production origin,
  // so it is not part of any function bundle.
  outputFileTracingExcludes: {
    "*": ["node_modules/sharp/**", "node_modules/@img/**", "public/landing/2.png"],
  },
  // Card photos and small avatar copies. Both are uploaded under random UUID
  // paths and never change, so a long cache is safe. One quality and short
  // size lists keep the number of transformations small. AVIF first, WebP
  // for browsers without it.
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
        pathname: "/storage/v1/object/public/avatars/**",
        search: "",
      },
    ],
    formats: ["image/avif", "image/webp"],
    qualities: [75],
    deviceSizes: [640, 828, 1200],
    // 96 is for avatars (lib/ui/avatar-src.ts).
    imageSizes: [96, 256, 384],
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
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || "",
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
