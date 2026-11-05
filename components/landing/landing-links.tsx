"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, createContext, lazy, useEffect, type ReactNode } from "react";
import type { CompDemo } from "@/components/landing/showcase/sample-data";
import { trackEvent } from "@/lib/analytics";
import { landingLoginHref, landingSignupHref, safeNext } from "@/lib/auth/safe-next";
import { prefetchOnce, warmOnFirstInteraction } from "@/lib/landing/warm-routes";
import { afterFirstIdle } from "@/lib/ui/idle";

/*
 * The landing page is drawn on the server. These are its only client parts:
 * links that carry ?next= and count taps, and the panels below the hero.
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

/**
 * Below the hero. The server HTML has the panels; their code loads once the
 * page is idle and they hydrate then, so it is never in the way of the first
 * paint (next/dynamic would preload it from the head). Scrolling works before
 * that; the dots answer once hydrated.
 */
const LazyPanels = lazy(() =>
  (typeof window === "undefined" ? Promise.resolve() : new Promise<void>((resolve) => afterFirstIdle(resolve))).then(
    () => import("@/components/landing/feature-panels").then((mod) => ({ default: mod.FeaturePanels })),
  ),
);

export function FeaturePanels() {
  return (
    <Suspense fallback={<PanelsSkeleton />}>
      <LazyPanels />
    </Suspense>
  );
}

/** The founder's real card for the Quick Comp demo. Null plays the sample. */
export const LandingCompContext = createContext<CompDemo | null>(null);

/** Set by the page around the landing, so the lazy panels get the real card. */
export function LandingCompProvider({ comp, children }: { comp: CompDemo | null; children: ReactNode }) {
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

/** Create account and Log in, carrying ?next=. */
export function LandingCta() {
  return (
    <Suspense fallback={<LandingActions next="/" />}>
      <FromSearch render={(next) => <LandingActions next={next} />} />
    </Suspense>
  );
}

/** A link that counts its tap as a landing call to action. */
export function LandingLink({
  button,
  ...props
}: React.ComponentProps<typeof IntentLink> & { button: string }) {
  return <IntentLink {...props} onClick={() => trackEvent("landing_cta_clicked", { button })} />;
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

export function LandingActions({ next }: { next: string }) {
  return (
    <div className="mt-7 space-y-2">
      <IntentLink
        href={landingSignupHref(next)}
        onClick={() => trackEvent("landing_cta_clicked", { button: "signup" })}
        className="flex h-14 w-full items-center justify-center rounded-full bg-[#7C3AED] text-[17px] font-semibold text-white transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] focus-visible:outline-none lg:max-w-sm"
      >
        Create account
      </IntentLink>
      <p className="text-center text-[15px] text-zinc-400 lg:max-w-sm">
        Have an account?{" "}
        <IntentLink
          href={landingLoginHref(next)}
          onClick={() => trackEvent("landing_cta_clicked", { button: "login" })}
          className="hit-44 inline-flex items-center font-semibold text-white underline underline-offset-4"
        >
          Log in
        </IntentLink>
      </p>
    </div>
  );
}

function PanelsSkeleton() {
  return (
    <div aria-hidden className="mt-14">
      <div className="skeleton-shimmer h-[392px] w-full rounded-[1.75rem] sm:w-[340px]" />
      <div className="mt-4 h-11" />
    </div>
  );
}
