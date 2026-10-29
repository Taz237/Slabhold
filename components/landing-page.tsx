"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { FounderNote } from "@/components/landing/founder-note";
import { HeroSlabs } from "@/components/landing/hero-slabs";
import { useFounderShowcase } from "@/components/landing/use-founder";
import type { FounderShowcase } from "@/lib/landing/founder";
import { Logo } from "@/components/logo";
import { trackEvent } from "@/lib/analytics";
import { landingLoginHref, landingSignupHref, safeNext } from "@/lib/auth/safe-next";

/** Below the hero, so it loads in its own chunk after the hero paints. */
const FeaturePanels = dynamic(
  () => import("@/components/landing/feature-panels").then((mod) => mod.FeaturePanels),
  { loading: () => <PanelsSkeleton /> },
);

/** `founder` is the server's hour-cached showcase, so the hero slabs paint with the page. */
export function LandingPage({ founder: initial = null }: { founder?: FounderShowcase | null }) {
  const founder = useFounderShowcase(initial);
  const showcase = founder.status === "ready" ? founder.showcase : null;
  return (
    <div className="min-h-dvh overflow-x-clip bg-[#09090b] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.32),_transparent_58%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:max-w-5xl">
        <header className="flex min-h-14 items-center justify-between">
          <span className="flex items-center gap-2">
            <Logo />
            <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
          </span>
          <Suspense fallback={<LoginLink next="/" />}>
            <FromSearch render={(next) => <LoginLink next={next} />} />
          </Suspense>
        </header>

        <section className="mt-6 lg:mt-14 lg:grid lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-12">
          <div className="lg:order-2">
            <HeroSlabs cards={showcase ? showcase.cards : null} owner={showcase?.profile?.username ?? null} />
          </div>
          <div className="mt-6 text-center lg:mt-0 lg:text-left">
            <h1 className="text-[2.5rem] leading-[1.05] font-extrabold tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
              Your cards.
              <br />
              Your comps.
              <br />
              <span className="bg-gradient-to-r from-[#A78BFA] to-[#7C3AED] bg-clip-text text-transparent">
                Your people.
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-[16px] leading-6 text-zinc-400 lg:mx-0">
              Track your sports cards with recent sold prices, and share them with collectors who get it.
            </p>
            <Suspense fallback={<LandingActions next="/" />}>
              <LandingActionsFromSearch />
            </Suspense>
          </div>
        </section>

        <FeaturePanels />

        <div className="mt-12 lg:mx-auto lg:w-full lg:max-w-md">
          <FounderNote showcase={showcase} />
        </div>

        <section className="mt-10 rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#2e1065]/70 to-[#09090b] px-6 py-10 text-center">
          <Logo className="mx-auto h-12 w-12" />
          <h2 className="mt-4 text-[2rem] leading-tight font-extrabold tracking-tight text-white">Join free</h2>
          <p className="mx-auto mt-2 max-w-xs text-[15px] leading-6 text-zinc-400">
            Bring your collection. Find your people. It takes a minute.
          </p>
          <div className="mx-auto max-w-sm">
            <Suspense fallback={<LandingActions next="/" />}>
              <LandingActionsFromSearch />
            </Suspense>
          </div>
        </section>

        <footer className="mt-auto flex gap-4 pt-10 text-sm text-zinc-400">
          <Link href="/privacy" className="hit-44 inline-flex items-center font-semibold underline underline-offset-2">
            Privacy
          </Link>
          <Link href="/terms" className="hit-44 inline-flex items-center font-semibold underline underline-offset-2">
            Terms
          </Link>
        </footer>
      </div>
    </div>
  );
}

function FromSearch({ render }: { render: (next: string) => React.ReactNode }) {
  const next = safeNext(useSearchParams().get("next"));
  return <>{render(next)}</>;
}

function LandingActionsFromSearch() {
  const next = safeNext(useSearchParams().get("next"));
  return <LandingActions next={next} />;
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
