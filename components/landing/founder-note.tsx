import { NoHeadPreload } from "@/components/landing/no-head-preload";
import { Logo } from "@/components/logo";

/** The slogan, word for word. */
export const SLOGAN = "Built by collectors, for collectors.";

/**
 * The slogan as the page's one big statement, right under the hero: the logo,
 * then "Built by collectors, for collectors." in display type over a soft
 * purple light, between two hairlines. It names no one: it speaks
 * for the team. Drawn on the server.
 */
export function FounderNote() {
  return (
    <section data-founder-note="plain" className="landing-reveal relative mt-24 text-center lg:mt-32">
      <div aria-hidden className="mx-auto h-px w-full max-w-3xl bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)]" />
      <div className="relative px-2 py-16 lg:py-24">
        <div aria-hidden className="absolute inset-x-[10%] top-[30%] bottom-[20%] rounded-[50%] bg-[#7C3AED] opacity-25 blur-[72px]" />
        <div className="relative">
          <NoHeadPreload>
            <Logo className="mx-auto h-12 w-12 lg:h-14 lg:w-14" />
          </NoHeadPreload>
          <h2 className="mt-8 text-[2.125rem] leading-[1.04] font-semibold tracking-[-0.04em] text-white min-[400px]:text-[2.5rem] sm:text-6xl lg:mt-10 lg:text-[5.5rem]">
            Built by collectors,
            <br />
            <span className="text-[#A78BFA]">for collectors.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-sm text-[16px] leading-6 text-pretty text-zinc-400 lg:mt-8 lg:max-w-md lg:text-[18px] lg:leading-7">
            We made Slabhold for the way the hobby really works: comp it, track it, show it off.
          </p>
        </div>
      </div>
      <div aria-hidden className="mx-auto h-px w-full max-w-3xl bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)]" />
    </section>
  );
}
