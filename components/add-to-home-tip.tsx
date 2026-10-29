"use client";

import { useSyncExternalStore } from "react";
import { Share, X } from "lucide-react";
import { readInstallChoice } from "@/lib/onboarding/store";
import { addToHomeDismissKey, shouldShowAddToHomeTip } from "@/lib/pwa/add-to-home";

const tipHiddenForSession = new Set<string>();

function readTipVisible(userId: string) {
  if (tipHiddenForSession.has(userId)) return false;
  let dismissed = false;
  try {
    dismissed = window.localStorage.getItem(addToHomeDismissKey(userId)) === "1";
  } catch {
    return false;
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return shouldShowAddToHomeTip({
    signedIn: true,
    dismissed,
    stepAnswered: readInstallChoice(userId) !== null,
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    navigatorStandalone: nav.standalone === true,
    displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
  });
}

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function emitDismiss() {
  for (const listener of listeners) listener();
}

/**
 * iPhone Safari only, for collectors who joined before the onboarding step.
 * Hidden once dismissed or answered, and inside the installed app.
 */
export function AddToHomeTip({ userId }: { userId: string }) {
  const visible = useSyncExternalStore(subscribe, () => readTipVisible(userId), () => false);

  function dismiss() {
    try {
      window.localStorage.setItem(addToHomeDismissKey(userId), "1");
    } catch {
      tipHiddenForSession.add(userId);
    }
    emitDismiss();
  }

  if (!visible) return null;

  return (
    <section data-add-to-home className="border-b border-zinc-200 px-4 py-3 dark:border-white/10">
      <div className="relative rounded-2xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss Add to Home Screen"
          className="absolute top-1 right-1 grid h-11 w-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="flex items-center gap-2 pr-12 text-sm font-semibold">
          <Share className="h-4 w-4" aria-hidden />
          Add to Home Screen
        </p>
        <p className="mt-1 pr-12 text-[15px] leading-5 text-zinc-600 dark:text-zinc-300">
          Tap Share (it may be under ⋯), then Add to Home Screen.
        </p>
      </div>
    </section>
  );
}
