import type { TrawlSoldResult } from "@/lib/comps/types";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { safePhotoUrl } from "@/lib/quick-comp/photo";
import { scanCompGrade } from "./comp";
import type { ScanMatch } from "./match";
import { scanSalesFor } from "./scan-sales";

/**
 * A small photo of this exact card, from a sold listing the scan's own search already returned.
 * Never a new lookup, never stored: the URL points at the listing's image on eBay's image host,
 * and the link at the listing. No listing of this exact card means no photo, never another card's.
 */
export type ListingPhoto = {
  imageUrl: string;
  /** The listing, or null when the result carried no usable link. */
  url: string | null;
  soldAt: string | null;
};

const MAX_URL_LENGTH = 2048;

/** A link to an eBay listing: https on ebay.com or one of its subdomains. Anything else is null. */
export function safeListingUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url || url.length > MAX_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  if (parsed.hostname !== "ebay.com" && !parsed.hostname.endsWith(".ebay.com")) return null;
  return parsed.href;
}

/** A photo from the wire, checked again before it reaches an <img>. */
export function safeListingPhoto(value: unknown): ListingPhoto | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const imageUrl = safePhotoUrl(row.imageUrl);
  if (!imageUrl) return null;
  return { imageUrl, url: safeListingUrl(row.url), soldAt: typeof row.soldAt === "string" ? row.soldAt : null };
}

function imageOf(result: TrawlSoldResult): string | null {
  const first = Array.isArray(result.details?.images) ? result.details.images[0] : null;
  return safePhotoUrl(first) ?? safePhotoUrl(result.image_url);
}

const sameParallel = (left: string, right: string) => left.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === right.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The newest sold listing that is this exact card and has a photo: the same player, card #, print
 * run and grade (the scan's own sales filter), and the same parallel. A card with its parallel open
 * only takes a Base listing, and only when it isn't numbered: any other photo could be another parallel.
 */
export function listingPhotoFor(
  match: ScanMatch,
  results: readonly TrawlSoldResult[],
  directory: readonly IndexedDirectoryPlayer[],
): ListingPhoto | null {
  if (results.length === 0 || !match.playerName) return null;
  const { kept } = scanSalesFor(match, { grade: scanCompGrade(match), setBrand: match.setBrand, parallel: match.parallel }, results, directory);
  const wanted = match.parallel || (match.serialRun == null && !match.isAuto && !match.subset ? "Base" : "");
  if (!wanted) return null;
  const byId = new Map(results.map((result) => [result.item_id, result]));
  const newestFirst = kept.filter((sale) => sameParallel(sale.parallel, wanted)).sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""));
  for (const sale of newestFirst) {
    const result = byId.get(sale.itemId);
    const imageUrl = result ? imageOf(result) : null;
    if (!result || !imageUrl) continue;
    return { imageUrl, url: safeListingUrl(result.item_link) ?? safeListingUrl(result.details?.item_link), soldAt: sale.soldAt };
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
