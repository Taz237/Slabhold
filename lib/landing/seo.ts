/** Signed-out Home's title and description: the page, Open Graph and Twitter all say the same. */
export const LANDING_TITLE = "Slabhold: the sports card timeline, collection and scanner";

export const LANDING_DESCRIPTION =
  "Talk cards with collectors, show off your collection, and see what cards really sold for. Scan a card or slab to add it.";

/**
 * A page that sets its own openGraph or twitter replaces the root layout's
 * whole object, file-based images included. So the share image is named here,
 * and both landing routes use these two as they are.
 */
export const LANDING_OPEN_GRAPH = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  siteName: "Slabhold",
  type: "website",
  images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Slabhold" }],
} as const;

export const LANDING_TWITTER = {
  card: "summary_large_image",
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  images: ["/twitter-image"],
} as const;
