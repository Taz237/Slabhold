import { clearNewCardDraft } from "@/lib/cards/new-card-draft";
import { clearEmailHintCookie } from "@/lib/pwa/install-step";
import { SHARED_RECENT_SEARCH_KEY } from "@/lib/search/recent";
import { emptyActivity, loadActivity, saveActivity } from "@/lib/social/activity";
import { clearComposeDraft } from "@/lib/social/compose-draft";

/**
 * What one person leaves on this device that the next person must not see.
 * Flags keyed by account id (dismissed prompts, push opt-in) stay: they hold
 * no content and only apply when that same account signs back in.
 */

/** sessionStorage handoffs: a photo for the composer or the scan, a just-shared post. */
export const SIGN_OUT_SESSION_KEYS = ["cardflip.compose", "cardflip.scan", "slabhold.shared-post"] as const;

/**
 * localStorage. The recent-players key matches RECENT_PLAYERS_KEY in
 * lib/cards/add-flow-players (kept literal so this stays off the player index).
 */
export const SIGN_OUT_LOCAL_KEYS: readonly string[] = [SHARED_RECENT_SEARCH_KEY, "slabhold:add-recent-players"];

/** Every account's recent searches, guest included. */
const SIGN_OUT_LOCAL_PREFIXES = [`${SHARED_RECENT_SEARCH_KEY}.`];

type Store = Pick<Storage, "getItem" | "removeItem" | "key" | "length">;

export type SignOutDevice = {
  local: Store | null;
  session: Store | null;
  setCookie: (cookie: string) => void;
};

function browserDevice(): SignOutDevice {
  const read = (name: "localStorage" | "sessionStorage"): Store | null => {
    try {
      return typeof window === "undefined" ? null : window[name];
    } catch {
      return null;
    }
  };
  return {
    local: read("localStorage"),
    session: read("sessionStorage"),
    setCookie: (cookie) => {
      if (typeof document !== "undefined") document.cookie = cookie;
    },
  };
}

function remove(store: Store | null, keys: readonly string[], prefixes: readonly string[] = []) {
  if (!store) return;
  const found = new Set(keys);
  try {
    if (prefixes.length > 0) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && prefixes.some((prefix) => key.startsWith(prefix))) found.add(key);
      }
    }
  } catch {
    // Blocked storage: still try the named keys.
  }
  for (const key of found) {
    try {
      store.removeItem(key);
    } catch {
      // Storage must never stop a logout.
    }
  }
}

/**
 * Runs on every logout: the side menu, account deletion, and a session that
 * ends on its own (Supabase's SIGNED_OUT). Safe to run more than once.
 */
export function clearSignedOutDevice(device: SignOutDevice = browserDevice()): void {
  clearNewCardDraft();
  clearComposeDraft();
  try {
    device.setCookie(clearEmailHintCookie());
  } catch {
    // A blocked cookie write must not stop the rest.
  }
  remove(device.session, SIGN_OUT_SESSION_KEYS);
  remove(device.local, SIGN_OUT_LOCAL_KEYS, SIGN_OUT_LOCAL_PREFIXES);
  // The device activity copy keeps only likes, which are filtered by userId and
  // still feed the likes migration. The last account's notifications, comments
  // and reposts go. TODO: clear it fully when the likes fallback is removed
  // (after 2026-11-06).
  try {
    saveActivity({ ...emptyActivity, likes: loadActivity().likes });
  } catch {
    // Storage must never stop a logout.
  }
}
