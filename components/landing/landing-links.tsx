"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, lazy, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import { landingLoginHref, landingSignupHref, safeNext } from "@/lib/auth/safe-next";
import { afterFirstIdle } from "@/lib/ui/idle";

/*
 * The landing page is drawn on the server. These are its only client parts:
 * links that carry ?next= and count taps, and the panels below the hero.
 */

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

function FromSearch({ render }: { render: (next: string) => ReactNode }) {
  const next = safeNext(useSearchParams().get("next"));
  return <>{render(next)}</>;
}

/** The header's Log in, carrying ?next=. */
export function LandingLogin() {
  return (
    <Suspense fallback={<LoginLink next="/" />}>
      <FromSearch render={(next) => <LoginLink next={next} />} />
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
}: React.ComponentProps<typeof Link> & { button: string }) {
  return <Link {...props} onClick={() => trackEvent("landing_cta_clicked", { button })} />;
}

function LoginLink({ next }: { next: string }) {
  return (
    <Link
      href={landingLoginHref(next)}
      onClick={() => trackEvent("landing_cta_clicked", { button: "login" })}
      className="inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-semibold text-zinc-200 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
    >
      Log in
    </Link>
  );
}

export function LandingActions({ next }: { next: string }) {
  return (
    <div className="mt-7 space-y-2">
      <Link
        href={landingSignupHref(next)}
        onClick={() => trackEvent("landing_cta_clicked", { button: "signup" })}
        className="flex h-14 w-full items-center justify-center rounded-full bg-[#7C3AED] text-[17px] font-semibold text-white shadow-[0_14px_40px_-12px_rgba(124,58,237,0.95)] transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] focus-visible:outline-none lg:max-w-sm"
      >
        Create account
      </Link>
      <p className="text-center text-[15px] text-zinc-400 lg:max-w-sm">
        Have an account?{" "}
        <Link
          href={landingLoginHref(next)}
          onClick={() => trackEvent("landing_cta_clicked", { button: "login" })}
          className="hit-44 inline-flex items-center font-semibold text-white underline underline-offset-4"
        >
          Log in
        </Link>
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
