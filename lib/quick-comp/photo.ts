import type { CleanedSale, TrawlSoldResult } from "@/lib/comps/types";

/** One photo of the card, from a sale we already matched. Never a new lookup. */
export type QuickCompPhoto = { url: string; itemId: string; soldAt: string };

/** The neutral slab drawn for sample comps. Served from /public, so no network beyond the app. */
export const SAMPLE_PHOTO_URL = "/quick-comp/sample-card.svg";
const PHOTO_HOST = "i.ebayimg.com";
const MAX_URL_LENGTH = 2048;

/**
 * The only gate between Trawl data and an <img src>: https on eBay's image
 * host exactly, or the sample path. Everything else is null.
 */
export function safePhotoUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url || url.length > MAX_URL_LENGTH) return null;
  if (url === SAMPLE_PHOTO_URL) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.host !== PHOTO_HOST) return null;
  if (parsed.username || parsed.password) return null;
  return parsed.href;
}

/** A photo from storage or the wire, checked again. Missing or bad is null. */
export function safePhoto(value: unknown): QuickCompPhoto | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const url = safePhotoUrl(row.url);
  if (!url || typeof row.itemId !== "string" || typeof row.soldAt !== "string") return null;
  return { url, itemId: row.itemId, soldAt: row.soldAt };
}

/** The sample photo, dated to the newest sample sale. */
export function samplePhoto(soldDates: string[]): QuickCompPhoto {
  const soldAt = soldDates.reduce((newest, date) => (time(date) > time(newest) ? date : newest), soldDates[0] ?? "");
  return { url: SAMPLE_PHOTO_URL, itemId: "sample", soldAt };
}

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GRADED_WORDS = /\b(?:PSA|BGS|SGC|CGC|TAG|HGA|graded)\b|slab/i;

function isRaw(grade: string): boolean {
  const text = grade.trim();
  return !text || /raw|ungraded|^none$/i.test(text);
}

/**
 * "PSA 10" → /\bPSA\s*10(?!\.?\d)/i. The lookahead keeps PSA 10 off PSA 100 and
 * BGS 9 off BGS 9.5. A grade with no number matches its grader alone.
 */
function gradeMatcher(grade: string): (title: string) => boolean {
  if (isRaw(grade)) return (title) => !GRADED_WORDS.test(title);
  const text = grade.trim().replace(/\s+/g, " ");
  const parts = text.match(/^(.*?)\s*(\d+(?:\.\d+)?)$/);
  const grader = (parts ? parts[1] : text).trim();
  const number = parts ? parts[2] : "";
  const pattern = number
    ? `${grader ? `\\b${escapeRegExp(grader)}\\s*` : "\\b"}${escapeRegExp(number)}(?!\\.?\\d)`
    : `\\b${escapeRegExp(grader)}\\b`;
  const regex = new RegExp(pattern, "i");
  return (title) => regex.test(title);
}

function resultPhotoUrl(result: TrawlSoldResult): string | null {
  const first = Array.isArray(result.details?.images) ? result.details.images[0] : null;
  return safePhotoUrl(first) ?? safePhotoUrl(result.image_url);
}

/**
 * One photo for the top of a Quick Comp. Only kept, matched sales count: a
 * dropped result may be another card. The newest sale whose title carries the
 * grade wins, then the newest kept sale with any photo, then null.
 */
export function pickQuickCompPhoto(
  sales: CleanedSale[],
  results: TrawlSoldResult[],
  grade: string,
): QuickCompPhoto | null {
  const urls = new Map<string, string>();
  for (const result of results) {
    if (!result || typeof result.item_id !== "string" || urls.has(result.item_id)) continue;
    const url = resultPhotoUrl(result);
    if (url) urls.set(result.item_id, url);
  }

  const withPhoto = sales
    .map((sale) => ({ sale, url: urls.get(sale.itemId) ?? null }))
    .filter((row): row is { sale: CleanedSale; url: string } => row.url != null)
    .sort((a, b) => time(b.sale.soldAt) - time(a.sale.soldAt));

  const matches = gradeMatcher(grade);
  const best = withPhoto.find((row) => matches(row.sale.title)) ?? withPhoto[0];
  return best ? { url: best.url, itemId: best.sale.itemId, soldAt: best.sale.soldAt } : null;
}
