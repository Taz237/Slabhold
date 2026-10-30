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
};

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
  return !draft.body.trim() && draft.images.length === 0 && !draft.cardId;
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
