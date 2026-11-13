"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneFrame } from "@/components/landing/phone-frame";
import { RevealCard, RevealName, RevealNameSkeleton } from "@/components/scan/sheet-parts";
import { CONFIRM_COPY } from "@/lib/scan/confirm";
import { HUB_COPY } from "@/lib/scan/entry";
import type { ScanMatch } from "@/lib/scan/match";
import { countUp, onceVisible, prefersReducedMotion } from "./motion";
import { SAMPLE_SCAN, SAMPLE_SCAN_PHOTO } from "./sample-data";
import { SAMPLE_SCAN_COMP, SoldPanel, scanValue } from "./sold-panel";
import { money } from "@/lib/format";

const MATCH = SAMPLE_SCAN as unknown as ScanMatch;

/** The flow's beats: the camera, the sheet with the card flipping in, the name, then the price. */
export const SCAN_STAGES = ["camera", "sheet", "name", "price"] as const;
export type ScanStage = (typeof SCAN_STAGES)[number];

/** When each beat after the camera starts, in ms from the start of a play. */
export const SCAN_BEATS: Record<Exclude<ScanStage, "camera">, number> = { sheet: 1500, name: 2700, price: 4600 };

const LABEL = `Sample scan: ${MATCH.playerName}, ${MATCH.yearLabel} ${MATCH.setBrand} #${MATCH.cardNumber}, ${MATCH.parallel}. Value ${scanValue()} from ${SAMPLE_SCAN_COMP.nSales} sample sales.`;

/**
 * The scan flow, played in a phone: a card slides into the camera, the
 * "Is this your card?" sheet rises and the card flips in, the name fills in
 * part by part (player, year and set, number, parallel, tags), then the value
 * lands with its sold-sales dots. The card, the name and the dots are the
 * scanner's own parts (RevealCard, RevealName, SalesDots) over a made-up
 * card; the camera behind them is a plain stand-in for the native one. Plays
 * once when it scrolls into view; Replay remounts it (the chapter re-keys it),
 * so it plays again. With reduced motion it shows the last frame and nothing
 * moves.
 */
export default function ScanDemo() {
  const root = useRef<HTMLDivElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const [reduce] = useState(prefersReducedMotion);
  const [stage, setStage] = useState<ScanStage>(reduce ? "price" : "camera");
  // Each play remounts the moving parts, so their entrances run again.
  const [play, setPlay] = useState(0);
  const timers = useRef<number[]>([]);

  const stop = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  const start = useCallback(() => {
    if (reduce) return;
    stop();
    setStage("camera");
    setPlay((count) => count + 1);
    for (const next of ["sheet", "name", "price"] as const) {
      timers.current.push(window.setTimeout(() => setStage(next), SCAN_BEATS[next]));
    }
  }, [reduce, stop]);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const unwatch = onceVisible(node, start);
    return () => {
      unwatch();
      stop();
    };
  }, [start, stop]);

  // The value counts up as its panel lands.
  useEffect(() => {
    if (stage !== "price" || reduce) return;
    const median = (SAMPLE_SCAN_COMP.medianCents ?? 0) / 100;
    return countUp(value.current, median * 0.6, median, { duration: 700, delay: 120, format: (amount) => money(Math.round(amount)) });
  }, [stage, reduce, play]);

  const at = SCAN_STAGES.indexOf(stage);
  return (
    <div ref={root} data-showcase-demo="scan" data-scan-demo="" data-scan-stage={stage} role="img" aria-label={LABEL} className="flex h-full justify-center">
      <PhoneFrame className="h-full w-[300px]">
        {/* The camera: a stand-in for the native scanner's view. */}
        <div key={`camera-${play}`} aria-hidden className="absolute inset-0 flex flex-col items-center justify-center bg-[#0C0C0F]">
          <div className="relative grid h-[238px] w-[170px] place-items-center">
            {["top-0 left-0 border-t-2 border-l-2 rounded-tl-xl", "top-0 right-0 border-t-2 border-r-2 rounded-tr-xl", "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl", "right-0 bottom-0 border-r-2 border-b-2 rounded-br-xl"].map((corner) => (
              <span key={corner} className={`absolute size-6 border-white/70 ${corner}`} />
            ))}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={SAMPLE_SCAN_PHOTO}
              alt=""
              width={150}
              height={210}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-[210px] w-[150px] rounded-lg object-cover motion-safe:animate-[scan-card-in_900ms_cubic-bezier(0.22,1,0.36,1)_both]"
            />
          </div>
          <p className="mt-6 px-6 text-center text-[13px] leading-5 text-zinc-300">{HUB_COPY.addEntryBody}</p>
        </div>

        {at >= 1 ? (
          <div
            key={`sheet-${play}`}
            aria-hidden
            className="absolute inset-x-0 top-16 bottom-0 overflow-hidden rounded-t-[28px] border-t border-white/10 bg-[#111114] text-zinc-50 shadow-[0_-16px_48px_rgba(0,0,0,0.5)] motion-safe:animate-[scan-sheet-in_420ms_cubic-bezier(0.22,1,0.36,1)_both]"
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-white/20" />
            <p className="px-5 pt-3 pb-2 text-[13px] font-medium text-zinc-400">{CONFIRM_COPY.title}</p>
            {/* The sheet scrolls itself up as the value lands, the way a thumb would. */}
            <div className="h-full overflow-hidden">
            <div
              className={`px-4 pt-1 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                at >= 3 ? "-translate-y-[96px]" : ""
              }`}
            >
              <RevealCard photo={SAMPLE_SCAN_PHOTO} />
              {at === 1 ? <RevealNameSkeleton label={CONFIRM_COPY.finding} /> : <RevealName match={MATCH} parallel={MATCH.parallel} />}
              {at >= 3 ? (
                <SoldPanel
                  valueRef={value}
                  className="mt-4 motion-safe:animate-[scan-pop_420ms_cubic-bezier(0.22,1,0.36,1)_both]"
                />
              ) : null}
            </div>
            </div>
          </div>
        ) : null}
      </PhoneFrame>
    </div>
  );
}
