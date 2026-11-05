"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isNativeApp } from "@/lib/ios/platform";

/**
 * Starts the iOS app's native layer. On the web it renders nothing and loads
 * nothing: the shell and its plugins are a separate chunk, fetched only in the app.
 */
export function NativeBoot() {
  const router = useRouter();
  useEffect(() => {
    if (!isNativeApp()) return;
    let stop: (() => void) | undefined;
    let gone = false;
    import("@/lib/ios/shell")
      .then((shell) => shell.startNativeShell({ navigate: (path) => router.push(path) }))
      .then((cleanup) => {
        if (gone) cleanup();
        else stop = cleanup;
      })
      .catch(() => {});
    return () => {
      gone = true;
      stop?.();
    };
  }, [router]);
  return null;
}
