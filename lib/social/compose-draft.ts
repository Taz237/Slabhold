import type { PostGif } from "./gifs";
import { segmentIsEmpty, type ThreadSegment } from "./threads";

/**
 * A composer draft kept in memory when the composer closes by Back (the
 * browser button, the iOS swipe, Android Back). Those can't wait for a
 * "Discard post?" prompt, so the draft waits for the next /compose in the
 * same mode, in this tab. Post and Discard clear it. Edits keep nothing.
 * Module memory only: nothing is written to storage.
 */
export type ComposeDraft = {
  body: string;
  images: string[];
  cardId: string;
  quoteId: string | null;
  /** The GIF on the first post. */
  gif?: PostGif | null;
  /** The later posts of a thread being written. */
  more?: ThreadSegment[];
  /** Which post the composer opens on, 0 first. Set by Home's plus button. */
  active?: number;
};

function hasMore(draft: ComposeDraft): boolean {
  return (draft.more ?? []).some((segment) => !segmentIsEmpty(segment));
}

let held: { key: string; draft: ComposeDraft } | null = null;

/** The composer's mode, from its search params. Null for an edit. */
export function composeDraftKey(params: {
  edit: string | null;
  quote: string | null;
  card: string | null;
}): string | null {
  if (params.edit) return null;
  const parts = [params.quote ? `quote:${params.quote}` : "", params.card ? `card:${params.card}` : ""].filter(Boolean);
  return parts.length ? parts.join("|") : "new";
}

function isEmpty(draft: ComposeDraft): boolean {
  return !draft.body.trim() && draft.images.length === 0 && !draft.cardId && !draft.gif && !hasMore(draft);
}

/**
 * Home's plus button: what is written there becomes the first post of a
 * thread, and the full composer opens on a new second post.
 */
export function threadDraftFromHome(start: { body: string; images: readonly string[]; cardId: string; gif: PostGif | null }): ComposeDraft {
  return {
    body: start.body,
    images: [...start.images],
    cardId: start.cardId,
    quoteId: null,
    gif: start.gif,
    more: [{ body: "", images: [], gif: null }],
    active: 1,
  };
}

/** The posts a kept draft holds, and the one to open on. */
export function draftThread(
  draft: ComposeDraft,
  first: { body: string; images: string[] },
): { segments: ThreadSegment[]; active: number } {
  const segments = [{ body: first.body, images: first.images, gif: first.images.length ? null : (draft.gif ?? null) }, ...(draft.more ?? [])];
  const wanted = Number.isInteger(draft.active) ? (draft.active as number) : 0;
  return { segments, active: Math.min(Math.max(0, wanted), segments.length - 1) };
}

/** Keep the draft for this mode. An empty one drops what was held for it. */
export function keepComposeDraft(key: string, draft: ComposeDraft): void {
  if (isEmpty(draft)) {
    if (held?.key === key) held = null;
    return;
  }
  held = { key, draft: { ...draft, images: [...draft.images] } };
}

/** The draft kept for this mode, once. */
export function takeComposeDraft(key: string): ComposeDraft | null {
  if (!held || held.key !== key) return null;
  const { draft } = held;
  held = null;
  return { ...draft, images: [...draft.images] };
}

export function clearComposeDraft(): void {
  held = null;
}
