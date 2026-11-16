import { escapeIlike } from "@/lib/db/escape-ilike";
import { money } from "@/lib/format";
import { userHref } from "@/lib/social/user-href";
import { MOVING_SPORTS, normalizeSport, type MovingSport } from "@/lib/moving-today/sport";

export const CATALOG_PATH = "/catalog";
export const CATALOG_TITLE = "Slabhold Catalog";
export const CATALOG_API = "/api/catalog";
/** Shared by everyone: public cards only, nothing per viewer. */
export const CATALOG_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

/** Tiles per read. Two columns, so an even number. */
export const CATALOG_PAGE_SIZE = 24;
/** Longest search we send. Longer text is cut. */
export const CATALOG_SEARCH_MAX = 60;
/** Furthest a reader can scroll, so an offset can't be used to walk the whole table. */
export const CATALOG_MAX_OFFSET = 2400;

export const CATALOG_SPORTS = MOVING_SPORTS;
export type CatalogSport = MovingSport;

export const CATALOG_SORTS = [
  { id: "newest", label: "Newest" },
  { id: "liked", label: "Most liked" },
  { id: "graded", label: "Graded only" },
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number]["id"];

export type CatalogFilters = {
  sport: CatalogSport | null;
  sort: CatalogSort;
  q: string;
};

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = { sport: null, sort: "newest", q: "" };

/** One public card in the grid. Public fields only. */
export type CatalogTile = {
  id: string;
  href: string;
  player: string;
  yearLabel: string;
  setName: string;
  grade: string;
  grader: string;
  conditionType: "raw" | "graded" | null;
  isRookie: boolean;
  imageUrl: string | null;
  accent: string;
  sport: string;
  /** "" when we have no value. The tile then shows no price at all. */
  priceLabel: string;
};

export type CatalogPage = {
  tiles: CatalogTile[];
  /** Offset for the next read, or null at the end. */
  nextOffset: number | null;
};

type SearchValue = string | string[] | undefined | null;

function first(value: SearchValue): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parseCatalogSport(value: SearchValue): CatalogSport | null {
  return normalizeSport(first(value)) || null;
}

export function parseCatalogSort(value: SearchValue): CatalogSort {
  const sort = first(value).trim().toLowerCase();
  return CATALOG_SORTS.some((option) => option.id === sort) ? (sort as CatalogSort) : "newest";
}

/**
 * Letters, numbers, spaces and a few name marks only. Anything that could
 * change a PostgREST filter (commas, parens, quotes, wildcards) is dropped.
 */
export function cleanCatalogSearch(value: SearchValue): string {
  return first(value)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s'.&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CATALOG_SEARCH_MAX)
    .trim();
}

export function parseCatalogOffset(value: SearchValue): number {
  const n = Number.parseInt(first(value), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, CATALOG_MAX_OFFSET);
}

export function parseCatalogFilters(params: {
  sport?: SearchValue;
  sort?: SearchValue;
  q?: SearchValue;
}): CatalogFilters {
  return {
    sport: parseCatalogSport(params.sport),
    sort: parseCatalogSort(params.sort),
    q: cleanCatalogSearch(params.q),
  };
}

