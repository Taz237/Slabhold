"use client";

import { useSyncExternalStore } from "react";

export const OFFLINE_COPY = "You're offline. Showing what's already loaded";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function isOffline() {
  return navigator.onLine === false;
}

/**
 * A quiet strip under the header while the phone has no connection, gone the
 * moment it's back. The server and the first paint always render nothing, so
 * it never shifts the page on load.
 */
export function OfflineBanner() {
  const offline = useSyncExternalStore(subscribe, isOffline, () => false);
  if (!offline) return null;
  return (
    <p
      role="status"
      data-offline-banner=""
      className="flex min-h-8 items-center justify-center gap-2 border-t border-zinc-200 bg-zinc-100 px-4 py-1.5 text-[13px] leading-5 font-medium text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-500" />
      {OFFLINE_COPY}
    </p>
  );
}
