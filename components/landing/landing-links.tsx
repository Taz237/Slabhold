"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, createContext, useEffect, type ReactNode } from "react";
import type { CompDemo } from "@/components/landing/showcase/sample-data";
import { trackEvent } from "@/lib/analytics";
import { landingLoginHref, landingSignupHref, safeNext } from "@/lib/auth/safe-next";
import { prefetchOnce, warmOnFirstInteraction } from "@/lib/landing/warm-routes";

/*
 * The landing page is drawn on the server. These are its only client parts:
 * links that carry ?next= and count taps, the App Store button, the slab's
 * tilt, the pause controls and the Quick Comp panel.
 */

/**
 * The app router, or null where none is mounted (the landing page rendered on
 * its own, in tests). Then the links just don't prefetch; `next dev` says so.
 */
function useOptionalRouter() {
  try {
    return useRouter();
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[landing] no app router mounted, so landing links won't prefetch.", error);
    }
    return null;
  }
}

/**
 * Warms /signup and /login (with this page's ?next=) on the reader's first
 * scroll, pointer, key or touch anywhere on the page, or a few seconds after
 * load and the first idle moment. Never before load, so none of it competes
 * with the first paint.
 */
function WarmAuthRoutes({ next }: { next: string }) {
  const router = useOptionalRouter();
  useEffect(
    () =>
      warmOnFirstInteraction(() => {
        prefetchOnce(router, landingSignupHref(next));
        prefetchOnce(router, landingLoginHref(next));
      }),
    [router, next],
  );
  return null;
}

/**
 * next/link that loads its route when a reader shows intent (pointer over it,
 * a touch, keyboard focus), not when it comes into view. Same as the feed: it
 * warms the one you touch. /signup and /login are also warmed early by
 * WarmAuthRoutes; each route is asked for once.
 */
function IntentLink({
  href,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href" | "prefetch" | "onPointerEnter" | "onTouchStart" | "onFocus"> & {
  href: string;
}) {
  const router = useOptionalRouter();
  const warm = () => prefetchOnce(router, href);
  return <Link {...props} href={href} prefetch={false} onPointerEnter={warm} onTouchStart={warm} onFocus={warm} />;
}

/** One real card's stored sold prices for Quick Comp and the hero's sold-price line. Null draws neither. */
export const LandingCompContext = createContext<CompDemo | null>(null);

/** Set by the page around the landing, so the Quick Comp panel gets the real card. */
export function LandingCompProvider({ comp, children }: { comp: CompDemo | null; children?: ReactNode }) {
  return <LandingCompContext value={comp}>{children}</LandingCompContext>;
}

function FromSearch({ render }: { render: (next: string) => ReactNode }) {
  const next = safeNext(useSearchParams().get("next"));
  return <>{render(next)}</>;
}

/** The header's Log in, carrying ?next=. It also warms /signup and /login early, once per page. */
export function LandingLogin() {
  return (
    <Suspense fallback={<LoginLink next="/" />}>
      <FromSearch
        render={(next) => (
          <>
            <WarmAuthRoutes next={next} />
            <LoginLink next={next} />
          </>
        )}
      />
    </Suspense>
  );
}

/**
 * Open Slabhold, carrying ?next=. On the web it is the glass button beside
 * the App Store one; inside the iOS app, where that one is hidden, it is the
 * only action.
 */
export function LandingOpen() {
  return (
    <Suspense fallback={<OpenLink next="/" />}>
      <FromSearch render={(next) => <OpenLink next={next} />} />
    </Suspense>
  );
}

function OpenLink({ next }: { next: string }) {
  return (
    <IntentLink
      href={landingSignupHref(next)}
      onClick={() => trackEvent("landing_cta_clicked", { button: "open" })}
      className="lg-btn lg-btn-glass lg-glass"
    >
      Open Slabhold
    </IntentLink>
  );
}

function LoginLink({ next }: { next: string }) {
  return (
    <IntentLink
      href={landingLoginHref(next)}
      onClick={() => trackEvent("landing_cta_clicked", { button: "login" })}
      className="inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-semibold text-zinc-200 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
    >
      Log in
    </IntentLink>
  );
}
