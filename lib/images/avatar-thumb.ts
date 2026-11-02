import { CARD_PHOTO_ORIGIN } from "@/lib/collection/grid";

/** Where uploadMedia puts avatars: `<origin>/storage/v1/object/public/avatars/<user>/<file>`. */
const AVATAR_OBJECT = "/storage/v1/object/public/avatars/";
/** Supabase's image transformation endpoint for the same object. */
const AVATAR_RENDER = "/storage/v1/render/image/public/avatars/";

/**
 * A small square of one of our own avatars, cut by Supabase's render endpoint
 * (`size` is in device pixels, so pass twice the drawn size). Any other
 * address, or one that already carries a query, is returned unchanged.
 */
export function avatarThumbSrc(url: string, size: number): string {
  if (!Number.isInteger(size) || size <= 0) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  // Our host, the avatars bucket, no query or hash, and already in canonical
  // form, so no `..` the URL parser would fold into another bucket.
  if (url.includes("?") || url.includes("#") || parsed.href !== url) return url;
  if (!url.startsWith(`${CARD_PHOTO_ORIGIN}${AVATAR_OBJECT}`)) return url;
  const file = parsed.pathname.slice(AVATAR_OBJECT.length);
  if (!file || /%2e/i.test(file) || file.split("/").some((part) => part === "" || part === "." || part === "..")) {
    return url;
  }
  return `${CARD_PHOTO_ORIGIN}${AVATAR_RENDER}${file}?width=${size}&height=${size}&resize=cover`;
}
