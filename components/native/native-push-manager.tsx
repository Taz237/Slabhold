"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnboardingBusy } from "@/components/onboarding/use-onboarding";
import { PushToast, SoftAsk } from "@/components/push/soft-ask";
import { useSocial } from "@/components/social-provider";
import { trackEvent } from "@/lib/analytics";
import { setSignOutHook } from "@/lib/auth/sign-out-hook";
import { isAuthPage, isChromelessPath } from "@/lib/auth/guest-paths";
import { loadNative } from "@/lib/ios/platform";
import { deviceOptedIn, pushFeatureOn, rememberOptIn } from "@/lib/push/client";
import {
  apnsServerAvailable,
  fireNativeFlush,
  forgetApnsToken,
  nativeAskSurface,
  saveApnsToken,
} from "@/lib/push/native-client";
import {
  ACTION_SETTLE_MS,
  ASK_SESSION_KEY,
  EXISTING_OPEN_DELAY_MS,
  askKey,
  dismissedState,
  firstOpenSessionKey,
  parseAskState,
  shouldAsk,
  shownState,
  startsFirstOpen,
} from "@/lib/push/soft-ask";
import { onSocialAction, type SocialAction } from "@/lib/social/action-signal";
import { afterFirstIdle } from "@/lib/ui/idle";
import type { Profile } from "@/lib/social/types";

type NativeModule = Awaited<ReturnType<typeof loadNative>>;
export type BadgeNative = Pick<NativeModule, "nativeExtrasAvailable" | "setNativeBadge" | "onAppResume">;
type Listens = Pick<EventTarget, "addEventListener" | "removeEventListener">;
export type BadgeEnv = { document: Listens & { visibilityState: DocumentVisibilityState }; window: Listens };

/**
 * The app icon's red number: set it to unread now, and again whenever the app
 * comes back to the front. Builds without our plugin (2 and 3) make no calls.
 * Returns the undo.
 */
export function keepNativeBadge(native: BadgeNative, unread: number, env: BadgeEnv): () => void {
  if (!native.nativeExtrasAvailable()) return () => {};
  const set = () => void native.setNativeBadge(unread).catch(() => undefined);
  const onVisible = () => {
    if (env.document.visibilityState === "visible") set();
  };
  set();
  env.document.addEventListener("visibilitychange", onVisible);
  env.window.addEventListener("focus", onVisible);
  const stopResume = native.onAppResume(set);
  return () => {
    env.document.removeEventListener("visibilitychange", onVisible);
    env.window.removeEventListener("focus", onVisible);
    stopResume();
  };
}

/** Sign-out: no red number on the icon. A no-op without our plugin. */
export function clearNativeBadge(native: Pick<BadgeNative, "nativeExtrasAvailable" | "setNativeBadge">): Promise<void> {
  if (!native.nativeExtrasAvailable()) return Promise.resolve();
  return native.setNativeBadge(0).catch(() => undefined);
}

const ASK_ACTIONS = new Set<SocialAction>(["follow", "post", "like"]);
const RESAVED_KEY = "slabhold.apns.resaved";

function readStorage(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: "local" | "session", key: string, value: string) {
  try {
    (storage === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    // Private mode. The card just may show again.
  }
}

/** A modal is up. Closed ones that stay mounted (the side menu) are inert or invisible. */
function overlayOpen(): boolean {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], dialog[open]')].some(
    (element) =>
      !element.closest("[inert]") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden",
  );
}

/**
 * The iPhone app's push: the same soft-ask rules as the web (after a follow,
 * post or like, or once on Home for existing users), with the native prompt
 * behind "Turn on". Refreshes this phone's token on each launch when this
 * user turned push on here, sends /api/push/flush after social actions, and
 * removes the token on sign-out. Keeps the app icon badge at unread
 * notifications plus unread DMs. Mounted only inside the app, signed in.
 * Nothing shows on old builds (no plugin) or while APNs is off on the server.
 */
