import type { InstallPlatform } from "@/lib/pwa/install-step";

/** "Not now" holds the card back this long. */
export const ASK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** Offered at most this many times on a device, ever. */
export const ASK_MAX = 3;
/** After a follow, post or like, the action's own success UI settles first. */
export const ACTION_SETTLE_MS = 1500;
/** Existing installed users: first idle on Home, then this much more. */
export const EXISTING_OPEN_DELAY_MS = 2000;
/**
 * An account this young when a device first sees it is "new": that sighting
 * is its first open. Older accounts are "existing" users, who may get the
 * card once on their next installed-app open. No release date to keep in sync.
 */
export const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AskState = {
  dismissals: number;
  /** Last time the card was shown, ms. */
  lastAt: number | null;
  /** First time this device saw this user, so the first open never asks. */
  firstSeenAt?: number | null;
};

export const EMPTY_ASK: AskState = { dismissals: 0, lastAt: null, firstSeenAt: null };

/** Per user per device. UI state, not a secret. */
export function askKey(userId: string): string {
  return `slabhold.pushAsk.${userId}`;
}

/** The iOS Safari "add to Home Screen first" card keeps its own cooldown. */
export function homeAskKey(userId: string): string {
  return `slabhold.pushAskHome.${userId}`;
}

/** sessionStorage: the card already showed in this session. */
export const ASK_SESSION_KEY = "slabhold.pushAsk.session";
export function firstOpenSessionKey(userId: string): string {
  return `slabhold.pushAsk.first.${userId}`;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseAskState(raw: string | null): AskState {
  if (!raw) return { ...EMPTY_ASK };
  try {
    const value = JSON.parse(raw) as Partial<AskState>;
    return {
      dismissals: Math.max(0, Math.floor(finite(value.dismissals) ?? 0)),
      lastAt: finite(value.lastAt),
      firstSeenAt: finite(value.firstSeenAt),
    };
  } catch {
    return { ...EMPTY_ASK };
  }
}

export type AskSurface = "push" | "add-to-home";

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

/**
 * What this device can be offered. iOS Safari tabs can't get web push, so they
 * get "add to Home Screen first" (never requestPermission). Other iPhone
 * browsers and in-app browsers get nothing.
 */
export function askSurface(input: {
  platform: InstallPlatform | null;
  pushSupported: boolean;
  permission: PermissionState;
}): AskSurface | null {
  const { platform } = input;
  if (!platform || platform === "in-app" || platform === "ios-browser") return null;
  if (platform === "ios-safari") return "add-to-home";
  if (!input.pushSupported || input.permission !== "default") return null;
  return "push";
}

export function cooledDown(state: AskState, now: number): boolean {
  if (state.dismissals >= ASK_MAX) return false;
  return state.lastAt === null || now - state.lastAt >= ASK_COOLDOWN_MS;
}

/**
 * The first time this device sees a new account is its first open. Existing
 * accounts (older than a day) are never on their "first open" here.
 */
export function startsFirstOpen(input: { state: AskState; accountCreatedAt: number | null; now: number }): boolean {
  if (input.state.firstSeenAt) return false;
  return input.accountCreatedAt === null || input.accountCreatedAt >= input.now - NEW_ACCOUNT_WINDOW_MS;
}

export type AskInput = {
  trigger: "action" | "existing-open";
  featureOn: boolean;
  signedIn: boolean;
  /** This session is the account's first open on this device. */
  firstOpen: boolean;
  /** Onboarding, a modal or the composer is up, or this is an auth page. */
  busy: boolean;
  shownThisSession: boolean;
  surface: AskSurface | null;
  state: AskState;
  now: number;
  standalone: boolean;
  accountCreatedAt: number | null;
  pathname: string;
};

/** Whether to show the soft-ask (or the add-to-home card) now. */
export function shouldAsk(input: AskInput): boolean {
  if (!input.featureOn || !input.signedIn || !input.surface) return false;
  if (input.firstOpen || input.busy || input.shownThisSession) return false;
  if (!cooledDown(input.state, input.now)) return false;
  if (input.trigger === "existing-open") {
    return (
      input.surface === "push" &&
      input.standalone &&
      input.pathname === "/" &&
      input.accountCreatedAt !== null &&
      input.accountCreatedAt < (input.state.firstSeenAt ?? input.now) - NEW_ACCOUNT_WINDOW_MS &&
      input.state.lastAt === null &&
      input.state.dismissals === 0
    );
  }
  return true;
}

export function shownState(state: AskState, now: number): AskState {
  return { ...state, lastAt: now };
}

export function dismissedState(state: AskState, now: number): AskState {
  return { ...state, dismissals: state.dismissals + 1, lastAt: now };
}
