import type { SupabaseClient } from "@supabase/supabase-js";
import { gifColumnMissing, type PostGif } from "./gifs";

/** A thread is 2 to 10 posts. Same limit as the database. */
export const THREAD_MAX = 10;

export const THREAD_FULL_HINT = "A thread can have up to 10 posts.";
export const THREADS_UNAVAILABLE = "Threads aren't available yet. Post these one at a time.";

type Threaded = { id: string; threadId?: string | null; threadPosition?: number | null };

export function isInThread(post: Threaded): boolean {
  return Boolean(post.threadId) && typeof post.threadPosition === "number";
}

/** A post after the first in its thread. Timelines show the first post only. */
export function isThreadContinuation(post: Threaded): boolean {
  return isInThread(post) && (post.threadPosition ?? 0) > 0;
}

/** The posts of one thread, first to last. */
export function orderThread<T extends Threaded>(posts: readonly T[], threadId: string): T[] {
  const seen = new Set<string>();
  return posts
    .filter((post) => {
      if (post.threadId !== threadId || !isInThread(post) || seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    })
    .sort((a, b) => (a.threadPosition ?? 0) - (b.threadPosition ?? 0) || a.id.localeCompare(b.id));
}

/**
 * Every post, with one post taken out of its thread. The rest of the thread
 * stays: later posts move up one place, and a thread with one post left is a
 * normal post again. Mirrors the database's delete trigger.
 */
export function postsAfterThreadDelete<T extends Threaded>(posts: readonly T[], deletedId: string): T[] {
  const deleted = posts.find((post) => post.id === deletedId);
  const rest = posts.filter((post) => post.id !== deletedId);
  if (!deleted || !deleted.threadId || !isInThread(deleted)) return rest;
  const threadId = deleted.threadId;
  const gap = deleted.threadPosition ?? 0;
  const left = rest.filter((post) => post.threadId === threadId && isInThread(post)).length;
  return rest.map((post) => {
    if (post.threadId !== threadId || !isInThread(post)) return post;
    if (left <= 1) return { ...post, threadId: null, threadPosition: null };
    const position = post.threadPosition ?? 0;
    return position > gap ? { ...post, threadPosition: position - 1 } : post;
  });
}

/** Thread fields for the posts of one new thread, in the order they were written. */
export function threadSlots(count: number, threadId: string): { threadId: string | null; threadPosition: number | null }[] {
  if (count < 2) return Array.from({ length: count }, () => ({ threadId: null, threadPosition: null }));
  return Array.from({ length: Math.min(count, THREAD_MAX) }, (_, index) => ({
    threadId,
    threadPosition: index,
  }));
}

export function canAddToThread(count: number): boolean {
  return count < THREAD_MAX;
}

/** A missing posts.thread_id / thread_position column, before the migration is applied. */
export function threadColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code !== "PGRST204" && error.code !== "42703" && !/column/i.test(message)) return false;
  return /thread_(id|position)/i.test(message);
}

let extras: boolean | null = null;

export function notePostExtrasMissing() {
  extras = false;
}

export function resetPostExtrasSupport() {
  extras = null;
}

export function postExtrasKnownMissing(): boolean {
  return extras === false;
}

/**
 * True when posts and comments can store a GIF and posts can be threaded.
 * Until the migration is applied the GIF and thread buttons stay hidden.
 */
export async function postsSupportGifsAndThreads(supabase: SupabaseClient): Promise<boolean> {
  if (extras != null) return extras;
  const [posts, comments] = await Promise.all([
    supabase.from("posts").select("gif, thread_id, thread_position").limit(1),
    supabase.from("comments").select("gif").limit(1),
  ]);
  const missing = (error: { code?: string; message?: string } | null) =>
    threadColumnMissing(error) || gifColumnMissing(error);
  // Only a missing column turns the buttons off. Any other error leaves them on.
  extras = !(missing(posts.error) || missing(comments.error));
  return extras;
}

/** One post being written in the composer. */
export type ThreadSegment = { body: string; images: string[]; gif: PostGif | null };

export const EMPTY_SEGMENT: ThreadSegment = { body: "", images: [], gif: null };

export function segmentIsEmpty(segment: ThreadSegment): boolean {
  return !segment.body.trim() && segment.images.length === 0 && !segment.gif;
}

/** A new empty post right after `index`. Unchanged when that post is empty or the thread is full. */
export function addSegmentAfter(segments: readonly ThreadSegment[], index: number): ThreadSegment[] {
  const current = segments[index];
  if (!current || segmentIsEmpty(current) || !canAddToThread(segments.length)) return [...segments];
  return [...segments.slice(0, index + 1), { ...EMPTY_SEGMENT }, ...segments.slice(index + 1)];
}

/** The posts left once one is taken out, and which one is being written next. Never empty. */
export function removeSegment(
  segments: readonly ThreadSegment[],
  index: number,
  active: number,
): { segments: ThreadSegment[]; active: number } {
  if (segments.length <= 1 || index < 0 || index >= segments.length) {
    return { segments: [...segments], active };
  }
  const rest = segments.filter((_, item) => item !== index);
  const next = index < active ? active - 1 : index === active ? Math.max(0, index - 1) : active;
  return { segments: rest, active: Math.min(next, rest.length - 1) };
}

/** What gets posted: the first post, then every later post that has something in it. */
export function segmentsToPost(segments: readonly ThreadSegment[]): ThreadSegment[] {
  return segments.filter((segment, index) => index === 0 || !segmentIsEmpty(segment)).slice(0, THREAD_MAX);
}
