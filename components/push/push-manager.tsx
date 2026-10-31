"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnboardingBusy } from "@/components/onboarding/use-onboarding";
import { PushToast, SoftAsk } from "@/components/push/soft-ask";
import { useSocial } from "@/components/social-provider";
import { trackEvent } from "@/lib/analytics";
import { isAuthPage, isChromelessPath } from "@/lib/auth/guest-paths";
import {
  currentSubscription,
  deviceOptedIn,
  devicePlatform,
  firePushFlush,
  forgetDeviceOnSignOut,
  permissionState,
  pushFeatureOn,
  pushReady,
  pushServerAvailable,
  registerPushWorker,
  setAppBadge,
  subscribeDevice,
} from "@/lib/push/client";
import { sameOriginPath } from "@/lib/push/payload";
import { deviceTimeZone } from "@/lib/push/quiet-hours";
import {
  ACTION_SETTLE_MS,
  ASK_SESSION_KEY,
  EXISTING_OPEN_DELAY_MS,
  askKey,
  askSurface,
  dismissedState,
  firstOpenSessionKey,
  homeAskKey,
  parseAskState,
  shouldAsk,
  shownState,
  startsFirstOpen,
  type AskState,
  type AskSurface,
} from "@/lib/push/soft-ask";
import { setSignOutHook } from "@/lib/auth/sign-out-hook";
import { onSocialAction, type SocialAction } from "@/lib/social/action-signal";
import { afterFirstIdle } from "@/lib/ui/idle";
import { lazyPart } from "@/lib/ui/lazy-part";
import type { Profile } from "@/lib/social/types";

const InstallGuide = lazyPart(() => import("@/components/onboarding/install-step").then((mod) => mod.InstallGuide));

const ASK_ACTIONS = new Set<SocialAction>(["follow", "post", "like"]);
const RESUBSCRIBED_KEY = "slabhold.push.resubscribed";

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

