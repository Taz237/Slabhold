"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { hideSplash, isNativeApp, loadNative } from "@/lib/ios/platform";

/**
 * Starts the iOS app's native layer. On the web it renders nothing and loads
 * nothing: the native code is its own chunk, fetched only inside the app.
 */
export function NativeBoot() {
  const router = useRouter();
  useEffect(() => {
    if (!isNativeApp()) return;
    hideSplash();
    let stop: (() => void) | undefined;
    let gone = false;
    loadNative()
      .then((native) => {
        if (!gone) stop = native.startNativeShell({ navigate: (path) => router.push(path) });
      })
      .catch(() => {});
    return () => {
      gone = true;
      stop?.();
    };
  }, [router]);
  return null;
}
