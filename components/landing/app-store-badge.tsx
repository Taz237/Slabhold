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

const focus =
  "focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] focus-visible:outline-none";

/**
 * The App Store link as a button, for web visitors. "button" is the hero's
 * secondary action ("Get the app"); "badge" is the two-line store badge that
 * closes the page. Hidden inside the iOS app. The row keeps its height either
 * way, so nothing jumps when the link appears after hydration.
 */
export function AppStoreBadge({ variant }: { variant: "button" | "badge" }) {
  const web = useSyncExternalStore(subscribe, () => !isNativeApp(), () => false);
  const track = () => trackEvent("landing_cta_clicked", { button: "app_store" });
  if (variant === "button") {
    return (
      <div data-app-store-badge="button" className="h-14">
        {web ? (
          <a
            href={APP_STORE_URL}
            onClick={track}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] text-[17px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-white/[0.08] active:scale-[0.98] motion-reduce:transition-none ${focus}`}
          >
            <AppleMark className="-mt-0.5 h-5 w-5" />
            Get the app
          </a>
        ) : null}
      </div>
    );
  }
  return (
    <div data-app-store-badge="badge" className="mt-4 flex h-14 justify-center">
      {web ? (
        <a
          href={APP_STORE_URL}
          onClick={track}
          aria-label="Download Slabhold on the App Store"
          className={`inline-flex h-14 items-center gap-3 rounded-2xl border border-white/20 bg-black px-5 text-left text-white transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none ${focus}`}
        >
          <AppleMark className="h-8 w-8" />
          <span>
            <span className="block text-[11px] leading-3 text-zinc-300">Download on the</span>
            <span className="block text-[20px] leading-6 font-semibold tracking-tight">App Store</span>
          </span>
        </a>
      ) : null}
    </div>
  );
}
