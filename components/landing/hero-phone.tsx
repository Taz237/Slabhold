import { ValueSpark } from "@/components/charts/value-spark";
import { HeroSlabs } from "@/components/landing/hero-slabs";
import { NoHeadPreload } from "@/components/landing/no-head-preload";
import { PhoneFrame } from "@/components/landing/phone-frame";
import { sampleValueLine } from "@/components/landing/showcase/sample-data";
import { Tilt } from "@/components/landing/tilt";
import { Logo } from "@/components/logo";
import type { FounderCard } from "@/lib/landing/founder";

/** The sample collection value, as the collection chapter shows it. */
export const HERO_VALUE = "$412";
export const HERO_GAIN = "+$38 · 10.2%";

/**
 * The hero's phone: a collection, drawn on the server from the app's own
 * parts. A sample value and its 90-day line (ValueSpark) sit over the three
 * slabs, which are real cards from a public collection when the page has
 * them. The value is always marked Sample. The phone leans toward a pointer
 * or a touch; on phones it runs past the fold so the page invites a scroll.
 */
export function HeroPhone({ cards }: { cards: readonly FounderCard[] | null }) {
  const points = sampleValueLine();
  return (
    <div className="mx-auto h-[416px] w-[296px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_82%,transparent)] lg:h-auto lg:w-[328px] lg:overflow-visible lg:[mask-image:none]">
      <Tilt>
        <PhoneFrame>
          <div className="px-4 pt-11 pb-6 lg:pb-8">
            <div className="flex h-8 items-center justify-between">
              <span className="flex items-center gap-2">
                <NoHeadPreload>
                  <Logo className="h-6 w-6" />
                </NoHeadPreload>
                <span className="text-[15px] font-semibold text-white">Collection</span>
              </span>
              <span className="inline-flex h-6 items-center rounded-full border border-white/15 px-2 font-mono text-[11px] font-medium text-zinc-300">
                Sample
              </span>
            </div>
            <p className="mt-4 text-[13px] leading-5 text-zinc-400">Collection value</p>
            <p className="text-[32px] leading-10 font-semibold tracking-tight text-white tabular-nums">{HERO_VALUE}</p>
            <p className="flex items-center gap-2 text-[13px] leading-5">
              <span className="font-semibold text-[#A78BFA] tabular-nums">{HERO_GAIN}</span>
              <span className="text-zinc-400">Last 90 days</span>
            </p>
            <div data-always-dark="" className="mt-3">
              <ValueSpark
                id="hero-value"
                points={points}
                tone="accent"
                height={56}
                ariaLabel={`Sample collection value ${HERO_VALUE}, up $38 in 90 days`}
              />
            </div>
            <div className="mt-6">
              <HeroSlabs cards={cards} />
            </div>
          </div>
        </PhoneFrame>
      </Tilt>
    </div>
  );
}
