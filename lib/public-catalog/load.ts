import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cleanImageUrl } from "@/lib/social/link-preview";
import { hiddenMovingOwner } from "@/lib/moving-today/present";
import {
  CATALOG_PAGE_SIZE,
  catalogSearchOr,
  catalogTileFromRow,
  isTcgRow,
  likesByCard,
  rankByLikes,
  rowIsGraded,
  type CatalogFilters,
  type CatalogPage,
  type CatalogTile,
} from "./query";

/** Only public_cards columns. Never price paid, never private rows. */
export const CATALOG_COLUMNS =
  "id, user_id, player, year, year_label, set, set_name, grade, grader, condition_type, is_rookie, image_url, accent, sport, category, estimated_value, created_at";

/** Graded slabs, including older rows with no condition_type but a grading company. */
export const GRADED_OR =
  "condition_type.eq.graded,and(condition_type.is.null,grader.not.is.null,grader.not.ilike.raw)";

/** Most-liked looks at this many liked posts, most liked first. */
const LIKED_POST_LIMIT = 1000;
/** And ranks at most this many cards. */
const LIKED_CARD_LIMIT = 600;
const IN_CHUNK = 80;
export const CATALOG_LIKES_CACHE_SECONDS = 300;

type Row = Record<string, unknown>;
type Admin = NonNullable<ReturnType<typeof createSupabaseAdmin>>;
type Result = { data: unknown[] | null; error: { message: string } | null };

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function rowsOf(result: Result): Row[] {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as Row[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

/** Sport, search and graded filters on a public_cards read. */
export function applyCatalogFilters(query: Query, filters: CatalogFilters): Query {
  let next = query;
  if (filters.sport) next = next.ilike("sport", filters.sport);
  const search = catalogSearchOr(filters.q);
  const graded = filters.sort === "graded";
  if (search && graded) next = next.or(`and(or(${search}),or(${GRADED_OR}))`);
  else if (search) next = next.or(search);
  else if (graded) next = next.or(GRADED_OR);
  return next;
}

async function readHandles(admin: Admin, userIds: string[]): Promise<Map<string, string>> {
  const handles = new Map<string, string>();
  const groups = chunks([...new Set(userIds)], IN_CHUNK);
  const read = async (columns: string) =>
    Promise.all(groups.map((group) => admin.from("profiles").select(columns).in("id", group)));
  let results = (await read("id, username, is_test")) as Result[];
  // An older database without profiles.is_test reads handles only.
  if (results.some((result) => /is_test/i.test(result.error?.message ?? ""))) {
    results = (await read("id, username")) as Result[];
  }
  for (const result of results) {
    for (const row of rowsOf(result)) {
      const id = text(row.id);
      const username = text(row.username);
      if (!id || !username) continue;
      if (hiddenMovingOwner({ username, isTest: row.is_test === true })) continue;
      handles.set(id, username);
    }
  }
  return handles;
}

/** Rows to tiles: drops TCG, test owners, and anything a filter should have caught. */
async function toTiles(admin: Admin, rows: Row[], filters: CatalogFilters): Promise<CatalogTile[]> {
  const kept = rows.filter((row) => !isTcgRow(row) && (filters.sort !== "graded" || rowIsGraded(row)));
  const handles = await readHandles(
    admin,
    kept.map((row) => text(row.user_id)).filter(Boolean),
  );
  const tiles: CatalogTile[] = [];
  for (const row of kept) {
    const tile = catalogTileFromRow(row, handles.get(text(row.user_id)) ?? "");
    if (!tile) continue;
    tiles.push({ ...tile, imageUrl: tile.imageUrl ? cleanImageUrl(tile.imageUrl) : null });
  }
  return tiles;
}

/** Likes per card from liked, visible posts. Returned as pairs so it can be cached. */
export async function readCardLikes(admin: Admin | null = createSupabaseAdmin()): Promise<[string, number][]> {
  if (!admin) return [];
  const posts = rowsOf(
    (await admin
      .from("posts")
      .select("id, like_count, card_id:card->>id")
      .gt("like_count", 0)
      .is("hidden_at", null)
      .order("like_count", { ascending: false })
      .limit(LIKED_POST_LIMIT)) as Result,
  ).flatMap((row) => {
    const id = text(row.id);
    const likes = typeof row.like_count === "number" ? row.like_count : Number(row.like_count);
    return id && Number.isFinite(likes) ? [{ id, likes, cardId: text(row.card_id) || null }] : [];
  });
  if (posts.length === 0) return [];
  const linkResults = (await Promise.all(
    chunks(posts.map((post) => post.id), IN_CHUNK).map((group) =>
      admin.from("post_cards").select("post_id, card_id").in("post_id", group),
    ),
  )) as Result[];
  const links = linkResults.flatMap(rowsOf).flatMap((row) => {
    const postId = text(row.post_id);
    const cardId = text(row.card_id);
    return postId && cardId ? [{ postId, cardId }] : [];
  });
  return [...likesByCard(posts, links).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIKED_CARD_LIMIT);
}

/**
 * One page of the catalog. Newest and Graded page through public_cards by
 * created_at. Most liked ranks the cards in liked posts, then pages that list.
 * Tests pass a fake `admin` and `likes`.
 */
export async function readCatalogPage(
  filters: CatalogFilters,
  offset: number,
  admin: Admin | null = createSupabaseAdmin(),
  likes?: [string, number][],
): Promise<CatalogPage> {
  if (!admin) return { tiles: [], nextOffset: null };

  if (filters.sort === "liked") {
    const pairs = likes ?? (await getCardLikes());
    const likeMap = new Map(pairs);
    const ids = pairs.map(([id]) => id);
    if (ids.length === 0) return { tiles: [], nextOffset: null };
    const results = (await Promise.all(
      chunks(ids, IN_CHUNK).map((group) =>
        applyCatalogFilters(admin.from("public_cards").select(CATALOG_COLUMNS).in("id", group), filters),
      ),
    )) as Result[];
    const rows = rankByLikes(
      results.flatMap(rowsOf).map((row) => ({ ...row, id: text(row.id), createdAt: text(row.created_at) })),
      likeMap,
    );
    const slice = rows.slice(offset, offset + CATALOG_PAGE_SIZE);
    const end = offset + CATALOG_PAGE_SIZE;
    return { tiles: await toTiles(admin, slice, filters), nextOffset: end < rows.length ? end : null };
  }

  const result = (await applyCatalogFilters(
    admin.from("public_cards").select(CATALOG_COLUMNS),
    filters,
  )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + CATALOG_PAGE_SIZE - 1)) as Result;
  const rows = rowsOf(result);
  return {
    tiles: await toTiles(admin, rows, filters),
    nextOffset: rows.length === CATALOG_PAGE_SIZE ? offset + CATALOG_PAGE_SIZE : null,
  };
}

/** The like ranking, shared for five minutes. */
export async function getCardLikes(): Promise<[string, number][]> {
  return unstable_cache(() => readCardLikes(), ["catalog-card-likes-v1"], {
    revalidate: CATALOG_LIKES_CACHE_SECONDS,
  })();
}
