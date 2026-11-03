/**
 * The five-screen intro that runs once for a new account, before "What do
 * you collect?". Stored per user on this device, like the tour.
 */

export const INTRO_STEPS = 5;

export function introKey(userId: string): string {
  return `slabhold.intro.seen.${userId}`;
}

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function introSeen(userId: string, store: Store | null = browserStore()): boolean {
  try {
    return store?.getItem(introKey(userId)) === "1";
  } catch {
    // Storage blocked: don't hold the setup back behind an intro we can't remember.
    return true;
  }
}

export function markIntroSeen(userId: string, store: Store | null = browserStore()) {
  try {
    store?.setItem(introKey(userId), "1");
  } catch {
    // Private mode with storage off: the intro just won't be remembered.
  }
}

/**
 * The intro shows while the setup sits on its first step, for an account
 * that hasn't seen it, and never before the phone install step.
 */
export function introShows(input: { setupShown: boolean; step: string; seen: boolean }): boolean {
  return input.setupShown && input.step === "collect" && !input.seen;
}
