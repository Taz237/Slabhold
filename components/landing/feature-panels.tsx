"use client";

import { Suspense, lazy, use, useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Badge } from "@/components/badges/badge";
import { LandingCompContext, LandingLink, LandingPickupContext } from "@/components/landing/landing-links";
import { canAnimate, EASE, onceVisible, prefersReducedMotion } from "@/components/landing/showcase/motion";
import { SAMPLE_ACCOUNTS_LABEL, SAMPLE_ACCOUNTS_NOTE, type CompDemo, type PickupDemo } from "@/components/landing/showcase/sample-data";
import { landingSignupHref } from "@/lib/auth/safe-next";
import { BADGE_THRESHOLDS, BADGE_TIERS, CATEGORY_COPY, TIER_LABELS, type BadgeTier } from "@/lib/badges/config";
import { QUICK_COMP_PATH, quickCompEnabled } from "@/lib/quick-comp/flag";
import { WhenNear } from "@/lib/ui/when-near";

/*
 * Four chapters below the hero, each built from the real app with sample
 * data. The frames (heading, line, Sample tag, a fixed-height slot) are drawn
 * on the server; each chapter's demo is its own chunk, loaded when the slot
 * nears the viewport. No network beyond those chunks and /public files.
 */

const QuickCompDemo = lazy(() => import("@/components/landing/showcase/quick-comp-demo"));
const TimelineDemo = lazy(() => import("@/components/landing/showcase/timeline-demo"));
const GraphsDemo = lazy(() => import("@/components/landing/showcase/graphs-demo"));

type PopupComponent = ComponentType<{ tier: BadgeTier; onClose: () => void }>;

export const CHAPTERS = [
  { id: "quick-comp", title: "Quick Comp", line: "Recent sold prices, the median and the range." },
  { id: "timeline", title: "Collectors talking cards", line: "Follow collectors and see their pickups, questions and replies as they post." },
  { id: "graphs", title: "Your collection, over time", line: "Your cards add up to one value, with its history drawn day by day." },
  { id: "achievements", title: "Earn every tier", line: "Climb from Bronze to Legendary as your collection grows." },
] as const;

type ChapterId = (typeof CHAPTERS)[number]["id"];

/** The visual slot under each chapter's toolbar. Fixed, so nothing moves while a demo loads. */
export const CHAPTER_HEIGHTS: Record<ChapterId, string> = {
  // Narrow phones wrap the card line and the attribution onto one more line each.
  "quick-comp": "h-[436px] min-[380px]:h-[412px]",
  timeline: "h-[440px]",
  graphs: "h-[316px]",
  achievements: "h-[320px]",
};

/** Index of the panel closest to the left edge of the scroller. */
export function panelIndexAt(scrollLeft: number, panelWidth: number, count: number): number {
  if (panelWidth <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / panelWidth)));
}

function chapter(id: ChapterId) {
  return CHAPTERS.find((item) => item.id === id)!;
}

/**
 * The chapters, Quick Comp first when its flag is on. `comp` is a real card
 * from the founder's collection for Quick Comp; without it, the sample plays.
 * `pickup` is his real slab for the timeline's pickup post.
 */
