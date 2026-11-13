"use client";

import { useSyncExternalStore } from "react";
import { installPlatform, type InstallPlatform } from "@/lib/pwa/install-step";
import { isNativeApp } from "@/lib/ios/platform";

const noopSubscribe = () => () => {};

function readPlatform(): InstallPlatform {
  // The iOS app: no install step or Add to Home Screen, same as a computer.
  if (isNativeApp()) return "desktop";
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return installPlatform({
    userAgent: nav.userAgent ?? "",
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    navigatorStandalone: nav.standalone === true,
    displayModeStandalone: Boolean(window.matchMedia?.("(display-mode: standalone)").matches),
  });
}

/**
 * This device, from the browser. Null on the server and during hydration.
 * Its own module, so signed-out Home doesn't load the install guide to read it.
 */
export function useInstallPlatform(): InstallPlatform | null {
  return useSyncExternalStore(noopSubscribe, readPlatform, () => null);
}

/** True inside the iPhone app. False on the server and during hydration. */
export function useNativeApp(): boolean {
  return useSyncExternalStore(noopSubscribe, isNativeApp, () => false);
}