/** "?sport=football&sort=liked&q=prizm", leaving out defaults. */
export function catalogSearch(filters: CatalogFilters, offset = 0): string {
  const params = new URLSearchParams();
  if (filters.sport) params.set("sport", filters.sport);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  const q = cleanCatalogSearch(filters.q);
  if (q) params.set("q", q);
  if (offset > 0) params.set("offset", String(offset));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function sameCatalogFilters(a: CatalogFilters, b: CatalogFilters): boolean {
  return a.sport === b.sport && a.sort === b.sort && cleanCatalogSearch(a.q) === cleanCatalogSearch(b.q);
}

/** PostgREST `or`: player or set contains the search. Values quoted and escaped. */
export function catalogSearchOr(q: string): string {
  const clean = cleanCatalogSearch(q);
  if (!clean) return "";
  const pattern = `%${escapeIlike(clean)}%`.replace(/"/g, '""');
  return ["player", "set_name", "set"].map((column) => `${column}.ilike."${pattern}"`).join(",");
}

/** Pokemon and other TCG never show. Sports cards only. */
export function isTcgRow(row: { sport?: unknown; category?: unknown }): boolean {
  const text = [row.sport, row.category].filter((part) => typeof part === "string").join(" ");
  return /pok[eé]mon|\btcg\b|trading card game/i.test(text);
}

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A graded slab: the row says so, or a grading company is on it. */
export function rowIsGraded(row: Row): boolean {
  if (row.condition_type === "graded") return true;
  if (row.condition_type === "raw") return false;
  const grader = text(row.grader);
  return Boolean(grader) && !/^raw$/i.test(grader);
}

/** A positive estimated value as "$35.00". Anything else is "". */
export function catalogPriceLabel(value: unknown): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? money(n) : "";
}

/** A public_cards row and its owner's handle, as a tile. Null when it can't link. */
export function catalogTileFromRow(row: Row, username: string): CatalogTile | null {
  const id = text(row.id);
  if (!id || !username) return null;
  const yearLabel = text(row.year_label) || (row.year != null && row.year !== "" ? String(row.year) : "");
  const grader = text(row.grader);
  const gradeText = text(row.grade);
  const graded = rowIsGraded(row);
  return {
    id,
    href: `${userHref(username)}/cards/${encodeURIComponent(id)}`,
    player: text(row.player) || "Card",
    yearLabel,
    setName: text(row.set_name) || text(row.set),
    grade: graded ? [grader, gradeText].filter(Boolean).join(" ") : gradeText,
    grader,
    conditionType: row.condition_type === "raw" || row.condition_type === "graded" ? row.condition_type : graded ? "graded" : null,
    isRookie: row.is_rookie === true,
    imageUrl: text(row.image_url) || null,
    accent: text(row.accent) || "#7c5cff",
    sport: text(row.sport).toLowerCase(),
    priceLabel: catalogPriceLabel(row.estimated_value),
  };
}

/** Likes per card: a post's likes count for every card it shows. */
export function likesByCard(
  posts: { id: string; likes: number; cardId: string | null }[],
  links: { postId: string; cardId: string }[],
): Map<string, number> {
  const cardsByPost = new Map<string, Set<string>>();
  for (const post of posts) {
    if (post.cardId) cardsByPost.set(post.id, new Set([post.cardId]));
  }
  for (const link of links) {
    const set = cardsByPost.get(link.postId) ?? new Set<string>();
    set.add(link.cardId);
    cardsByPost.set(link.postId, set);
  }
  const totals = new Map<string, number>();
  for (const post of posts) {
    if (!(post.likes > 0)) continue;
    for (const cardId of cardsByPost.get(post.id) ?? []) {
      totals.set(cardId, (totals.get(cardId) ?? 0) + post.likes);
    }
  }
  return totals;
}

/** Most likes first; a tie goes to the newer card. */
export function rankByLikes<T extends { id: string; createdAt: string }>(
  items: T[],
  likes: Map<string, number>,
): T[] {
  return [...items].sort((a, b) => {
    const diff = (likes.get(b.id) ?? 0) - (likes.get(a.id) ?? 0);
    if (diff !== 0) return diff;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Adds a page to the grid, skipping any card already shown (offsets drift when cards are added). */
export function appendCatalogTiles(current: CatalogTile[], next: CatalogTile[]): CatalogTile[] {
  const seen = new Set(current.map((tile) => tile.id));
  const out = [...current];
  for (const tile of next) {
    if (seen.has(tile.id)) continue;
    seen.add(tile.id);
    out.push(tile);
  }
  return out;
}

/** "Victor Wembanyama, 2023-24 Prizm, PSA 10, $200.00". */
export function catalogTileName(tile: CatalogTile): string {
  const line = [tile.yearLabel, tile.setName].filter(Boolean).join(" ");
  return [tile.player, line, tile.conditionType === "graded" ? tile.grade : "", tile.priceLabel]
    .filter(Boolean)
    .join(", ");
}

export function catalogNoMatchText(filters: CatalogFilters): string {
  const sport = filters.sport ? CATALOG_SPORTS.find((option) => option.id === filters.sport)?.label : null;
  if (filters.q) return `No cards match "${filters.q}"`;
  if (filters.sort === "liked") return sport ? `No liked ${sport.toLowerCase()} cards yet` : "No liked cards yet";
  if (filters.sort === "graded") return sport ? `No graded ${sport.toLowerCase()} cards yet` : "No graded cards yet";
  return sport ? `No ${sport.toLowerCase()} cards yet` : "No cards yet";
}

export function catalogFiltersActive(filters: CatalogFilters): boolean {
  return !sameCatalogFilters(filters, DEFAULT_CATALOG_FILTERS);
}
