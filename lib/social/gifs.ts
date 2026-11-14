import { contentProblem } from "@/lib/safety/content-filter";

/**
 * One GIPHY GIF on a post or a reply. Stored on posts.gif / comments.gif.
 * It plays as a muted, looping mp4; `still` is the frame shown before it
 * plays and under Reduce Motion.
 */
export type PostGif = {
  id: string;
  mp4: string;
  still: string;
  width: number;
  height: number;
  title?: string;
};

export const GIF_ATTRIBUTION = "Powered by GIPHY";
export const GIFS_UNAVAILABLE = "GIFs aren't available yet. Post without the GIF.";

const GIF_ID = /^[A-Za-z0-9]{1,64}$/;
const GIPHY_HOST = /^(media[0-9]?|i)\.giphy\.com$/;
const GIPHY_PATH = /^\/[A-Za-z0-9_./-]+$/;
const GIPHY_QUERY = /^(\?[A-Za-z0-9_.=&%-]*)?$/;
const MAX_SIDE = 4096;

/** True for an https URL on GIPHY's media hosts with the right file type. Same rule as the database. */
export function isGiphyMediaUrl(value: unknown, kind: "mp4" | "still"): value is string {
  if (typeof value !== "string" || value.length > 600 || value.includes("..")) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
  if (!GIPHY_HOST.test(url.hostname)) return false;
  // Compare against the text as written, so nothing is hidden by URL normalising.
  if (value !== `https://${url.hostname}${url.pathname}${url.search}`) return false;
  if (!GIPHY_PATH.test(url.pathname) || !GIPHY_QUERY.test(url.search)) return false;
  return kind === "mp4" ? /\.mp4$/.test(url.pathname) : /\.(gif|jpg|png|webp)$/.test(url.pathname);
}

function side(value: unknown): number | null {
  const number = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return null;
  const rounded = Math.round(number);
  return rounded >= 1 && rounded <= MAX_SIDE ? rounded : null;
}

/** A stored or picked GIF we will render, or null. Unknown keys are dropped. */
export function sanitizeGif(value: unknown): PostGif | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const width = side(raw.width);
  const height = side(raw.height);
  if (typeof raw.id !== "string" || !GIF_ID.test(raw.id)) return null;
  if (!isGiphyMediaUrl(raw.mp4, "mp4") || !isGiphyMediaUrl(raw.still, "still")) return null;
  if (width === null || height === null) return null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
  return { id: raw.id, mp4: raw.mp4, still: raw.still, width, height, ...(title ? { title } : {}) };
}

type GiphyRendition = { mp4?: unknown; url?: unknown; webp?: unknown; width?: unknown; height?: unknown };

function rendition(images: Record<string, unknown>, name: string): GiphyRendition | null {
  const value = images[name];
  return value && typeof value === "object" ? (value as GiphyRendition) : null;
}

/**
 * One GIPHY API result as a PostGif. Null when it has no mp4 or still we accept.
 * Tries the smaller sizes first. When GIPHY sends no still frame, the size's own
 * webp or gif stands in for it.
 */
export function gifFromGiphy(item: unknown): PostGif | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as { id?: unknown; title?: unknown; images?: unknown };
  if (!raw.images || typeof raw.images !== "object") return null;
  const images = raw.images as Record<string, unknown>;
  for (const [motionName, stillName] of [
    ["fixed_width", "fixed_width_still"],
    ["fixed_height", "fixed_height_still"],
    ["original", "original_still"],
  ] as const) {
    const motion = rendition(images, motionName);
    if (!motion) continue;
    for (const still of [rendition(images, stillName)?.url, motion.webp, motion.url]) {
      const gif = sanitizeGif({
        id: raw.id,
        mp4: motion.mp4,
        still,
        width: motion.width,
        height: motion.height,
        title: raw.title,
      });
      if (gif) return gif;
    }
  }
  return null;
}

/** What a screen reader hears for a GIF. */
export function gifLabel(gif: PostGif): string {
  return gif.title ? `GIF: ${gif.title}` : "GIF";
}

/** A missing posts.gif or comments.gif column, before the migration is applied. */
export function gifColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code !== "PGRST204" && error.code !== "42703" && !/column/i.test(message)) return false;
  return /\bgif\b/i.test(message);
}

/**
 * The GIF as it is saved. GIPHY writes the title, not the poster, and the
 * database refuses a title with a blocked word. The poster cannot edit a
 * title, so such a title is left off and the post still saves.
 */
export function gifForSave(value: unknown): PostGif | null {
  const gif = sanitizeGif(value);
  if (!gif?.title || !contentProblem(gif.title)) return gif;
  const { title: _dropped, ...rest } = gif;
  void _dropped;
  return rest;
}
