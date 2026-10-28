import { parseSetupState, setupKey, tourKey, type SetupState } from "@/lib/onboarding/first-run";

/**
 * What the onboarding layers are doing right now, shared across the shell,
 * Home and the menu. In memory only; what must survive a reload lives in
 * localStorage under setupKey and tourKey.
 */
export type OnboardingState = {
  /** First-run setup is on screen. */
  setupActive: boolean;
  /** Setup just ended in this visit. "You're in" and the tour wait for Home. */
  welcomePending: boolean;
  /** The "You're in" moment is on screen. */
  celebrating: boolean;
  /** Current coach mark, or null when the tour is closed. */
  tourIndex: number | null;
};

const IDLE: OnboardingState = { setupActive: false, welcomePending: false, celebrating: false, tourIndex: null };

let state: OnboardingState = IDLE;
const listeners = new Set<() => void>();

function update(patch: Partial<OnboardingState>) {
  const next = { ...state, ...patch };
  if (
    next.setupActive === state.setupActive &&
    next.welcomePending === state.welcomePending &&
    next.celebrating === state.celebrating &&
    next.tourIndex === state.tourIndex
  ) {
    return;
  }
  state = next;
  for (const listener of listeners) listener();
}

export function onboardingState(): OnboardingState {
  return state;
}

export function idleOnboardingState(): OnboardingState {
  return IDLE;
}

export function subscribeOnboarding(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSetupActive(active: boolean) {
  update({ setupActive: active });
}

/** Setup finished or skipped. Home shows "You're in", then the tour. */
export function completeSetup() {
  update({ setupActive: false, welcomePending: true });
}

export function startCelebration() {
  update({ welcomePending: false, celebrating: true });
}

export function endCelebration() {
  update({ celebrating: false });
}

export function startTour() {
  update({ tourIndex: 0 });
}

export function showTourStep(index: number) {
  update({ tourIndex: index });
}

export function endTour() {
  update({ tourIndex: null });
}

export function resetOnboarding() {
  state = IDLE;
  for (const listener of listeners) listener();
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: this visit still remembers in memory.
  }
}

export function readSetupState(userId: string): SetupState | null {
  return parseSetupState(readStorage(setupKey(userId)));
}

export function writeSetupState(userId: string, value: SetupState) {
  writeStorage(setupKey(userId), value);
}

const seenThisVisit = new Set<string>();

export function tourSeen(userId: string): boolean {
  return seenThisVisit.has(userId) || readStorage(tourKey(userId)) === "1";
}

export function markTourSeen(userId: string) {
  seenThisVisit.add(userId);
  writeStorage(tourKey(userId), "1");
}
