import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { IMAGE_HEAD_BYTES, imageSize } from "@/lib/share/image-size";

/*
 * The landing page's real pictures, looked up on the server only (node:fs, so
 * it can't be bundled for the browser). The hero card photo and the iPhone
 * screens, each a file with an exact name under public/landing/. A screen is
 * a .png still; six of them can also have a short .mp4 recording of the same
 * name, and then the .png is the clip's poster. A slot with no .png is null
 * and the page draws nothing for it: no stand-in, no broken box. Dropping the
 * files in and redeploying fills a slot (see public/landing/screens/README.md).
 */

export const SCREENS_DIR = "landing/screens";

/** The hero's card photo. */
export const HERO_CARD_FILE = "landing/hero-card.jpg";

/** Used only when a file's own size can't be read: an iPhone screenshot. */
export const SCREEN_SIZE = { width: 1170, height: 2532 } as const;

/** `src` is the still (the clip's poster). `video` is the recording, when there is one. */
export type MediaSlot = { src: string; width: number; height: number; video: string | null };

/** Every screen slot and its still's file name (a .webp of the same name works too). */
export const SCREEN_FILES = {
  homeForYou: "home-for-you.png",
  homePost: "home-post.png",
  profileCards: "profile-cards.png",
  scanCamera: "scan-camera.png",
  scanReveal: "scan-reveal.png",
  cardSales: "card-sales.png",
  scanSales: "scan-sales.png",
  catalogFeed: "catalog-feed.png",
  collectionGrid: "collection-grid.png",
  collectionValue: "collection-value.png",
  leaderboard: "leaderboard.png",
  invite: "invite.png",
} as const;

export type ScreenKey = keyof typeof SCREEN_FILES;

/** The slots that play a recording when <name>.mp4 sits beside <name>.png. The rest are stills only. */
export const CLIP_KEYS: readonly ScreenKey[] = [
  "homeForYou",
  "scanReveal",
  "cardSales",
  "catalogFeed",
  "profileCards",
  "collectionValue",
];

export type LandingMedia = {
  heroCard: MediaSlot | null;
  screens: Record<ScreenKey, MediaSlot | null>;
};

const SCREEN_KEYS = Object.keys(SCREEN_FILES) as ScreenKey[];

function noScreens(): Record<ScreenKey, MediaSlot | null> {
  return Object.fromEntries(SCREEN_KEYS.map((key) => [key, null])) as Record<ScreenKey, MediaSlot | null>;
}

export const EMPTY_MEDIA: LandingMedia = { heroCard: null, screens: noScreens() };

/** The file's own pixel size, from its first bytes. */
function sizeOf(path: string): { width: number; height: number } | null {
  try {
    const file = openSync(path, "r");
    try {
      const head = Buffer.alloc(IMAGE_HEAD_BYTES);
      const read = readSync(file, head, 0, IMAGE_HEAD_BYTES, 0);
      return imageSize(head.subarray(0, read));
    } finally {
      closeSync(file);
    }
  } catch {
    return null;
  }
}

/**
 * Which slots have a real file right now. `root` is the project root (the
 * folder that holds public/); tests point it at a temp folder.
 */
export function landingMedia(root: string = process.cwd()): LandingMedia {
  const pub = join(/* turbopackIgnore: true */ root, "public");
  function slot(path: string, fallback: { width: number; height: number }): MediaSlot | null {
    const file = join(/* turbopackIgnore: true */ pub, path);
    if (!existsSync(file)) return null;
    return { src: `/${path}`, ...(sizeOf(file) ?? fallback), video: null };
  }

  // The deployed server has the stills but not the recordings (next.config.ts
  // keeps them out of the functions), so there it goes by the list made at
  // build. Anywhere else, and in tests, it looks at the folder.
  const built = root === process.cwd() ? process.env.LANDING_CLIPS : undefined;
  const hasClip = (path: string) =>
    built !== undefined ? built.split(",").includes(path.slice(SCREENS_DIR.length + 1)) : existsSync(join(/* turbopackIgnore: true */ pub, path));

  const screens = noScreens();
  for (const key of SCREEN_KEYS) {
    const png = `${SCREENS_DIR}/${SCREEN_FILES[key]}`;
    const still = slot(png, SCREEN_SIZE) ?? slot(png.replace(/\.png$/, ".webp"), SCREEN_SIZE);
    // A recording needs its still: the still is what paints before it plays, and all that shows with reduced motion.
    const mp4 = png.replace(/\.png$/, ".mp4");
    const clip = still && CLIP_KEYS.includes(key) && hasClip(mp4);
    screens[key] = still && clip ? { ...still, video: `/${mp4}` } : still;
  }
  return { heroCard: slot(HERO_CARD_FILE, { width: 774, height: 1200 }), screens };
}
