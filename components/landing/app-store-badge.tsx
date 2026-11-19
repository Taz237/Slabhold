"use client";

import { useSyncExternalStore } from "react";
import { APP_STORE_URL } from "@/components/landing/app-store-link";
import { trackEvent } from "@/lib/analytics";
import { isNativeApp } from "@/lib/ios/platform";

function subscribe() {
  return () => {};
}

function AppleMark({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M16.37 1.43c0 1.14-.5 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.2-2.98.81-.94 2.15-1.64 3.25-1.68.03.13.06.28.06.43Zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8C4.97 18.38 3.93 15.57 3.93 12.92c0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.62 0 2.89.06 4.38 2.19-.13.09-2.39 1.37-2.39 4.19 0 3.26 2.86 4.42 2.96 4.45Z" />
    </svg>
  );
}

/**
 * The App Store link, for web visitors. "primary" is the page's main action
 * ("Get the app") in the hero and the closing slab; "nav" is the slim one in
 * the sticky header. Hidden inside the iOS app. The row keeps its size either
 * way, so nothing jumps when the link appears after hydration.
 */
export function AppStoreBadge({ variant }: { variant: "primary" | "nav" }) {
  const web = useSyncExternalStore(subscribe, () => !isNativeApp(), () => false);
  const track = () => trackEvent("landing_cta_clicked", { button: "app_store" });
  if (variant === "nav") {
    return (
      <div data-app-store-badge="nav" className="h-11 min-w-[126px]">
        {web ? (
          <a href={APP_STORE_URL} onClick={track} className="lg-nav-cta">
            <AppleMark className="-mt-0.5 h-4 w-4" />
            Get the app
          </a>
        ) : null}
      </div>
    );
  }
  return (
    <div data-app-store-badge="primary" className="h-14">
      {web ? (
        <a href={APP_STORE_URL} onClick={track} className="lg-btn lg-btn-primary">
          <AppleMark className="-mt-0.5 h-5 w-5" />
          Get the app
        </a>
      ) : null}
    </div>
  );
}
