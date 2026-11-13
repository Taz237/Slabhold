"use client";

import { Suspense, lazy, use, useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Badge } from "@/components/badges/badge";
import { LandingCompContext, LandingLink, LandingPickupContext } from "@/components/landing/landing-links";
import { Tilt } from "@/components/landing/tilt";
import { canAnimate, EASE, onceVisible, prefersReducedMotion } from "@/components/landing/showcase/motion";
import { SAMPLE_ACCOUNTS_LABEL, SAMPLE_ACCOUNTS_NOTE, type CompDemo, type PickupDemo } from "@/components/landing/showcase/sample-data";
import { landingSignupHref } from "@/lib/auth/safe-next";
import { BADGE_THRESHOLDS, BADGE_TIERS, CATEGORY_COPY, TIER_LABELS, type BadgeTier } from "@/lib/badges/config";
import { QUICK_COMP_PATH, quickCompEnabled } from "@/lib/quick-comp/flag";
import { WhenNear } from "@/lib/ui/when-near";

/*
 * Below the hero, each part built from the real app with sample data: the
 * scanner showcase (a phone that plays the scan flow), a tappable carousel
 * (Scan, Comp, Collection, Feed, Leaderboard) and the badge tiers. The frames
 * (heading, line, Sample tag, a fixed-height slot) are drawn on the server;
 * each demo is its own chunk, loaded when its slot nears the viewport. No
 * network beyond those chunks and /public files.
 */

const ScanDemo = lazy(() => import("@/components/landing/showcase/scan-demo"));
const ScanResultDemo = lazy(() => import("@/components/landing/showcase/scan-result-demo"));
const QuickCompDemo = lazy(() => import("@/components/landing/showcase/quick-comp-demo"));
const TimelineDemo = lazy(() => import("@/components/landing/showcase/timeline-demo"));
const GraphsDemo = lazy(() => import("@/components/landing/showcase/graphs-demo"));
const LeaderboardDemo = lazy(() => import("@/components/landing/showcase/leaderboard-demo"));

type PopupComponent = ComponentType<{ tier: BadgeTier; onClose: () => void }>;

export const CHAPTERS = [
  {
    id: "scan",
    title: "Scan a card, see what it sold for",
    line: "Point your iPhone at a card or slab. Slabhold reads the player, set, number and parallel, then shows its recent sold prices.",
  },
  { id: "scan-result", title: "Scan to comp", line: "Snap a card or slab and see what it sold for. Nothing gets added." },
  { id: "quick-comp", title: "Quick Comp", line: "Recent sold prices, the median and the range." },
  { id: "graphs", title: "Your collection, over time", line: "Your cards add up to one value, with its history drawn day by day." },
  { id: "timeline", title: "Collectors talking cards", line: "Follow collectors and see their pickups, questions and replies as they post." },
  { id: "leaderboard", title: "Weekly leaderboards", line: "Top card post, rising collectors and most cards added. The boards start over every week." },
  { id: "achievements", title: "Earn every tier", line: "Climb from Bronze to Legendary as your collection grows." },
] as const;

type ChapterId = (typeof CHAPTERS)[number]["id"];

/** The visual slot under each chapter's toolbar. Fixed, so nothing moves while a demo loads. */
export const CHAPTER_HEIGHTS: Record<ChapterId, string> = {
  scan: "h-[660px]",
  "scan-result": "h-[440px]",
  // Narrow phones wrap the card line and the attribution onto one more line each.
  "quick-comp": "h-[436px] min-[380px]:h-[412px]",
  graphs: "h-[440px]",
  timeline: "h-[440px]",
  leaderboard: "h-[440px]",
  achievements: "h-[320px]",
};

/** The carousel's tabs, in order. Comp needs the Quick Comp flag. */
export const CAROUSEL_TABS: readonly { id: ChapterId; tab: string }[] = [
  { id: "scan-result", tab: "Scan" },
  { id: "quick-comp", tab: "Comp" },
  { id: "graphs", tab: "Collection" },
  { id: "timeline", tab: "Feed" },
  { id: "leaderboard", tab: "Leaderboard" },
];

/** Index of the panel closest to the left edge of the scroller. */
export function panelIndexAt(scrollLeft: number, panelWidth: number, count: number): number {
  if (panelWidth <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / panelWidth)));
}

function chapter(id: ChapterId) {
  return CHAPTERS.find((item) => item.id === id)!;
}

