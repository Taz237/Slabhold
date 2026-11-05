"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Heart } from "lucide-react";
import { Badge } from "@/components/badges/badge";
import { CardSlabArt } from "@/components/card-slab-art";
import { ValueChart } from "@/components/charts/value-chart";
import { SAMPLE_SLABS } from "@/components/landing/sample-cards";
import { EASE, canAnimate, countUp, dollars } from "@/components/landing/showcase/motion";
import {
  SAMPLE_ACCOUNTS_LABEL,
  SAMPLE_ACCOUNTS_NOTE,
  SAMPLE_ALERTS,
  SAMPLE_POSTS,
  SAMPLE_SALES,
  avatarSrc,
  sampleStats,
  sampleValueLine,
} from "@/components/landing/showcase/sample-data";
import { RangeBar } from "@/components/sales-chart";
import { BADGE_TIERS, TIER_LABELS } from "@/lib/badges/config";
import { SAMPLE_PHOTO_URL } from "@/lib/quick-comp/photo";
import { bump, pauseWhenHidden, sparks, tiltAndGlint } from "./effects";

/*
 * The intro's five visuals. Each plays its entrance on mount when `motion`
 * is true; with reduced motion each draws its final frame and nothing moves.
 * Every number and name is sample data. The personas are sample accounts.
 */

const NO_PHOTO = { kind: "none" } as const;
const noop = () => {};
const STATS = sampleStats();

/** The shape each screen's central object takes. The frame morphs between them. */
export const SCREEN_FRAMES: readonly { width: number; height: number; radius: number; visible: boolean }[] = [
  { width: 184, height: 260, radius: 16, visible: false },
  { width: 300, height: 248, radius: 20, visible: true },
  { width: 320, height: 304, radius: 20, visible: true },
  { width: 216, height: 232, radius: 16, visible: false },
  { width: 328, height: 304, radius: 24, visible: false },
];

function SampleNote() {
  return (
    <p className="mt-4 flex items-center justify-center gap-2">
      <span className="inline-flex h-6 items-center rounded-full border border-white/15 px-2 font-mono text-[11px] font-medium text-zinc-300">
        Sample
      </span>
      <span className="text-[13px] text-zinc-500">{SAMPLE_ACCOUNTS_NOTE}</span>
    </p>
  );
}