export function NativePushManager({ user }: { user: Profile }) {
  const pathname = usePathname() || "/";
  const onboardingBusy = useOnboardingBusy();
  const [asking, setAsking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { notifications, unreadMessageCount } = useSocial();
  const userId = user.id;
  const accountCreatedAt = Number.isFinite(Date.parse(user.createdAt)) ? Date.parse(user.createdAt) : null;

  const live = useRef({ pathname, onboardingBusy, asking });
  useEffect(() => {
    live.current = { pathname, onboardingBusy, asking };
  });

  // First open on this device: remembered for the session so it never asks.
  useEffect(() => {
    const key = askKey(userId);
    const state = parseAskState(readStorage("local", key));
    if (state.firstSeenAt) return;
    const now = Date.now();
    if (startsFirstOpen({ state, accountCreatedAt, now })) writeStorage("session", firstOpenSessionKey(userId), "1");
    writeStorage("local", key, JSON.stringify({ ...state, firstSeenAt: now }));
  }, [accountCreatedAt, userId]);

  // Each launch: when this user turned push on here and iOS still allows it,
  // save the (possibly new) token again. Never prompts.
  useEffect(() => {
    if (!deviceOptedIn(userId) || readStorage("session", RESAVED_KEY) === userId) return;
    let cancelled = false;
    void (async () => {
      if (!(await apnsServerAvailable())) return;
      const native = await loadNative();
      if (cancelled || !native.nativePushAvailable()) return;
      const token = await native.nativePushToken();
      if (cancelled || !token) return;
      if (await saveApnsToken(token)) writeStorage("session", RESAVED_KEY, userId);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Sign-out removes this phone's token while the session is still valid.
  // The web PushManager never mounts in the app, so this hook is ours alone.
  useEffect(() => {
    setSignOutHook(() => forgetApnsToken({ keepalive: true }));
    return () => setSignOutHook(null);
  }, []);

  // App icon badge, the same count as the web's: kept current as things are
  // read, and on every return to the front. Opening the app clears what's read.
  const unread = notifications.filter((note) => !note.read).length + unreadMessageCount;
  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    void loadNative()
      .then((native) => {
        if (!cancelled) stop = keepNativeBadge(native, unread, { document, window });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop();
    };
  }, [unread]);

  // Sign-out unmounts this manager (it only mounts signed in): clear the icon.
  // The token removal above keeps the one sign-out hook.
  useEffect(
    () => () => {
      void loadNative()
        .then((native) => clearNativeBadge(native))
        .catch(() => undefined);
    },
    [],
  );

  const evaluate = useCallback(
    async (trigger: "action" | "existing-open") => {
      if (!(await apnsServerAvailable())) return;
      const native = await loadNative().catch(() => null);
      if (!native) return;
      const pluginAvailable = native.nativePushAvailable();
      const permission = await native.nativePushPermission();
      const surface = nativeAskSurface({
        pluginAvailable,
        serverAvailable: true,
        permission,
        optedIn: deviceOptedIn(userId),
      });
      const now = Date.now();
      const key = askKey(userId);
      const stored = parseAskState(readStorage("local", key));
      const { pathname: path, onboardingBusy: busyNow, asking: open } = live.current;
      const allowed = shouldAsk({
        trigger,
        featureOn: pluginAvailable,
        signedIn: true,
        firstOpen: readStorage("session", firstOpenSessionKey(userId)) === "1",
        busy: busyNow || open || isAuthPage(path) || isChromelessPath(path) || overlayOpen(),
        shownThisSession: readStorage("session", ASK_SESSION_KEY) === "1",
        surface,
        state: stored,
        now,
        // The app is always "installed".
        standalone: true,
        accountCreatedAt,
        pathname: path,
      });
      if (!allowed) return;
      writeStorage("session", ASK_SESSION_KEY, "1");
      writeStorage("local", key, JSON.stringify(shownState(stored, now)));
      trackEvent("push_ask_shown", { result: "push" });
      setAsking(true);
    },
    [accountCreatedAt, userId],
  );

  // Every action sends the pushes it caused; a follow, post or like may also
  // offer the card once its success UI has settled.
  useEffect(() => {
    const timers = new Set<number>();
    const stop = onSocialAction((action) => {
      void apnsServerAvailable().then((on) => {
        if (on || pushFeatureOn()) fireNativeFlush();
      });
      if (!ASK_ACTIONS.has(action)) return;
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        void evaluate("action");
      }, ACTION_SETTLE_MS);
      timers.add(timer);
    });
    return () => {
      stop();
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [evaluate]);

  // Existing users: once, on Home, after the first idle and a beat.
  useEffect(() => {
    let timer = 0;
    const cancelIdle = afterFirstIdle(() => {
      timer = window.setTimeout(() => void evaluate("existing-open"), EXISTING_OPEN_DELAY_MS);
    });
    return () => {
      cancelIdle();
      window.clearTimeout(timer);
    };
  }, [evaluate]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dismiss = () => {
    const key = askKey(userId);
    writeStorage("local", key, JSON.stringify(dismissedState(parseAskState(readStorage("local", key)), Date.now())));
    trackEvent("push_ask_dismissed", { result: "push" });
    setAsking(false);
  };

  const accept = () => {
    trackEvent("push_ask_accepted", { result: "push" });
    setAsking(false);
    void (async () => {
      const native = await loadNative();
      const token = await native.nativePushEnable();
      trackEvent("push_permission_result", { result: token ? "granted" : "denied" });
      if (!token) return;
      if (await saveApnsToken(token)) {
        rememberOptIn(userId, true);
        writeStorage("session", RESAVED_KEY, userId);
        setToast("Notifications on");
      } else {
        setToast("Couldn't turn on notifications. Try again.");
      }
    })().catch(() => setToast("Couldn't turn on notifications. Try again."));
  };

  return (
    <>
      {asking ? <SoftAsk surface="push" onPrimary={accept} onDismiss={dismiss} /> : null}
      {toast ? <PushToast text={toast} /> : null}
    </>
  );
}
