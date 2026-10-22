export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function firstCardPrivacyPendingKey(userId: string) {
  return `slabhold.first-card-privacy.pending.${userId}`;
}

export function firstCardPrivacyDismissedKey(userId: string) {
  return `slabhold.first-card-privacy.dismissed.${userId}`;
}

/** Remember a prompt only for a private card that is this account's first save. */
export function shouldMarkFirstCardPrivacy(input: {
  isNew: boolean;
  isPublic: boolean;
  cardCountBeforeSave: number;
  cardsReady: boolean;
  syncError?: string | null;
}): boolean {
  return (
    input.isNew &&
    !input.isPublic &&
    input.cardsReady &&
    !input.syncError &&
    input.cardCountBeforeSave === 0
  );
}

export function writeFirstCardPrivacyPending(store: KeyValueStore, userId: string, cardId: string) {
  if (store.getItem(firstCardPrivacyDismissedKey(userId)) === "1") return;
  store.setItem(firstCardPrivacyPendingKey(userId), cardId);
}

/** The prompt is for the card just saved, until the account answers it. */
export function readFirstCardPrivacyPrompt(
  store: KeyValueStore,
  userId: string,
  cardId: string,
  isPublic: boolean,
): boolean {
  if (isPublic) return false;
  if (store.getItem(firstCardPrivacyDismissedKey(userId)) === "1") return false;
  return store.getItem(firstCardPrivacyPendingKey(userId)) === cardId;
}

export function dismissFirstCardPrivacy(store: KeyValueStore, userId: string) {
  store.setItem(firstCardPrivacyDismissedKey(userId), "1");
  store.removeItem(firstCardPrivacyPendingKey(userId));
}

const privacyListeners = new Set<() => void>();

export function subscribeFirstCardPrivacy(listener: () => void) {
  privacyListeners.add(listener);
  return () => {
    privacyListeners.delete(listener);
  };
}

function emitFirstCardPrivacy() {
  for (const listener of privacyListeners) listener();
}

export function readBrowserFirstCardPrivacy(
  userId: string | null,
  cardId: string | null,
  isPublic: boolean,
): boolean {
  if (!userId || !cardId) return false;
  try {
    return readFirstCardPrivacyPrompt(window.localStorage, userId, cardId, isPublic);
  } catch {
    return false;
  }
}

export function dismissFirstCardPrivacyInBrowser(userId: string) {
  try {
    dismissFirstCardPrivacy(window.localStorage, userId);
  } catch {
    // Still tell the open card to hide the prompt.
  }
  emitFirstCardPrivacy();
}

/** Best-effort write. A blocked browser store just skips the prompt. */
export function rememberFirstCardPrivacy(userId: string, cardId: string) {
  try {
    writeFirstCardPrivacyPending(window.localStorage, userId, cardId);
  } catch {
    // The prompt is optional when storage is blocked.
  }
}
