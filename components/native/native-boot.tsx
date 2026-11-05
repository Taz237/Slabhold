"use client";

import { useEffect } from "react";
import { isNativeApp, loadNative } from "@/lib/ios/platform";

/**
 * Starts the iOS app's native layer. On the web it renders nothing and loads
 * nothing: the native code is its own chunk, fetched only inside the app.
 */
export function NativeBoot() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let stop: (() => void) | undefined;
    let gone = false;
    loadNative()
      .then((native) => {
        if (!gone) stop = native.startNativeShell();
      })
      .catch(() => {});
    return () => {
      gone = true;
      stop?.();
    };
  }, []);
  return null;
}