export function FeaturePanels({ comp, pickup }: { comp?: CompDemo | null; pickup?: PickupDemo | null }) {
  const quickComp = quickCompEnabled();
  const handed = use(LandingCompContext);
  const handedPickup = use(LandingPickupContext);
  // A real photo that fails to load swaps the whole demo back to the sample.
  const [real, setReal] = useState(comp === undefined ? handed : comp);
  return (
    <section aria-label="What you can do on Slabhold" data-always-dark="" className="mt-20 flex flex-col gap-24 lg:mt-28 lg:gap-32">
      {quickComp ? (
        <Chapter
          id="quick-comp"
          owner={real?.owner ?? null}
          extra={
            <LandingLink
              button="signup"
              href={landingSignupHref(QUICK_COMP_PATH)}
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[15px] font-semibold text-[#A78BFA] underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
            >
              Sign up to comp any card
              <ArrowRight aria-hidden size={16} strokeWidth={1.5} />
            </LandingLink>
          }
        >
          {(run) => <QuickCompDemo key={real ? "real" : "sample"} run={run} comp={real} onPhotoError={() => setReal(null)} />}
        </Chapter>
      ) : null}
      <Chapter id="timeline" note={SAMPLE_ACCOUNTS_NOTE} region={SAMPLE_ACCOUNTS_LABEL} flip>
        {(run) => <TimelineDemo run={run} pickup={pickup === undefined ? handedPickup : pickup} />}
      </Chapter>
      <Chapter id="graphs">
        {(run) => <GraphsDemo run={run} gain={<p className="text-sm font-semibold text-[#A78BFA] tabular-nums">+$38 · 10.2%</p>} />}
      </Chapter>
      <Achievements />
    </section>
  );
}

export function SampleTag() {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-white/15 px-2 font-mono text-[11px] font-medium text-zinc-300">
      Sample
    </span>
  );
}

function ReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none motion-reduce:hidden"
    >
      <RotateCcw aria-hidden size={16} strokeWidth={1.5} />
      Replay
    </button>
  );
}

function ChapterCopy({ id, titleId, extra }: { id: ChapterId; titleId: string; extra?: ReactNode }) {
  const { title, line } = chapter(id);
  return (
    <div>
      <h2 id={titleId} className="text-[28px] leading-9 font-semibold tracking-[-0.02em] text-white lg:text-[40px] lg:leading-[48px]">
        {title}
      </h2>
      <p className="mt-2 max-w-sm text-[16px] leading-6 text-zinc-400 lg:text-[18px] lg:leading-7">{line}</p>
      {extra}
    </div>
  );
}

function Toolbar({ note, owner = null, children }: { note?: string; owner?: string | null; children?: ReactNode }) {
  return (
    <div className="flex h-11 items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        {/* Over a real card, the collector is named the way the hero caption names them. */}
        {owner ? (
          <span className="truncate font-mono text-[10px] leading-4 text-zinc-400">From @{owner}&apos;s collection</span>
        ) : (
          <SampleTag />
        )}
        {note ? <span className="truncate text-[13px] text-zinc-400">{note}</span> : null}
      </span>
      {children}
    </div>
  );
}

function DemoSkeleton() {
  return <div aria-hidden className="skeleton-shimmer h-full w-full rounded-2xl" />;
}

/**
 * One chapter: copy on one side, the demo on the other (stacked on phones).
 * The demo's chunk loads near the viewport; Replay plays it again.
 */
function Chapter({
  id,
  extra,
  note,
  owner = null,
  region,
  flip = false,
  children,
}: {
  id: ChapterId;
  extra?: ReactNode;
  note?: string;
  /** A real card's collector, named instead of the Sample tag. */
  owner?: string | null;
  /** An aria-label for the demo, which then becomes a region. */
  region?: string;
  flip?: boolean;
  children: (run: number) => ReactNode;
}) {
  const titleId = useId();
  const [run, setRun] = useState(0);
  return (
    <article data-chapter={id} aria-labelledby={titleId} className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
      <div className={flip ? "lg:order-2" : undefined}>
        <ChapterCopy id={id} titleId={titleId} extra={extra} />
      </div>
      <div className="mt-6 lg:mt-0">
        <Toolbar note={note} owner={owner}>
          <ReplayButton onClick={() => setRun((count) => count + 1)} />
        </Toolbar>
        <div role={region ? "region" : undefined} aria-label={region} className={`relative mt-2 ${CHAPTER_HEIGHTS[id]}`}>
          <WhenNear className="h-full" fallback={<DemoSkeleton />}>
            <Suspense fallback={<DemoSkeleton />}>{children(run)}</Suspense>
          </WhenNear>
        </div>
      </div>
    </article>
  );
}

