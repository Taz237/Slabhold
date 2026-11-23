"use client";

import { useSyncExternalStore } from "react";
import { NoHeadPreload } from "@/components/landing/no-head-preload";
import { trackEvent } from "@/lib/analytics";
import { isNativeApp } from "@/lib/ios/platform";
import { APP_STORE_URL } from "@/lib/landing/app-store";

/** Apple's official US English badge artwork, unchanged (public/landing/app-store-badge.svg). */
export const APP_STORE_BADGE_SRC = "/landing/app-store-badge.svg";
/** The badge's own words. They appear on the page only as this artwork's name. */
export const APP_STORE_BADGE_NAME = "Download on the App Store";

function subscribe() {
  return () => {};
}

/**
 * The App Store link for web visitors: Apple's official badge, linked to the
 * listing. It is the page's main action in the nav, the hero and the close.
 * It is in the server HTML, so it paints with the page and nothing moves when
 * React arrives. Inside the iOS app it is never shown: a head script tags
 * <html data-native> before the first paint and CSS hides
 * [data-app-store-badge] there (app/landing.css), and this check then takes
 * the link out of the page.
 */
export function AppStoreBadge({ variant }: { variant: "primary" | "nav" }) {
  const web = useSyncExternalStore(subscribe, () => !isNativeApp(), () => true);
  // Apple's artwork is 3:1. 40px tall in the nav, 48px as the main action.
  const height = variant === "nav" ? 40 : 48;
  return (
    <div data-app-store-badge={variant} className="lp-badge">
      {web ? (
        <a
          href={APP_STORE_URL}
          onClick={() => trackEvent("landing_cta_clicked", { button: "app_store" })}
          className="lp-badge-link"
        >
          <NoHeadPreload>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={APP_STORE_BADGE_SRC} alt={APP_STORE_BADGE_NAME} width={height * 3} height={height} decoding="async" />
          </NoHeadPreload>
        </a>
      ) : null}
    </div>
  );
}
