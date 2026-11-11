"use client";

import { useSyncExternalStore } from "react";
import { isNativeApp } from "@/lib/ios/platform";

export const APP_STORE_URL = "https://apps.apple.com/app/id6831357026";

function subscribe() {
  return () => {};
}

/**
 * A plain App Store link under the landing call to action, for web visitors.
 * Hidden inside the iOS app. The row keeps its height either way, so the page
 * never jumps when the link appears after hydration.
 */
export function AppStoreLink() {
  const web = useSyncExternalStore(subscribe, () => !isNativeApp(), () => false);
  return (
    <p data-app-store-link="" className="mt-1 min-h-11 text-center text-[15px] text-zinc-400 lg:max-w-sm">
      {web ? (
        <a
          href={APP_STORE_URL}
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
        >
          Get Slabhold on the App Store
        </a>
      ) : null}
    </p>
  );
}
