import Link from "next/link";
import { FounderNote } from "@/components/landing/founder-note";
import { HeroSlabs } from "@/components/landing/hero-slabs";
import { FeaturePanels, LandingCta, LandingLogin } from "@/components/landing/landing-links";
import { Logo } from "@/components/logo";
import type { FounderShowcase } from "@/lib/landing/founder";
import { readFounderShowcase } from "@/lib/landing/founder-showcase";

/**
 * Signed-out Home, drawn on the server: the hero and its photos paint from
 * the HTML and never redraw. `founder` is the server's hour-cached showcase,
 * so the hero slabs paint with the page. The links that read ?next= and the
 * panels below the hero are the only client code.
 */
export function LandingPage({ founder = null }: { founder?: FounderShowcase | null }) {
  const showcase = founder ? readFounderShowcase(founder) : null;
  return (
    <div className="min-h-dvh overflow-x-clip bg-[#09090b] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.32),_transparent_58%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:max-w-5xl">
        <header className="flex min-h-14 items-center justify-between">
          <span className="flex items-center gap-2">
            <Logo />
            <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
          </span>
          <LandingLogin />
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
            <LandingCta />
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
            <LandingCta />
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
