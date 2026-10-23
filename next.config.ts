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
  async headers() {
    return [
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
