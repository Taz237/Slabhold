export const BRAND_PURPLE = "#7C3AED";

export const webAppManifest = {
  name: "Slabhold",
  short_name: "Slabhold",
  description: "Sports card portfolio, flips, and a feed of collectors",
  start_url: "/",
  display: "standalone" as const,
  background_color: BRAND_PURPLE,
  theme_color: BRAND_PURPLE,
  icons: [
    {
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any" as const,
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any" as const,
    },
    {
      src: "/icons/icon-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable" as const,
    },
  ],
};
