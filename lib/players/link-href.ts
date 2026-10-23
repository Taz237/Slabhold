import { playerSlugMightExist } from "./player-presence";
import { playerBaseSlug, playerHref } from "./slug";

/**
 * True when a slug built from this name still matches the stored spelling.
 * Plain ASCII letters, digits, spaces, and hyphens only, and every slug word
 * is a case-insensitive substring of the raw name. Accents, dots, and
 * apostrophes fail, because ilike cannot see through them.
 */
export function playerNameRoundTrips(name: string): boolean {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed || !/^[A-Za-z0-9 -]+$/.test(trimmed)) return false;
  const slug = playerBaseSlug(trimmed);
  if (!slug) return false;
  const haystack = trimmed.toLowerCase();
  return slug.split("-").every((word) => word.length > 0 && haystack.includes(word));
}

/**
 * /p link for a directory player, or for a raw name the page search can match.
 * Other names stay unlinked so a stripped slug cannot 404.
 */
export function linkedPlayerHref(name: string, sport?: string | null): string | null {
  const href = playerHref(name, sport);
  if (!href) return null;
  if (playerNameRoundTrips(name)) return href;
  const slug = href.slice("/p/".length);
  return playerSlugMightExist(slug) ? href : null;
}