const focus = "focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none";

/**
 * The parts below the hero. `comp` is a real card from a public collection
 * for Quick Comp; without it, the sample plays. `pickup` is a real slab for
 * the timeline's pickup post.
 */
export function FeaturePanels({ comp, pickup }: { comp?: CompDemo | null; pickup?: PickupDemo | null }) {
  return (
    <section aria-label="What you can do on Slabhold" data-always-dark="" className="mt-24 flex flex-col gap-24 lg:mt-32 lg:gap-32">
      <ScanShowcase />
      <FeatureCarousel comp={comp} pickup={pickup} />
      <Achievements />
    </section>
  );
}

/** The scanner, played in a phone. It reads cards in the iPhone app, so its link goes to the App Store. */
function ScanShowcase() {
  const titleId = useId();
  const [run, setRun] = useState(0);
  return (
    <article data-chapter="scan" aria-labelledby={titleId} className="landing-reveal lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
      <div>
        <ChapterCopy
          id="scan"
          titleId={titleId}
          extra={
            <ol className="mt-6 grid gap-3 text-[15px] leading-6 text-zinc-300">
              {["It names the player, set, number and parallel", "You confirm with one tap", "Recent sold prices land with every sale as a dot"].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span aria-hidden className="w-5 shrink-0 font-mono text-[13px] leading-6 text-[#A78BFA] tabular-nums">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          }
        />
      </div>
      <div className="mt-6 lg:mt-0">
        <Toolbar>
          <ReplayButton onClick={() => setRun((count) => count + 1)} />
        </Toolbar>
        <div className={`relative mt-2 ${CHAPTER_HEIGHTS.scan}`}>
          <WhenNear className="h-full" fallback={<PhoneSkeleton />}>
            <Suspense fallback={<PhoneSkeleton />}>
              <ScanDemo key={run} />
            </Suspense>
          </WhenNear>
        </div>
      </div>
    </article>
  );
}

function PhoneSkeleton() {
  return <div aria-hidden className="skeleton-shimmer mx-auto h-full w-[300px] rounded-[44px]" />;
}

/**
 * Five features, one at a time: tabs to tap, panels to swipe. A horizontal
 * scroll-snap row, so it scrolls natively at the display's frame rate; the
 * tabs follow the scroll and a tap scrolls to its panel (a jump, with reduced
 * motion). On desktop the tabs sit beside the panel with each feature's line.
 */
function FeatureCarousel({ comp, pickup }: { comp?: CompDemo | null; pickup?: PickupDemo | null }) {
  const quickComp = quickCompEnabled();
  const handed = use(LandingCompContext);
  const handedPickup = use(LandingPickupContext);
  // A real photo that fails to load swaps the whole demo back to the sample.
  const [real, setReal] = useState(comp === undefined ? handed : comp);
  const tabs = CAROUSEL_TABS.filter((tab) => quickComp || tab.id !== "quick-comp");
  const titleId = useId();
  const baseId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);

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

  function onKey(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    show(next);
    tabRefs.current[next]?.focus();
  }

  function demo(id: ChapterId, run: number): ReactNode {
    if (id === "scan-result") return <ScanResultDemo run={run} />;
    if (id === "quick-comp") {
      return <QuickCompDemo key={real ? "real" : "sample"} run={run} comp={real} onPhotoError={() => setReal(null)} />;
    }
    if (id === "graphs") {
      return <GraphsDemo run={run} chartHeight={300} gain={<p className="text-sm font-semibold text-[#A78BFA] tabular-nums">+$38 · 10.2%</p>} />;
    }
    if (id === "timeline") return <TimelineDemo run={run} pickup={pickup === undefined ? handedPickup : pickup} />;
    return <LeaderboardDemo run={run} />;
  }

  return (
    <div data-carousel="" className="landing-reveal lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-16">
      <div>
        <h2 id={titleId} className="text-[28px] leading-9 font-semibold tracking-[-0.02em] text-white lg:text-[40px] lg:leading-[48px]">
          Everything in one app
        </h2>
        <div
          role="tablist"
          aria-labelledby={titleId}
          className="-mx-6 mt-4 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none] [-ms-overflow-style:none] lg:mx-0 lg:mt-8 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map(({ id, tab }, index) => (
            <button
              key={id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${id}`}
              aria-selected={index === active}
              aria-controls={`${baseId}-panel-${id}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => show(index)}
              onKeyDown={(event) => onKey(event, index)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-left text-[15px] font-medium transition-colors duration-200 motion-reduce:transition-none lg:rounded-2xl lg:px-4 lg:py-3 ${focus} ${
                index === active
                  ? "border-[#A78BFA]/40 bg-[#7C3AED]/20 text-white"
                  : "border-white/10 text-zinc-300 hover:bg-white/[0.06] lg:border-transparent"
              }`}
            >
              {tab}
              <span className={`mt-0.5 hidden text-[14px] leading-5 font-normal lg:block ${index === active ? "text-zinc-300" : "text-zinc-400"}`}>
                {chapter(id).line}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div
        ref={scroller}
        data-carousel-panels=""
        onScroll={(event) => setActive(panelIndexAt(event.currentTarget.scrollLeft, panelWidth(), tabs.length))}
        className="-mx-6 mt-6 flex min-w-0 snap-x snap-mandatory scroll-px-6 items-start gap-4 overflow-x-auto overscroll-x-contain px-6 [scrollbar-width:none] [-ms-overflow-style:none] lg:mx-0 lg:mt-0 lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(({ id }, index) => (
          <Slide
            key={id}
            id={id}
            panelId={`${baseId}-panel-${id}`}
            tabId={`${baseId}-tab-${id}`}
            hidden={index !== active}
            real={id === "quick-comp" && Boolean(real?.real)}
            note={id === "timeline" || id === "leaderboard" ? SAMPLE_ACCOUNTS_NOTE : undefined}
            region={id === "timeline" || id === "leaderboard" ? SAMPLE_ACCOUNTS_LABEL : undefined}
            extra={
              id === "quick-comp" ? (
                <LandingLink
                  button="signup"
                  href={landingSignupHref(QUICK_COMP_PATH)}
                  className={`mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[15px] font-semibold text-[#A78BFA] underline-offset-4 hover:underline ${focus}`}
                >
                  Sign up to comp any card
                  <ArrowRight aria-hidden size={16} strokeWidth={1.5} />
                </LandingLink>
              ) : null
            }
          >
            {(run) => demo(id, run)}
          </Slide>
        ))}
      </div>
    </div>
  );
}

