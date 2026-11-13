"use client";

import { useEffect, useRef } from "react";
import { Crown, TrendingUp } from "lucide-react";
import { EASE, cancelAll, canAnimate, onceVisible, prefersReducedMotion } from "./motion";
import { SAMPLE_BOARD, avatarSrc, type Persona } from "./sample-data";

/** The app's board: its label, score unit, purple and podium metals (components/leaderboard-view.tsx). */
const BOARD_LABEL = "Rising collectors";
const SCORE_LABEL = "new followers";
const ACCENT = "#7C3AED";
const RING = ["bg-gradient-to-br from-[#FFF3B0] to-[#D99A00]", "bg-gradient-to-br from-white to-[#8D97A3]", "bg-gradient-to-br from-[#F6BC8A] to-[#8A4314]"];
const BANNER = [
  "bg-[linear-gradient(135deg,#FFE27A_0%,#F5B700_38%,#FFF3B0_68%,#D99A00_100%)] h-[72px]",
  "bg-[linear-gradient(135deg,#F7F9FB_0%,#C3CBD4_52%,#EEF1F5_100%)] h-[56px]",
  "bg-[linear-gradient(135deg,#F6BC8A_0%,#C46A2B_52%,#F3CBA6_100%)] h-[44px]",
];
const PLACE = ["1ST", "2ND", "3RD"];
/** Second, first, third: the winner stands in the middle. */
const ORDER = ["order-2", "order-1", "order-3"];
const AVATAR = [56, 48, 44];

function Face({ persona, size }: { persona: Persona; size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarSrc(persona)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="rounded-full bg-zinc-800 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * The weekly leaderboard: one board in the app's shape, a podium for the top
 * three and rows under it. Sample accounts and made-up scores: names are
 * plain text, never linked. Each place rises in once, top down.
 */
export default function LeaderboardDemo({ run }: { run: number }) {
  const root = useRef<HTMLDivElement>(null);
  const stop = useRef<() => void>(() => {});

  function play() {
    stop.current();
    const node = root.current;
    if (!node || prefersReducedMotion() || !canAnimate(node)) return;
    const animations = [...node.querySelectorAll<HTMLElement>("[data-place]")].map((place, index) =>
      place.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 420, delay: index * 70, easing: EASE, fill: "backwards" },
      ),
    );
    stop.current = () => cancelAll(animations);
  }

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const unwatch = onceVisible(node, play);
    return () => {
      unwatch();
      stop.current();
    };
  }, []);

  useEffect(() => {
    if (run > 0) play();
  }, [run]);

  const top = SAMPLE_BOARD.slice(0, 3);
  const rest = SAMPLE_BOARD.slice(3);
  return (
    <div ref={root} data-showcase-demo="leaderboard" className="h-full overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 px-3 pb-3">
      <div className="flex items-start gap-3 px-1 pt-4 pb-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#A78BFA]" style={{ backgroundColor: `${ACCENT}26` }}>
          <TrendingUp className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[17px] leading-tight font-semibold tracking-tight text-white">{BOARD_LABEL}</p>
          <p className="mt-0.5 text-sm leading-5 text-zinc-400">This week, by {SCORE_LABEL}</p>
        </div>
      </div>
      <ol className="grid grid-cols-3 items-end gap-2 pt-1">
        {top.map(({ persona, score }, index) => (
          <li key={persona.handle} data-place="" className={`flex min-w-0 flex-col items-center text-center ${ORDER[index]}`}>
            <span className={`shrink-0 rounded-full p-[2px] ${RING[index]}`}>
              <span className="block rounded-full bg-zinc-950 p-[2px]">
                <Face persona={persona} size={AVATAR[index]} />
              </span>
            </span>
            <span className="mt-1.5 block w-full min-w-0 truncate px-1 text-sm font-semibold tracking-tight text-white">{persona.name}</span>
            <span className="block w-full min-w-0 truncate px-1 text-[11px] text-zinc-400">@{persona.handle}</span>
            <span className="mt-1 flex max-w-full items-baseline justify-center gap-1 px-1 whitespace-nowrap">
              <span className="shrink-0 text-lg leading-none font-semibold text-white tabular-nums">{score}</span>
              <span className="min-w-0 truncate text-[11px] font-semibold text-zinc-400">{SCORE_LABEL}</span>
            </span>
            <span className={`mt-2 flex w-full flex-col items-center gap-1 rounded-t-xl pt-2 text-zinc-950 ${BANNER[index]}`}>
              {index === 0 ? <Crown aria-hidden className="h-5 w-5 fill-zinc-950/15" strokeWidth={2.4} /> : null}
              <span className="rounded-sm bg-zinc-950/85 px-1.5 py-[3px] font-mono text-[9px] leading-none font-semibold tracking-[0.16em] text-white">
                {PLACE[index]}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <ol className="mt-3 space-y-1">
        {rest.map(({ persona, score }, index) => (
          <li key={persona.handle} data-place="" className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5">
            <span className="w-6 shrink-0 text-center text-sm font-semibold text-[#A78BFA] tabular-nums">{index + 4}</span>
            <Face persona={persona} size={32} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{persona.name}</span>
            <span className="shrink-0 text-right whitespace-nowrap">
              <span className="text-base font-semibold text-white tabular-nums">{score}</span>
              <span className="ml-1 text-[11px] text-zinc-400">{SCORE_LABEL}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
