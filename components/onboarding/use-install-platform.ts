"use client";

import { useSyncExternalStore } from "react";
import { installPlatform, type InstallPlatform } from "@/lib/pwa/install-step";

const noopSubscribe = () => () => {};

function readPlatform(): InstallPlatform {
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
