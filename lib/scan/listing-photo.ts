import type { TrawlSoldResult } from "@/lib/comps/types";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { safePhotoUrl } from "@/lib/quick-comp/photo";
import { scanCompGrade } from "./comp";
import type { ScanMatch } from "./match";
import { readRawCardText } from "./raw-text";
import { scanSalesFor } from "./scan-sales";
import { setMatchPhrase } from "@/lib/comps/match";

/**
 * A small photo of this exact card, from a sold listing the scan's own search already returned.
 * Never a new lookup, never stored: the URL points at the listing's image on eBay's image host.
 * No listing of this exact card (same set, same card #) means no photo, never another card's.
 * No link to the listing either: a sold listing is often taken down, and we can't confirm it is
 * still up, so we never send anyone to a dead page.
 */
export type ListingPhoto = {
  imageUrl: string;
  soldAt: string | null;
};

/** A photo from the wire, checked again before it reaches an <img>. */
export function safeListingPhoto(value: unknown): ListingPhoto | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const imageUrl = safePhotoUrl(row.imageUrl);
  if (!imageUrl) return null;
  return { imageUrl, soldAt: typeof row.soldAt === "string" ? row.soldAt : null };
}

function imageOf(result: TrawlSoldResult): string | null {
  const first = Array.isArray(result.details?.images) ? result.details.images[0] : null;
  return safePhotoUrl(first) ?? safePhotoUrl(result.image_url);
}

/** The title names this set ("2026-27 Topps … RC-3" for Topps). A title naming no set, or another one, is not confirmed. */
function titleNamesSet(title: string, setBrand: string, directory: readonly IndexedDirectoryPlayer[]): boolean {
  const named = readRawCardText([title], directory).setNames[0] ?? "";
  const phrase = setMatchPhrase(setBrand);
  return Boolean(named && phrase) && setMatchPhrase(named) === phrase;
}

const sameParallel = (left: string, right: string) => left.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === right.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The newest sold listing that is this exact card and has a photo: the same player, card #, print
 * run and grade (the scan's own sales filter), a title that names the same set, and the same
 * parallel. A card with its set or card # open gets none: we can't tell a listing is this card. A
 * card with its parallel open only takes a Base listing, and only when it isn't numbered: any other
 * photo could be another parallel.
 */
export function listingPhotoFor(
  match: ScanMatch,
  results: readonly TrawlSoldResult[],
  directory: readonly IndexedDirectoryPlayer[],
): ListingPhoto | null {
  if (results.length === 0 || !match.playerName || !match.setBrand.trim() || !match.cardNumber.trim()) return null;
  const { kept } = scanSalesFor(match, { grade: scanCompGrade(match), setBrand: match.setBrand, parallel: match.parallel }, results, directory);
  const wanted = match.parallel || (match.serialRun == null && !match.isAuto && !match.subset ? "Base" : "");
  if (!wanted) return null;
  const byId = new Map(results.map((result) => [result.item_id, result]));
  const newestFirst = kept.filter((sale) => sameParallel(sale.parallel, wanted)).sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""));
  for (const sale of newestFirst) {
    const result = byId.get(sale.itemId);
    const imageUrl = result ? imageOf(result) : null;
    if (!result || !imageUrl || !titleNamesSet(result.title, match.setBrand, directory)) continue;
    return { imageUrl, soldAt: sale.soldAt };
  }
  return null;
}

/** Each match with its listing photo, when the search returned one for that exact card. */
export function withListingPhotos(
  matches: readonly ScanMatch[],
  results: readonly TrawlSoldResult[],
  directory: readonly IndexedDirectoryPlayer[],
): ScanMatch[] {
  return matches.map((match) => {
    const listing = listingPhotoFor(match, results, directory);
    return listing ? { ...match, listing } : match;
  });
}
