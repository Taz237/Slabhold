export const BRAND_PURPLE = "#7C3AED";

export const webAppManifest = {
  name: "Slabhold",
  short_name: "Slabhold",
  description: "Comp any sports card, track your collection and follow the collectors who get it",
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
