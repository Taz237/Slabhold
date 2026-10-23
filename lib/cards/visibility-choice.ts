export type VisibilityStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/**
 * One line under Private on Add card.
 * public_cards omits paid_price, and the public card page only prints Paid when
 * purchasePrice is a number — mapPublicCard always sets that to null. Mail Day
 * can still show a paid amount when that post opts in; that is not the card page.
 */
export const PRIVATE_VISIBILITY_NUDGE =
  "Public cards can get offers and want alerts. Your price paid stays private.";

/** Two short sentences under Private on Add card. */
export const PRIVATE_VISIBILITY_HINT =
  "Cards are private by default. Your price paid stays private.";

export function visibilityChoiceKey(userId: string) {
  return `slabhold.card-visibility.${userId}`;
}

/** Null means this account has no saved choice, so Add card stays private. */
export function readVisibilityChoice(store: VisibilityStore, userId: string): boolean | null {
  const raw = store.getItem(visibilityChoiceKey(userId));
  if (raw === "public") return true;
  if (raw === "private") return false;
  return null;
}

export function writeVisibilityChoice(store: VisibilityStore, userId: string, isPublic: boolean) {
  store.setItem(visibilityChoiceKey(userId), isPublic ? "public" : "private");
}

const listeners = new Set<() => void>();

export function subscribeVisibilityChoice(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitVisibilityChoice() {
  for (const listener of listeners) listener();
}

export function readBrowserVisibilityChoice(userId: string): boolean | null {
  try {
    return readVisibilityChoice(window.localStorage, userId);
  } catch {
    return null;
  }
}

export function writeBrowserVisibilityChoice(userId: string, isPublic: boolean) {
  try {
    writeVisibilityChoice(window.localStorage, userId, isPublic);
  } catch {
    // A blocked store just leaves the next new card on the private default.
  }
  emitVisibilityChoice();
}
