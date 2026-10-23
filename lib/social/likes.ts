import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/value/card-value-access";
import type { Post, PostLike } from "./types";

/** Prefix for the per-account flag. The stored key is `likes_migrated_v1:<userId>`. */
export const LIKES_MIGRATED_KEY = "likes_migrated_v1";

/** Matches migrate_local_likes, which rejects a larger batch. */
export const LIKE_MIGRATION_BATCH = 100;

export function likesMigratedStorageKey(userId: string): string {
  return `${LIKES_MIGRATED_KEY}:${userId}`;
}

export function likesMigratedFlag(userId: string | null | undefined): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    return window.localStorage.getItem(likesMigratedStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markLikesMigrated(userId: string): void {
  window.localStorage.setItem(likesMigratedStorageKey(userId), "1");
}

export function readLikeCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
  }
  return undefined;
}

export function missingLikeCountColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (error.code === "42703" || error.code === "PGRST204") && /like_count/i.test(message);
}

export function missingLikesRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

function missingMigrateRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /migrate_local_likes/i.test(error.message ?? "")
  );
}

/**
 * Post ids from this account's on-device likes. Other accounts on the same
 * browser are left alone. Ids that are not uuids are dropped.
 */
export function likeIdsToMigrate(likes: readonly PostLike[], userId: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const like of likes) {
    if (like.userId !== userId) continue;
    if (!isUuid(like.postId) || seen.has(like.postId)) continue;
    seen.add(like.postId);
    ids.push(like.postId);
  }
  return ids;
}

export function likeBatches<T>(items: readonly T[], size = LIKE_MIGRATION_BATCH): T[][] {
  const step = Math.max(1, size);
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += step) {
    out.push(items.slice(index, index + step));
  }
  return out;
}

export function optimisticLikeCount(base: number, nextLiked: boolean): number {
  return Math.max(0, base + (nextLiked ? 1 : -1));
}

/**
 * TODO: remove the localStorage likes fallback in 2 weeks (after 2026-11-06).
 * Until then, device likes fill in when the server list is not ready yet.
 */
export function unionLikes(
  server: readonly PostLike[],
  local: readonly PostLike[],
  userId: string | null,
): PostLike[] {
  if (!userId) return [...server];
  const seen = new Set(server.filter((like) => like.userId === userId).map((like) => like.postId));
  const extra = local.filter(
    (like) => like.userId === userId && isUuid(like.postId) && !seen.has(like.postId),
  );
  return [...server, ...extra];
}

/**
 * `likes === null` means the table is not there yet, so leave hearts to the
 * device fallback. After migration, posts the viewer did not like are explicit.
 */
export function applyViewerLikes(
  posts: readonly Post[],
  likes: readonly PostLike[] | null,
  userId: string | null,
  migrated: boolean,
): Post[] {
  if (!userId || likes === null) return [...posts];
  const liked = new Set(likes.filter((like) => like.userId === userId).map((like) => like.postId));
  return posts.map((post) => {
    if (liked.has(post.id)) return { ...post, viewerLiked: true };
    if (migrated) return { ...post, viewerLiked: false };
    return post;
  });
}

export function applyLikeCounts(posts: readonly Post[], counts: ReadonlyMap<string, number> | null): Post[] {
  if (!counts) return [...posts];
  return posts.map((post) => {
    const count = counts.get(post.id);
    return typeof count === "number" ? { ...post, likeCount: count } : post;
  });
}

/** One "did I like these" read. Null when the likes table is not installed yet. */
export async function loadViewerLikes(
  supabase: SupabaseClient,
  userId: string | null,
  postIds: readonly string[],
): Promise<PostLike[] | null> {
  const ids = [...new Set(postIds)].filter((id) => isUuid(id));
  if (!userId || !isUuid(userId) || ids.length === 0) return [];
  const { data, error } = await supabase
    .from("likes")
    .select("post_id, user_id, created_at")
    .eq("user_id", userId)
    .in("post_id", ids);
  if (error) {
    if (missingLikesRelation(error)) return null;
    throw new Error(error.message);
  }
  return ((data ?? []) as { post_id: string; user_id: string; created_at: string }[]).map(
    (row): PostLike => ({
      postId: row.post_id,
      userId: row.user_id,
      createdAt: row.created_at,
    }),
  );
}

export async function loadLikeCounts(
  supabase: SupabaseClient,
  postIds: readonly string[],
): Promise<Map<string, number> | null> {
  const ids = [...new Set(postIds)].filter((id) => isUuid(id));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("posts").select("id, like_count").in("id", ids);
  if (error) {
    if (missingLikeCountColumn(error)) return null;
    throw new Error(error.message);
  }
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { id: string; like_count: unknown }[]) {
    const count = readLikeCount(row.like_count);
    if (typeof count === "number") counts.set(row.id, count);
  }
  return counts;
}

export async function migrateStoredLikes(
  supabase: SupabaseClient,
  userId: string,
  likes: readonly PostLike[],
): Promise<{ ok: true; inserted: string[] } | { ok: false; error: string }> {
  const inserted: string[] = [];
  for (const batch of likeBatches(likeIdsToMigrate(likes, userId))) {
    const { data, error } = await supabase.rpc("migrate_local_likes", { post_ids: batch });
    if (error) {
      if (missingMigrateRpc(error)) return { ok: false, error: error.message };
      return { ok: false, error: error.message };
    }
    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      if (typeof row === "string" && isUuid(row)) {
        inserted.push(row);
        continue;
      }
      if (row && typeof row === "object" && "post_id" in row) {
        const id = (row as { post_id?: unknown }).post_id;
        if (typeof id === "string" && isUuid(id)) inserted.push(id);
      }
    }
  }
  return { ok: true, inserted };
}
