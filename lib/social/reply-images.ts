import type { SupabaseClient } from "@supabase/supabase-js";
import { isRenderablePostPhoto, normalizePostPhotos } from "./post-photos";
import type { PostComment } from "./types";

/** Same cap as a normal post. */
export const MAX_REPLY_PHOTOS = 4;

export const REPLY_PHOTOS_UNAVAILABLE = "Reply photos aren't available yet.";

export const OPTIMISTIC_REPLY_PREFIX = "optimistic-reply-";

const COMMENT_COLUMNS = "id, post_id, user_id, body, created_at";
export const COMMENT_COLUMNS_WITH_IMAGES = `${COMMENT_COLUMNS}, image_urls`;

export function replyImageColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code !== "PGRST204" && error.code !== "42703" && !/column/i.test(message)) return false;
  return /image_urls/i.test(message);
}

let replyImages: boolean | null = null;

export function noteReplyImagesMissing() {
  replyImages = false;
}

export function resetReplyImageSupport() {
  replyImages = null;
}

export function replyImagesKnownMissing(): boolean {
  return replyImages === false;
}

/** True when comments.image_urls can be written. A missing column turns the button off. */
export async function commentsSupportReplyImages(supabase: SupabaseClient): Promise<boolean> {
  if (replyImages != null) return replyImages;
  const { error } = await supabase.from("comments").select("image_urls").limit(1);
  if (!error) {
    replyImages = true;
    return true;
  }
  replyImages = !replyImageColumnMissing(error);
  return replyImages;
}

export function replyImagesFromValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return normalizePostPhotos(
    value.filter((item): item is string => typeof item === "string" && isRenderablePostPhoto(item)),
  );
}

/** Text preview, or "Photo" when the reply is pictures only. */
export function replyNoticePreview(body: string, images?: readonly string[] | null): string | null {
  const text = body.trim();
  const clipped = text.length > 80 ? `${text.slice(0, 77)}…` : text;
  if (clipped) return clipped;
  return images && images.length > 0 ? "Photo" : null;
}

export function replyNotificationImages(images: readonly string[]): string[] {
  return images.filter((url) => url.startsWith("https://") || url.startsWith("http://"));
}

export function imagesFromNoticeMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  return replyImagesFromValue((metadata as { images?: unknown }).images);
}

/**
 * Photos for one notification. The likes insert rule rejects comment metadata,
 * so the match is the reply this actor wrote closest to the notice time.
 * A later photo reply does not replace an earlier one.
 */
export function imagesForReplyNotice(
  note: { actorId: string | null; postId: string | null; createdAt: string; metadata?: unknown },
  comments: readonly { authorId: string; createdAt: string; images?: readonly string[] | null }[],
): string[] {
  const stored = imagesFromNoticeMetadata(note.metadata);
  if (stored.length) return stored;
  if (!note.postId || !note.actorId) return [];
  const target = Date.parse(note.createdAt);
  if (Number.isNaN(target)) return [];
  let best: (typeof comments)[number] | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const comment of comments) {
    if (comment.authorId !== note.actorId) continue;
    const at = Date.parse(comment.createdAt);
    if (Number.isNaN(at)) continue;
    const delta = Math.abs(at - target);
    if (delta < bestDelta) {
      best = comment;
      bestDelta = delta;
    }
  }
  return best?.images?.length ? [...best.images] : [];
}

export function optimisticReply(input: {
  postId: string;
  authorId: string;
  body: string;
  images?: readonly string[] | null;
  createdAt?: string;
}): PostComment {
  const images = normalizePostPhotos(input.images ?? []);
  const comment: PostComment = {
    id: `${OPTIMISTIC_REPLY_PREFIX}${crypto.randomUUID()}`,
    postId: input.postId,
    authorId: input.authorId,
    body: input.body.trim(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  if (images.length) comment.images = images;
  return comment;
}

export function isOptimisticReply(id: string): boolean {
  return id.startsWith(OPTIMISTIC_REPLY_PREFIX);
}

export function withoutOptimisticReply(comments: readonly PostComment[], id: string): PostComment[] {
  return comments.filter((comment) => comment.id !== id);
}

/**
 * Drop the local copy once the saved row is present.
 * A second copy of the same id is not kept.
 */
export function settleOptimisticReply(
  comments: readonly PostComment[],
  optimisticId: string,
  savedId: string | null,
): PostComment[] {
  const without = comments.filter((comment) => comment.id !== optimisticId);
  if (!savedId) return without;
  const seen = new Set<string>();
  const next: PostComment[] = [];
  for (const comment of without) {
    if (seen.has(comment.id)) continue;
    seen.add(comment.id);
    next.push(comment);
  }
  return next;
}
