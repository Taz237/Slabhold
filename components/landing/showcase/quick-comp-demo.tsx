"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { compCaption, compHeroValue, compLabel } from "@/components/comp-basis";
import { RangeBar, TrawlAttribution } from "@/components/sales-chart";
import { SAMPLE_PHOTO_URL } from "@/lib/quick-comp/photo";
import { EASE, cancelAll, canAnimate, countUp, dollars, prefersReducedMotion, onceVisible, rise } from "./motion";
import { SAMPLE_QUERY, SAMPLE_SALES, sampleStats } from "./sample-data";

const STATS = sampleStats();
const TYPE_MS = 34;
const TYPE_START = 300;
const PHOTO_AT = TYPE_START + SAMPLE_QUERY.length * TYPE_MS + 180;
const CHIPS_AT = PHOTO_AT + 260;
const CHIP_STAGGER = 90;
const MEDIAN_AT = CHIPS_AT + SAMPLE_SALES.length * CHIP_STAGGER + 260;

/**
 * Quick Comp, played once with static sample data: the search types itself,
 * the sample photo settles in, the sold prices fly into a row, and the median
 * counts up while the middle-half bar fills. Real app parts: the comp hero
 * styles, RangeBar and the Trawl attribution. No lookup, no fetch.
 */
export default function QuickCompDemo({ run }: { run: number }) {
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const photo = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLUListElement>(null);
  const median = useRef<HTMLSpanElement>(null);
  const range = useRef<HTMLDivElement>(null);
  const stop = useRef<() => void>(() => {});
  const revealed = useRef(false);

  function play() {
    stop.current();
    const node = root.current;
    if (!node || prefersReducedMotion() || !canAnimate(node)) return;
    const animations: (Animation | null)[] = [];
    const timers: number[] = [];
    if (!revealed.current) {
      revealed.current = true;
      animations.push(rise(node));
    }

    // The query types itself, one character at a time.
    const text = typed.current;
    if (text) {
      text.textContent = "";
      for (let index = 1; index <= SAMPLE_QUERY.length; index += 1) {
        timers.push(window.setTimeout(() => (text.textContent = SAMPLE_QUERY.slice(0, index)), TYPE_START + index * TYPE_MS));
      }
    }
    animations.push(
      caret.current?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.92 }, { opacity: 0 }], {
        duration: PHOTO_AT,
        fill: "forwards",
      }) ?? null,
    );

    animations.push(
      photo.current?.animate(
        [
          { opacity: 0, transform: "translateY(8px) scale(0.92)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        { duration: 420, delay: PHOTO_AT, easing: EASE, fill: "backwards" },
      ) ?? null,
    );

    // Each sold price flies in from the photo and lands with a small overshoot.
    [...(chips.current?.children ?? [])].forEach((chip, index) => {
      animations.push(
        (chip as HTMLElement).animate(
          [
            { opacity: 0, transform: "translate(-72px, -48px) scale(0.6)" },
            { opacity: 1, transform: "translate(0, 0) scale(1.06)", offset: 0.75 },
            { opacity: 1, transform: "translate(0, 0) scale(1)" },
          ],
          { duration: 460, delay: CHIPS_AT + index * CHIP_STAGGER, easing: EASE, fill: "backwards" },
        ),
      );
    });

    const fill = range.current?.querySelector<HTMLElement>("[role='img'] span");
    const tick = range.current?.querySelector<HTMLElement>("[role='img'] span:last-child");
    if (fill && tick && fill !== tick) {
      animations.push(
        fill.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
          duration: 500,
          delay: MEDIAN_AT,
          easing: EASE,
          fill: "backwards",
        }),
        tick.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: MEDIAN_AT + 300, easing: EASE, fill: "backwards" }),
      );
      fill.style.transformOrigin = "left center";
    }
    const cancelCount = countUp(median.current, STATS.median * 0.6, STATS.median, { duration: 700, delay: MEDIAN_AT });

    stop.current = () => {
      cancelAll(animations);
      cancelCount();
      for (const timer of timers) window.clearTimeout(timer);
      if (text) text.textContent = SAMPLE_QUERY;
    };
  }

  // Plays once, the first time most of it is on screen.
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const unwatch = onceVisible(node, () => play());
    return () => {
      unwatch();
      stop.current();
    };
  }, []);

  useEffect(() => {
    if (run > 0) play();
  }, [run]);

  return (
    <div
      ref={root}
      data-showcase-demo="quick-comp"
      className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"
    >
      <div className="flex h-11 items-center gap-2 rounded-[10px] bg-white/[0.06] px-3">
        <Search aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-zinc-500" />
        <span className="sr-only">Search: {SAMPLE_QUERY}</span>
        <span aria-hidden className="min-w-0 truncate text-[15px] text-zinc-100">
          <span ref={typed}>{SAMPLE_QUERY}</span>
          <span ref={caret} className="ml-px inline-block h-[18px] w-px translate-y-[3px] bg-[#A78BFA] opacity-0" />
        </span>
      </div>

      <div className="mt-4 flex gap-4">
        <div
          ref={photo}
          className="grid h-[156px] w-[112px] shrink-0 place-items-center overflow-hidden rounded-[10px] border border-white/[0.08] bg-zinc-900"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SAMPLE_PHOTO_URL}
            alt="Sample card in a slab"
            width={104}
            height={156}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-[156px] w-[104px] object-contain"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-end">
          <p className="text-[13px] leading-5 text-zinc-300">2023 Sample Rookie Prizm · PSA 10</p>
          <p className={`mt-3 ${compLabel}`}>Median sold price</p>
          <p className={`${compHeroValue} text-white`}>
            <span ref={median}>{dollars(STATS.median)}</span>
          </p>
          <p className={`mt-1 tabular-nums ${compCaption}`}>Based on {STATS.count} sample sales</p>
        </div>
      </div>

      <ul ref={chips} aria-label="Recent sold prices" className="mt-3 grid grid-cols-5 gap-1.5">
        {SAMPLE_SALES.map((sale) => (
          <li
            key={sale.ago}
            aria-label={`${dollars(sale.price)}, sold ${sale.ago} ago`}
            className="flex h-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] font-mono text-[13px] text-zinc-100 tabular-nums"
          >
            {dollars(sale.price)}
          </li>
        ))}
      </ul>

      <div ref={range}>
        <RangeBar low={STATS.p25} high={STATS.p75} median={STATS.median} min={STATS.min} max={STATS.max} />
      </div>
      <TrawlAttribution />
    </div>
  );
}
