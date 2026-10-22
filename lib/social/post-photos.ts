import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanImageUrl } from "./link-preview";
import type { PublicCard } from "./types";

/**
 * A normal post stores its first photo on posts.image_url and any further
 * photos in posts.meta.images. posts.meta already exists. Mail Day keeps its
 * own meta.photos list, and this key is never shown as that.
 * When the meta column is missing, only the first photo is saved.
 */
export const MAX_POST_PHOTOS = 4;

export const POST_PHOTO_LIMIT_ERROR = "You can add up to 4 photos.";
export const POST_PHOTO_SINGLE_ERROR = "You can add one photo.";
/** Accessible name for a photo button once the composer is full. */
export const POST_PHOTO_CAP_HINT = "Up to 4 photos";

export type PostWrite = {
  body: string;
  imageDataUrl: string | null;
  images?: readonly string[] | null;
  card: PublicCard | null;
  quotedPostId?: string | null;
  /** Set when the post is created with a card that was just added. */
  shareOfNewCard?: boolean;
};

export function postPhotoLimit(multiPhoto: boolean): number {
  return multiPhoto ? MAX_POST_PHOTOS : 1;
}

export function postPhotoLimitError(limit: number): string {
  return limit <= 1 ? POST_PHOTO_SINGLE_ERROR : POST_PHOTO_LIMIT_ERROR;
}

export function photoAttachFull(count: number, limit: number): boolean {
  return count >= limit;
}

/** Hint spoken when the photo button is disabled. The error string stays a fallback. */
export function photoAttachHint(limit: number): string {
  return limit <= 1 ? POST_PHOTO_SINGLE_ERROR : POST_PHOTO_CAP_HINT;
}

const POST_IMAGE_PREFIX = "/storage/v1/object/public/post-images/";
const CARD_PHOTO_PREFIX = "/storage/v1/object/public/card-photos/";
const PATH_TRAVERSAL = /\.\.|%2e|%2f|%25/i;

function supabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Photos we will render. With Supabase configured, only that origin's
 * post-images and card-photos objects, or a small png/jpeg/webp/gif data URL.
 * Local mode (no project URL) still allows any data:image/.
 */
export function isRenderablePostPhoto(url: string): boolean {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (!value) return false;
  if (value.startsWith("data:")) {
    if (!supabaseOrigin()) return value.startsWith("data:image/");
    return cleanImageUrl(value) != null;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const origin = supabaseOrigin();
  if (!origin || parsed.origin !== origin) return false;
  if (parsed.username || parsed.password) return false;
  const rawPath = value.split(/[?#]/)[0] ?? value;
  if (PATH_TRAVERSAL.test(rawPath) || PATH_TRAVERSAL.test(parsed.pathname)) return false;
  return parsed.pathname.startsWith(POST_IMAGE_PREFIX) || parsed.pathname.startsWith(CARD_PHOTO_PREFIX);
}

export function normalizePostPhotos(photos: readonly string[], limit = MAX_POST_PHOTOS): string[] {
  const out: string[] = [];
  for (const photo of photos) {
    if (typeof photo !== "string" || !photo) continue;
    if (out.includes(photo)) continue;
    out.push(photo);
    if (out.length >= limit) break;
  }
  return out;
}

function renderablePostPhotos(photos: readonly string[], limit = MAX_POST_PHOTOS): string[] {
  return normalizePostPhotos(photos.filter(isRenderablePostPhoto), limit);
}

/** Hide a post photo that is the same file already shown on the attached card. */
export function photosBesideCard(
  photos: readonly string[],
  cardPhoto: string | null | undefined,
): string[] {
  if (!cardPhoto) return [...photos];
  return photos.filter((photo) => photo !== cardPhoto);
}

/** Keep photos that fit. Anything past the limit is rejected and not stored. */
export function appendPostPhotos(
  current: readonly string[],
  incoming: readonly string[],
  limit = MAX_POST_PHOTOS,
): { photos: string[]; rejected: number } {
  const start = normalizePostPhotos(current, limit);
  const room = Math.max(0, limit - start.length);
  const seen = new Set(start);
  const fresh: string[] = [];
  for (const photo of incoming) {
    if (typeof photo !== "string" || !photo || seen.has(photo)) continue;
    seen.add(photo);
    fresh.push(photo);
  }
  const accepted = fresh.slice(0, room);
  return {
    photos: [...start, ...accepted],
    rejected: fresh.length - accepted.length,
  };
}

export function draftPostPhotos(
  input: { imageDataUrl?: string | null; images?: readonly string[] | null },
  limit = MAX_POST_PHOTOS,
): string[] {
  if (input.images != null) return normalizePostPhotos(input.images, limit);
  return input.imageDataUrl ? normalizePostPhotos([input.imageDataUrl], limit) : [];
}

export function imagesFromMeta(meta: unknown): string[] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const images = (meta as Record<string, unknown>).images;
  if (!Array.isArray(images)) return [];
  return renderablePostPhotos(images.filter((item): item is string => typeof item === "string"));
}

/** Mail Day photos stay on that post. A normal post prefers meta.images. */
export function imagesFromRow(row: {
  image_url: string | null;
  meta?: unknown;
  post_type?: string | null;
}): string[] {
  if (row.post_type === "mail_day") return renderablePostPhotos(row.image_url ? [row.image_url] : []);
  const stored = imagesFromMeta(row.meta);
  if (stored.length) return stored;
  return renderablePostPhotos(row.image_url ? [row.image_url] : []);
}

export function imagesFromPost(post: {
  imageDataUrl?: string | null;
  images?: readonly string[] | null;
}): string[] {
  if (post.images && post.images.length) return normalizePostPhotos(post.images);
  return post.imageDataUrl ? [post.imageDataUrl] : [];
}

export function mappedPostImages(row: {
  image_url: string | null;
  meta?: unknown;
  post_type?: string | null;
}): { imageDataUrl: string | null; images: string[] } {
  const images = imagesFromRow(row);
  return { images, imageDataUrl: images[0] ?? null };
}

/** Preserve other meta keys. Drop images when a post has fewer than two photos. */
export function metaWithImages(
  existing: unknown,
  urls: readonly string[],
): Record<string, unknown> | null {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  delete base.images;
  const images = normalizePostPhotos(urls);
  if (images.length > 1) base.images = images;
  return Object.keys(base).length ? base : null;
}

export function metaColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code !== "PGRST204" && error.code !== "42703" && !/column/i.test(message)) {
    return false;
  }
  return /meta/i.test(message);
}

let multiPhoto: boolean | null = null;

export function noteMultiPhotoMissing() {
  multiPhoto = false;
}

export function resetMultiPhotoSupport() {
  multiPhoto = null;
}

/** True when posts.meta can store the extra photos. A missing column turns the feature off. */
export async function postsSupportMultipleImages(
  supabase: SupabaseClient,
): Promise<boolean> {
  if (multiPhoto != null) return multiPhoto;
  const { error } = await supabase.from("posts").select("meta").limit(1);
  if (!error) {
    multiPhoto = true;
    return true;
  }
  multiPhoto = !metaColumnMissing(error);
  return multiPhoto;
}

/** X-style grid: 2 across, 3 with a tall first cell, 4 in a square. */
export function postPhotoGridClass(count: number): string {
  if (count <= 1) return "";
  if (count === 3) return "grid grid-cols-2 grid-rows-2 gap-0.5";
  return "grid grid-cols-2 gap-0.5";
}

export function postPhotoCellClass(count: number, index: number): string {
  if (count <= 1) return "";
  if (count === 3 && index === 0) return "row-span-2 h-full";
  return "aspect-square";
}
