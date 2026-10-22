import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