/** 1. A graded slab assembles from flying squares, then tilts with a glint. */
export function WelcomeVisual({ motion }: { motion: boolean }) {
  const tilt = useRef<HTMLDivElement>(null);
  const glint = useRef<HTMLSpanElement>(null);
  const slab = useRef<HTMLDivElement>(null);
  const squares = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!motion || !canAnimate(slab.current)) return;
    const running: Animation[] = [];
    [...(squares.current?.children ?? [])].forEach((square, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const fromX = (col - 1) * 150 + (row % 2 ? 40 : -40);
      const fromY = (row - 1.5) * 140 + (col % 2 ? -60 : 60);
      running.push(
        (square as HTMLElement).animate(
          [
            { transform: `translate(${fromX}px, ${fromY}px) rotate(${(index % 4) * 45 - 60}deg) scale(0.4)`, opacity: 0 },
            { transform: "translate(0, 0) rotate(0) scale(1)", opacity: 1, offset: 0.7 },
            { transform: "translate(0, 0) rotate(0) scale(1)", opacity: 0 },
          ],
          { duration: 900, delay: index * 30, easing: EASE, fill: "both" },
        ),
      );
    });
    running.push(
      slab.current!.animate(
        [
          { opacity: 0, transform: "scale(0.94)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 400, delay: 650, easing: EASE, fill: "backwards" },
      ),
    );
    let loops: Animation[] = [];
    const timer = window.setTimeout(() => {
      loops = tiltAndGlint(tilt.current, glint.current);
    }, 1050);
    const stopPause = pauseWhenHidden(() => loops);
    return () => {
      window.clearTimeout(timer);
      stopPause();
      for (const animation of [...running, ...loops]) animation.cancel();
    };
  }, [motion]);

  return (
    <div className="relative w-[184px] [perspective:900px]">
      <div ref={tilt} className="relative [transform-style:preserve-3d]">
        <div ref={slab}>
          <CardSlabArt card={SAMPLE_SLABS[0]} index={9} source={NO_PHOTO} status="loading" onStatus={noop} sizes="184px" />
        </div>
        {motion ? (
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
            <span
              ref={glint}
              className="absolute inset-0 -translate-x-full bg-[linear-gradient(105deg,transparent_35%,rgb(255_255_255/0.22)_50%,transparent_65%)]"
            />
          </span>
        ) : null}
      </div>
      {motion ? (
        <div ref={squares} aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-4 gap-1">
          {Array.from({ length: 12 }, (_, index) => (
            <span
              key={index}
              className={`rounded-[4px] opacity-0 ${index % 3 === 1 ? "bg-[#7C3AED]" : index % 2 ? "bg-[#A78BFA]/60" : "bg-white/20"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 2. Quick Comp: sold prices fly in, the card bumps, sparks, and the median ticks up. */
export function QuickCompVisual({ motion }: { motion: boolean }) {
  const card = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLUListElement>(null);
  const median = useRef<HTMLSpanElement>(null);
  const spark = useRef<HTMLSpanElement>(null);
  const range = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!motion || !canAnimate(card.current)) return;
    const running: Animation[] = [];
    const timers: number[] = [];
    const items = [...(chips.current?.children ?? [])] as HTMLElement[];
    items.forEach((chip, index) => {
      const delay = 380 + index * 120;
      running.push(
        chip.animate(
          [
            { transform: "translateY(160px) scale(0.6)", opacity: 0 },
            { transform: "translateY(-4px) scale(1.05)", opacity: 1, offset: 0.75 },
            { transform: "translateY(0) scale(1)", opacity: 1 },
          ],
          { duration: 480, delay, easing: EASE, fill: "backwards" },
        ),
      );
      timers.push(window.setTimeout(() => bump(card.current), delay + 360));
    });
    const landed = 380 + items.length * 120 + 360;
    timers.push(window.setTimeout(() => sparks(spark.current), landed));
    const cancelCount = countUp(median.current, STATS.median * 0.6, STATS.median, { duration: 700, delay: landed - 200 });
    const fill = range.current?.querySelector<HTMLElement>("[role='img'] span");
    if (fill) {
      fill.style.transformOrigin = "left center";
      running.push(fill.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 500, delay: landed, easing: EASE, fill: "backwards" }));
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      for (const animation of running) animation.cancel();
      cancelCount();
    };
  }, [motion]);

  return (
    <div ref={card} className="flex h-full w-full flex-col p-4">
      <div className="flex gap-3">
        <div className="grid h-[104px] w-[72px] shrink-0 place-items-center rounded-[8px] border border-white/[0.08] bg-zinc-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SAMPLE_PHOTO_URL} alt="" width={68} height={100} decoding="async" draggable={false} className="h-[100px] w-[68px] object-contain" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-end">
          <p className="text-xs font-medium text-zinc-500">Median sold price</p>
          <p className="relative text-[34px] leading-10 font-semibold tracking-tight text-white tabular-nums">
            <span ref={median}>{dollars(STATS.median)}</span>
            <span ref={spark} aria-hidden className="pointer-events-none absolute top-1/2 left-12" />
          </p>
          <p className="text-[11px] text-zinc-500 tabular-nums">Based on {STATS.count} sample sales</p>
        </div>
      </div>
      <ul ref={chips} aria-label="Recent sold prices" className="mt-4 grid grid-cols-5 gap-1.5">
        {SAMPLE_SALES.map((sale) => (
          <li
            key={sale.ago}
            className="flex h-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] font-mono text-[13px] text-zinc-100 tabular-nums"
          >
            {dollars(sale.price)}
          </li>
        ))}
      </ul>
      <div ref={range}>
        <RangeBar low={STATS.p25} high={STATS.p75} median={STATS.median} min={STATS.min} max={STATS.max} />
      </div>
    </div>
  );
}

/**
 * One straight brand slab: a black case, a purple label and the star from the
 * app icon. The glow breathes and a light sweep crosses it, CSS loops that run
 * only with motion (globals.css also turns them off for reduced motion).
 */
function CollectionSlab({ motion }: { motion: boolean }) {
  return (
    <div data-slab="" aria-hidden="true" className="absolute top-[2px] left-[14px] h-[84px] w-[60px]">
      <span
        className={`collection-slab-glow pointer-events-none absolute inset-1 rounded-[10px] bg-[#7C3AED] opacity-40 blur-[14px] ${motion ? "collection-slab-glow-pulse" : ""}`}
      />
      <div className="relative flex h-full w-full flex-col gap-[3px] overflow-hidden rounded-[8px] border border-white/15 bg-[#09090B] p-[3px]">
        <p className="flex h-[21px] shrink-0 items-center justify-center rounded-[4px] bg-[#7C3AED] text-center text-[8px] leading-[9px] font-semibold tracking-[-0.02em] text-white">
          YOUR COLLECTION
        </p>
        <div className="flex flex-1 items-center justify-center rounded-[4px] border border-white/[0.06] bg-[#18181B]">
          <svg viewBox="11.2 14 9.6 9.2" width="26" height="25" fill="#7C3AED">
            <path d="M16 14.5 17.09 17.55 20.33 17.64 17.76 19.62 18.67 22.73 16 20.9 13.33 22.73 14.24 19.62 11.67 17.64 14.91 17.55Z" />
          </svg>
        </div>
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_38%,rgb(255_255_255/0.1)_50%,transparent_62%)]" />
        {motion ? (
          <span className="collection-slab-sweep pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_30%,rgb(255_255_255/0.18)_50%,transparent_70%)]" />
        ) : null}
      </div>
    </div>
  );
}

/** 3. The collection: one slab rises in, the box bumps, and the real chart draws in. */
export function CollectionVisual({ motion }: { motion: boolean }) {
  const stack = useRef<HTMLDivElement>(null);
  const spark = useRef<HTMLSpanElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const [points] = useState(() => sampleValueLine());
  const last = points[points.length - 1].value;

  useEffect(() => {
    if (!motion || !canAnimate(stack.current)) return;
    const running: Animation[] = [];
    const timers: number[] = [];
    const slab = stack.current!.querySelector("[data-slab]");
    if (canAnimate(slab)) {
      // Rises in straight, overshoots a touch and settles; the box answers with a bump and sparks.
      running.push(
        slab.animate(
          [
            { transform: "translateY(200px)", opacity: 0 },
            { transform: "translateY(-6px)", opacity: 1, offset: 0.75 },
            { transform: "translateY(0)", opacity: 1 },
          ],
          { duration: 520, delay: 300, easing: EASE, fill: "backwards" },
        ),
      );
      timers.push(window.setTimeout(() => bump(stack.current), 720));
      timers.push(window.setTimeout(() => sparks(spark.current), 720));
    }
    // The chart draws itself in (400ms) the first time it is on screen; the value counts up with it.
    const cancelCount = countUp(value.current, points[0].value, last, { duration: 400, delay: 0 });
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      for (const animation of running) animation.cancel();
      cancelCount();
    };
  }, [motion, points, last]);

  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] leading-5 text-zinc-400">Collection value</p>
          <p className="text-[34px] leading-10 font-semibold tracking-tight text-white tabular-nums">
            <span ref={value}>{dollars(last)}</span>
          </p>
          <p className="text-sm font-semibold text-[#A78BFA] tabular-nums">+$38 · 10.2%</p>
        </div>
        <div ref={stack} className="relative mr-2 h-[88px] w-[88px] shrink-0">
          <CollectionSlab motion={motion} />
          <span ref={spark} aria-hidden className="pointer-events-none absolute top-1/2 left-1/2" />
        </div>
      </div>
      <div className="mt-auto">
        <ValueChart points={points} tone="accent" height={150} minimal ariaLabel="Sample collection value, up $38 in 90 days" />
      </div>
    </div>
  );
}

type FlowItem = { id: string; kind: "post" } | { id: string; kind: "badge"; tier: (typeof BADGE_TIERS)[number] };

const FLOW_ITEMS: readonly FlowItem[] = [
  { id: "post", kind: "post" },
  ...BADGE_TIERS.map((tier) => ({ id: tier, kind: "badge" as const, tier })),
];

function flowStyle(offset: number): CSSProperties {
  const side = Math.sign(offset);
  const far = Math.abs(offset);
  return {
    transform: `translate(-50%, -50%) translateX(${offset * 92}px) translateZ(${-far * 120}px) rotateY(${-side * 38}deg) scale(${far ? 0.78 : 1})`,
    opacity: far > 2 ? 0 : far ? 0.55 : 1,
    filter: far ? "blur(2px)" : "none",
    zIndex: 10 - far,
  };
}

/** 4. Cover flow: a sample post and the six real badges, the centre one tilting. */
export function SocialVisual({ motion }: { motion: boolean }) {
  const [center, setCenter] = useState(0);
  const tilt = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!motion) return;
    let hidden = false;
    const onVisibility = () => (hidden = document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => {
      if (!hidden) setCenter((current) => (current + 1) % FLOW_ITEMS.length);
    }, 1700);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motion]);

  useEffect(() => {
    if (!motion || !canAnimate(tilt.current)) return;
    const loop = tilt.current.animate([{ transform: "rotateY(-10deg)" }, { transform: "rotateY(10deg)" }], {
      duration: 1700,
      iterations: Infinity,
      direction: "alternate",
      easing: EASE,
    });
    const stop = pauseWhenHidden(() => [loop]);
    return () => {
      stop();
      loop.cancel();
    };
  }, [motion, center]);

  const post = SAMPLE_POSTS[0];
  return (
    <div className="w-full min-w-0">
      <div
        role="region"
        aria-label={SAMPLE_ACCOUNTS_LABEL}
        className="relative h-[232px] w-full [perspective:900px] [transform-style:preserve-3d]"
      >
        {FLOW_ITEMS.map((item, index) => {
          const offset = index - center;
          const wrapped = offset > FLOW_ITEMS.length / 2 ? offset - FLOW_ITEMS.length : offset < -FLOW_ITEMS.length / 2 ? offset + FLOW_ITEMS.length : offset;
          return (
            <div
              key={item.id}
              aria-hidden={wrapped !== 0 || undefined}
              className="absolute top-1/2 left-1/2 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={flowStyle(wrapped)}
            >
              <div ref={wrapped === 0 ? tilt : undefined}>
                {item.kind === "post" ? (
                  <article className="w-[216px] rounded-2xl border border-white/10 bg-[#18181B] p-3 text-left">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatarSrc(post.persona)}
                        alt=""
                        width={32}
                        height={32}
                        decoding="async"
                        draggable={false}
                        className="h-8 w-8 shrink-0 rounded-full bg-zinc-800 object-cover"
                      />
                      <p className="min-w-0 text-[13px] leading-4">
                        <span className="block truncate font-semibold text-zinc-100">{post.persona.name}</span>
                        <span className="block truncate text-zinc-500">@{post.persona.handle}</span>
                      </p>
                    </div>
                    <p className="mt-2 text-[14px] leading-5 text-zinc-100">{post.body}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="w-11 shrink-0">
                        {/* Donnie's own card on Jake's kitchen-table post, used with his OK. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/landing/kitchen-table-card.webp" alt="Numbered patch card in a top-loader" width={300} height={420} loading="lazy" decoding="async" draggable={false} className="aspect-[5/7] w-11 rounded-md border border-white/10 object-cover" />
                      </div>
                      <span className="flex items-center gap-1.5 text-[13px] text-zinc-500 tabular-nums">
                        <Heart aria-hidden size={16} strokeWidth={1.5} />
                        {post.likes}
                      </span>
                    </div>
                  </article>
                ) : (
                  <div className="flex h-[200px] w-[160px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-[#18181B]">
                    <Badge category="collector" tier={item.tier} size={104} animate={item.tier === "legendary"} label="" />
                    <span className="text-[15px] font-semibold text-zinc-100">{TIER_LABELS[item.tier]}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <SampleNote />
    </div>
  );
}

/** 5. Alerts: banners drop in one by one and the red count pops each time. */
export function AlertsVisual({ motion }: { motion: boolean }) {
  const [shown, setShown] = useState(motion ? 0 : SAMPLE_ALERTS.length);
  const count = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!motion) return;
    const timers = SAMPLE_ALERTS.map((_, index) => window.setTimeout(() => setShown(index + 1), 400 + index * 700));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [motion]);

  useEffect(() => {
    if (!motion || shown === 0 || !canAnimate(count.current)) return;
    count.current.animate([{ transform: "scale(0.6)" }, { transform: "scale(1.2)", offset: 0.6 }, { transform: "scale(1)" }], {
      duration: 320,
      easing: EASE,
    });
  }, [motion, shown]);

  const banners = SAMPLE_ALERTS.slice(0, shown).reverse();
  return (
    <div className="flex w-full min-w-0 flex-col items-center">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={64} height={64} decoding="async" draggable={false} className="h-16 w-16 rounded-[16px]" />
        <span
          ref={count}
          aria-hidden={shown === 0 || undefined}
          className={`absolute -top-2 -right-2 grid h-6 min-w-6 place-items-center rounded-full bg-[#E5484D] px-1.5 text-[13px] font-semibold text-white tabular-nums ring-2 ring-[#09090B] ${
            shown === 0 ? "opacity-0" : ""
          }`}
        >
          {shown}
        </span>
      </div>
      <ul role="region" aria-label={SAMPLE_ACCOUNTS_LABEL} className="mt-5 flex h-[264px] w-full flex-col gap-2">
        {banners.map((alert) => (
          <li
            key={alert.id}
            ref={(node) => {
              if (!node || !motion || !canAnimate(node) || node.dataset.in) return;
              node.dataset.in = "1";
              node.animate(
                [
                  { transform: "translateY(-32px)", opacity: 0 },
                  { transform: "translateY(4px)", opacity: 1, offset: 0.7 },
                  { transform: "translateY(0)", opacity: 1 },
                ],
                { duration: 420, easing: EASE },
              );
            }}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#18181B] p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarSrc(alert.persona)}
              alt=""
              width={36}
              height={36}
              decoding="async"
              draggable={false}
              className="h-9 w-9 shrink-0 rounded-full bg-zinc-800 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="flex justify-between text-[12px] leading-4 text-zinc-500">
                <span>Slabhold</span>
                <span>now</span>
              </p>
              <p className="truncate text-[14px] leading-5 text-zinc-100">
                <span className="font-semibold">{alert.persona.handle}</span> {alert.text}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <SampleNote />
    </div>
  );
}