function standalone(): boolean {
  return devicePlatform() === "installed";
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

let serverAvailable: Promise<boolean> | null = null;

/**
 * Signed-in only, loaded after the first idle. Registers the push worker,
 * sends /api/push/flush after social actions, offers the soft-ask at a good
 * moment, keeps the app badge current, and routes notification taps
 * client-side. With push off for this build it only renders nothing.
 */
export function PushManager({ user }: { user: Profile }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { refreshInbox, notifications, unreadMessageCount } = useSocial();
  const onboardingBusy = useOnboardingBusy();
  const [ask, setAsk] = useState<AskSurface | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const featureOn = pushFeatureOn();
  const userId = user.id;
  const accountCreatedAt = Number.isFinite(Date.parse(user.createdAt)) ? Date.parse(user.createdAt) : null;

  const live = useRef({ pathname, onboardingBusy, ask, guideOpen });
  useEffect(() => {
    live.current = { pathname, onboardingBusy, ask, guideOpen };
  });

  // First open on this device: remembered for the session so it never asks.
  useEffect(() => {
    if (!featureOn) return;
    const key = askKey(userId);
    const state = parseAskState(readStorage("local", key));
    if (state.firstSeenAt) return;
    const now = Date.now();
    if (startsFirstOpen({ state, accountCreatedAt, now })) writeStorage("session", firstOpenSessionKey(userId), "1");
    writeStorage("local", key, JSON.stringify({ ...state, firstSeenAt: now }));
  }, [accountCreatedAt, featureOn, userId]);

  // The worker, and this device's subscription when this user turned it on here.
  useEffect(() => {
    if (!featureOn || !pushReady()) return;
    let cancelled = false;
    void registerPushWorker().then(async () => {
      if (cancelled) return;
      if (deviceOptedIn(userId)) {
        if (permissionState() === "granted" && readStorage("session", RESUBSCRIBED_KEY) !== userId) {
          if (await subscribeDevice(userId)) writeStorage("session", RESUBSCRIBED_KEY, userId);
        }
        return;
      }
      // Someone else's subscription left on a shared device: drop it.
      const stale = await currentSubscription();
      if (stale) await stale.unsubscribe().catch(() => false);
    });
    return () => {
      cancelled = true;
    };
  }, [featureOn, userId]);

  useEffect(() => {
    if (!featureOn) return;
    setSignOutHook(forgetDeviceOnSignOut);
    return () => setSignOutHook(null);
  }, [featureOn]);

  const evaluate = useCallback(
    async (trigger: "action" | "existing-open") => {
      if (!featureOn) return;
      const now = Date.now();
      const platform = devicePlatform();
      const surface = askSurface({
        platform,
        pushSupported: pushReady(platform),
        permission: permissionState(),
      });
      const key = surface === "add-to-home" ? homeAskKey(userId) : askKey(userId);
      const stored = parseAskState(readStorage("local", key));
      const { pathname: path, onboardingBusy: busyNow, ask: open, guideOpen: guide } = live.current;
      const allowed = shouldAsk({
        trigger,
        featureOn,
        signedIn: true,
        firstOpen: readStorage("session", firstOpenSessionKey(userId)) === "1",
        busy: busyNow || open !== null || guide || isAuthPage(path) || isChromelessPath(path) || overlayOpen(),
        shownThisSession: readStorage("session", ASK_SESSION_KEY) === "1",
        surface,
        state: stored,
        now,
        standalone: standalone(),
        accountCreatedAt,
        pathname: path,
      });
      if (!allowed || !surface) return;
      serverAvailable ??= pushServerAvailable();
      if (!(await serverAvailable)) return;
      writeStorage("session", ASK_SESSION_KEY, "1");
      writeStorage("local", key, JSON.stringify(shownState(stored, now)));
      trackEvent("push_ask_shown", { result: surface });
      setAsk(surface);
    },
    [accountCreatedAt, featureOn, userId],
  );

  // After a follow, post or like, once its success UI has settled. Every
  // action also sends the pushes it caused.
  useEffect(() => {
    if (!featureOn) return;
    const timers = new Set<number>();
    const stop = onSocialAction((action) => {
      firePushFlush();
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
  }, [evaluate, featureOn]);

  // Existing installed users: once, on Home, after the first idle and a beat.
  useEffect(() => {
    if (!featureOn) return;
    let timer = 0;
    const cancelIdle = afterFirstIdle(() => {
      timer = window.setTimeout(() => void evaluate("existing-open"), EXISTING_OPEN_DELAY_MS);
    });
    return () => {
      cancelIdle();
      window.clearTimeout(timer);
    };
  }, [evaluate, featureOn]);

  // Notification taps route client-side; a push for the open screen refreshes it.
  useEffect(() => {
    if (!featureOn || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "push:navigate") {
        event.ports[0]?.postMessage("ok");
        router.push(sameOriginPath(data.url));
        return;
      }
      if (data.type === "push:refresh") void refreshInbox().catch(() => undefined);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [featureOn, refreshInbox, router]);

  // App icon badge: unread notifications plus unread DMs, kept current as
  // they're read and whenever the app comes back to the front.
  const unread = notifications.filter((note) => !note.read).length + unreadMessageCount;
  useEffect(() => {
    if (!featureOn) return;
    setAppBadge(unread);
    const onVisible = () => {
      if (document.visibilityState === "visible") setAppBadge(unread);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [featureOn, unread]);

  // Quiet hours follow the user's zone: refresh it on open if it changed.
  useEffect(() => {
    if (!featureOn) return;
    const zone = deviceTimeZone();
    if (!zone) return;
    let cancelled = false;
    const cancelIdle = afterFirstIdle(() => {
      void (async () => {
        const { loadSupabaseBrowser } = await import("@/lib/supabase/browser-lazy");
        const client = await loadSupabaseBrowser();
        if (!client || cancelled) return;
        const { data } = await client.from("notification_prefs").select("time_zone").eq("user_id", userId).maybeSingle();
        const saved = (data as { time_zone?: string } | null)?.time_zone;
        if (!saved || saved === zone || cancelled) return;
        await client
          .from("notification_prefs")
          .update({ time_zone: zone, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      })().catch(() => undefined);
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [featureOn, userId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!featureOn) return null;

  const dismiss = () => {
    if (!ask) return;
    const key = ask === "add-to-home" ? homeAskKey(userId) : askKey(userId);
    const state: AskState = parseAskState(readStorage("local", key));
    writeStorage("local", key, JSON.stringify(dismissedState(state, Date.now())));
    trackEvent("push_ask_dismissed", { result: ask });
    setAsk(null);
  };

  const accept = () => {
    if (ask === "add-to-home") {
      trackEvent("push_ask_accepted", { result: ask });
      setAsk(null);
      setGuideOpen(true);
      return;
    }
    // iOS only grants from inside the tap: nothing is awaited before this call.
    let answer: Promise<NotificationPermission>;
    try {
      answer = Promise.resolve(Notification.requestPermission());
    } catch {
      answer = Promise.resolve(Notification.permission);
    }
    trackEvent("push_ask_accepted", { result: "push" });
    setAsk(null);
    void answer.then(async (result) => {
      trackEvent("push_permission_result", { result });
      if (result !== "granted") return;
      if (await subscribeDevice(userId)) setToast("Notifications on");
    });
  };

  return (
    <>
      {ask ? <SoftAsk surface={ask} onPrimary={accept} onDismiss={dismiss} /> : null}
      {guideOpen ? <InstallGuide platform="ios-safari" variant="menu" onDone={() => setGuideOpen(false)} /> : null}
      {toast ? <PushToast text={toast} /> : null}
    </>
  );
}