/** "100 cards with a real photo". */
function tierLine(index: number): string {
  return `${BADGE_THRESHOLDS.collector[index]} ${CATEGORY_COPY.collector.unit} with a real photo`;
}

/**
 * Every tier with the real badge art, one per slide, and the real badge
 * reveal on a tap. Only Legendary keeps its glow.
 */
function Achievements() {
  const titleId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [Popup, setPopup] = useState<PopupComponent | null>(null);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  function panelWidth(): number {
    const first = scroller.current?.firstElementChild as HTMLElement | null;
    if (!first) return 0;
    const gap = parseFloat(getComputedStyle(scroller.current!).columnGap) || 0;
    return first.offsetWidth + gap;
  }

  function show(index: number) {
    const node = scroller.current;
    if (!node) return;
    setActive(index);
    node.scrollTo({ left: index * panelWidth(), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  /** The chapter's one reveal: the shown badge lands with a small overshoot. */
  function land(index: number) {
    const badge = scroller.current?.children[index]?.querySelector("[data-badge]");
    if (!canAnimate(badge) || prefersReducedMotion()) return;
    badge.animate(
      [
        { opacity: 0, transform: "translateY(16px) scale(0.85)" },
        { opacity: 1, transform: "translateY(0) scale(1.04)", offset: 0.7 },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: 500, easing: EASE, fill: "backwards" },
    );
  }

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    return onceVisible(node, () => land(0));
  }, []);

  async function openPopup() {
    if (!Popup) {
      const popup = await import("@/components/landing/showcase/badge-popup");
      setPopup(() => popup.default);
    }
    setOpen(true);
  }

  function closePopup() {
    setOpen(false);
    window.requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
  }

  return (
    <article data-chapter="achievements" aria-labelledby={titleId} className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
      <ChapterCopy id="achievements" titleId={titleId} />
      <div className="mt-6 min-w-0 lg:mt-0">
        <Toolbar>
          <ReplayButton onClick={() => land(active)} />
        </Toolbar>
        <div
          ref={scroller}
          onScroll={(event) => setActive(panelIndexAt(event.currentTarget.scrollLeft, panelWidth(), BADGE_TIERS.length))}
          className={`-mx-6 mt-2 flex min-w-0 snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto overscroll-x-contain px-6 [scrollbar-width:none] [-ms-overflow-style:none] lg:mx-0 lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden ${CHAPTER_HEIGHTS.achievements}`}
        >
          {BADGE_TIERS.map((tier, index) => (
            <div
              key={tier}
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${BADGE_TIERS.length}: ${TIER_LABELS[tier]}`}
              className="flex w-full shrink-0 snap-start flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-center"
            >
              <Badge category="collector" tier={tier} size={tier === "legendary" ? 144 : 128} label="" />
              <p className="mt-5 text-[20px] leading-7 font-semibold text-white">{TIER_LABELS[tier]}</p>
              <p className="mt-1 text-[15px] leading-6 text-zinc-400 tabular-nums">{tierLine(index)}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3">
          <div className="-ml-2 flex items-center" role="group" aria-label="Choose a panel">
            {BADGE_TIERS.map((tier, index) => (
              <button
                key={tier}
                type="button"
                onClick={() => show(index)}
                aria-label={`Show ${TIER_LABELS[tier]}`}
                aria-current={index === active ? "true" : undefined}
                className="grid h-11 w-7 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
              >
                <span
                  className={`block h-2 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${
                    index === active ? "w-5 bg-[#A78BFA]" : "w-2 bg-white/25"
                  }`}
                />
              </button>
            ))}
          </div>
          <button
            ref={opener}
            type="button"
            onClick={() => void openPopup()}
            aria-haspopup="dialog"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-white/10 px-4 text-[15px] font-medium text-zinc-100 transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
          >
            See the pop-up
          </button>
        </div>
      </div>
      {open && Popup ? <Popup tier={BADGE_TIERS[active]} onClose={closePopup} /> : null}
    </article>
  );
}