/** One carousel panel: its title and line (phones; the desktop tabs carry them), the toolbar and the demo. */
function Slide({
  id,
  panelId,
  tabId,
  hidden,
  real,
  note,
  region,
  extra,
  children,
}: {
  id: ChapterId;
  panelId: string;
  tabId: string;
  /** Not the shown panel: out of the tab order until it is swiped or tapped to. */
  hidden: boolean;
  real: boolean;
  note?: string;
  region?: string;
  extra?: ReactNode;
  children: (run: number) => ReactNode;
}) {
  const [run, setRun] = useState(0);
  const { title, line } = chapter(id);
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      data-chapter={id}
      inert={hidden}
      className="w-full shrink-0 snap-start"
    >
      <div className="min-h-[84px] lg:hidden">
        <h3 className="text-[20px] leading-7 font-semibold text-white">{title}</h3>
        <p className="mt-1 text-[15px] leading-6 text-zinc-400">{line}</p>
      </div>
      <Toolbar note={note} real={real}>
        <ReplayButton onClick={() => setRun((count) => count + 1)} />
      </Toolbar>
      <div role={region ? "region" : undefined} aria-label={region} className={`relative mt-2 ${CHAPTER_HEIGHTS[id]}`}>
        <WhenNear className="h-full" fallback={<DemoSkeleton />}>
          <Suspense fallback={<DemoSkeleton />}>{children(run)}</Suspense>
        </WhenNear>
      </div>
      {extra}
    </div>
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

/** Over a real card: neutral, never the collector's name or handle. */
export const REAL_CARD_TAG = "From a Slabhold collection";

function Toolbar({ note, real = false, children }: { note?: string; real?: boolean; children?: ReactNode }) {
  return (
    <div className="flex h-11 items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        {real ? (
          <span className="truncate font-mono text-[10px] leading-4 text-zinc-400">{REAL_CARD_TAG}</span>
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
    <article data-chapter="achievements" aria-labelledby={titleId} className="landing-reveal lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
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
              <Tilt>
                <Badge category="collector" tier={tier} size={tier === "legendary" ? 144 : 128} label="" />
              </Tilt>
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
