"use client";

import { useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { ValueSpark } from "@/components/charts/value-spark";
import { Badge } from "@/components/badges/badge";
import { CardSlabArt } from "@/components/card-slab-art";
import { CompsList } from "@/components/comps-list";
import { LEADERBOARD_STYLES, PodiumRow } from "@/components/leaderboard-view";
import { SAMPLE_SLABS } from "@/components/landing/sample-cards";
import { Logo } from "@/components/logo";
import { BADGE_TIERS, TIER_LABELS } from "@/lib/badges/config";
import type { BoardRow } from "@/lib/leaderboard/present";
import type { CompListing } from "@/lib/types";

const NO_PHOTO = { kind: "none" } as const;
const noop = () => {};

export const FEATURE_PANELS = [
  { id: "track", tag: "Track", title: "Track your collection", line: "Every slab with its value and a running history." },
  { id: "comps", tag: "Comps", title: "Real comps", line: "Each card matched to recent sold prices, not asking prices." },
  { id: "leaderboard", tag: "Compete", title: "Weekly leaderboard", line: "Add cards and post. The top three take the podium." },
  { id: "badges", tag: "Earn", title: "Earn badges", line: "Climb from Bronze to Legendary as your collection grows." },
  { id: "social", tag: "Connect", title: "Post, share, DM", line: "Show off pickups, share links that look great, and DM collectors." },
] as const;

/** Index of the panel closest to the left edge of the scroller. */
export function panelIndexAt(scrollLeft: number, panelWidth: number, count: number): number {
  if (panelWidth <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / panelWidth)));
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Five swipeable panels: one per screen on a phone, snap scrolling and dots. */
export function FeaturePanels() {
  const scroller = useRef<HTMLDivElement>(null);
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
    node.scrollTo({ left: index * panelWidth(), behavior: reducedMotion() ? "auto" : "smooth" });
  }

  return (
    <section aria-label="What you can do on Slabhold" className="mt-14">
      <style>{LEADERBOARD_STYLES}</style>
      <div
        ref={scroller}
        onScroll={(event) =>
          setActive(panelIndexAt(event.currentTarget.scrollLeft, panelWidth(), FEATURE_PANELS.length))
        }
        className="-mx-6 flex min-w-0 snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto overscroll-x-contain px-6 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {FEATURE_PANELS.map((panel, index) => (
          <article
            key={panel.id}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${FEATURE_PANELS.length}: ${panel.title}`}
            className="flex w-full shrink-0 snap-start flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 sm:w-[340px]"
          >
            <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-[#A78BFA] uppercase">
              {String(index + 1).padStart(2, "0")} · {panel.tag}
            </p>
            <h2 className="mt-2 text-[22px] font-extrabold tracking-tight text-white">{panel.title}</h2>
            <p className="mt-1 text-[15px] leading-6 text-zinc-400">{panel.line}</p>
            <div className="relative mt-5 flex min-h-[248px] flex-1 flex-col justify-center">
              <SampleTag />
              {PANEL_VISUALS[panel.id]}
            </div>
          </article>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-center gap-1" role="group" aria-label="Choose a panel">
        {FEATURE_PANELS.map((panel, index) => (
          <button
            key={panel.id}
            type="button"
            onClick={() => show(index)}
            aria-label={`Show ${panel.title}`}
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
    </section>
  );
}

function SampleTag() {
  return (
    <span className="absolute -top-1 right-0 z-10 rounded-full border border-white/15 bg-black/50 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-zinc-300 uppercase backdrop-blur">
      Sample
    </span>
  );
}

const SAMPLE_LINE = [22, 26, 24, 31, 29, 36, 34, 42, 40, 47, 52, 50, 58].map((value, index) => ({
  date: `2026-01-${String(index * 2 + 1).padStart(2, "0")}`,
  value,
}));

/** A small value-history line. Sample points, no axis. The same spark as the app. */
function ValueLine() {
  return <ValueSpark id="landing-line" points={SAMPLE_LINE} tone="accent" height={56} ariaLabel="Sample value history" className="h-14" />;
}

function TrackVisual() {
  return (
    <div className="flex items-center gap-4">
      <div className="w-[38%] shrink-0 drop-shadow-[0_14px_30px_rgba(124,58,237,0.45)]">
        <CardSlabArt card={SAMPLE_SLABS[0]} index={9} source={NO_PHOTO} status="loading" onStatus={noop} sizes="130px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">Value</p>
        <p className="text-[28px] font-extrabold tracking-tight text-white tabular-nums">$412</p>
        <p className="text-sm font-semibold text-[#A78BFA] tabular-nums">+$38 · 10.2%</p>
        <div className="mt-2">
          <ValueLine />
        </div>
        <p className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">Last 90 days</p>
      </div>
    </div>
  );
}

const SAMPLE_COMPS: CompListing[] = [
  { id: "c1", itemId: "c1", title: "Sample rookie · PSA 10", soldPrice: 418, soldDate: "2026-10-24", platform: "eBay", condition: "", shipping: null, url: "" },
  { id: "c2", itemId: "c2", title: "Sample rookie · PSA 10", soldPrice: 405, soldDate: "2026-10-19", platform: "eBay", condition: "", shipping: null, url: "" },
  { id: "c3", itemId: "c3", title: "Sample rookie · PSA 10", soldPrice: 399, soldDate: "2026-10-12", platform: "eBay", condition: "", shipping: null, url: "" },
];

function CompsVisual() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 pt-3 pb-1 text-zinc-900 dark:border-white/10 dark:bg-[#09090B]/70 dark:text-zinc-100">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">Matched to recent sold prices</p>
        <p className="shrink-0 font-mono text-[10px] tracking-wider text-zinc-500 uppercase">via Trawl</p>
      </div>
      <div className="mt-1">
        <CompsList comps={SAMPLE_COMPS} />
      </div>
    </div>
  );
}

function sampleRow(rank: number, title: string, score: number, accent: string): BoardRow {
  return {
    id: `sample-${rank}`,
    userId: `sample-${rank}`,
    rank,
    score,
    title,
    subtitle: "Sample collector",
    href: "",
    avatarUrl: null,
    accent,
    scoreLabel: "cards",
    isNew: false,
    mine: false,
  };
}

function LeaderboardVisual() {
  return (
    <div className="space-y-2">
      <PodiumRow entry={sampleRow(1, "Collector one", 42, "#7C3AED")} boardId="most-cards-added" />
      <PodiumRow entry={sampleRow(2, "Collector two", 35, "#5B21B6")} boardId="most-cards-added" />
      <PodiumRow entry={sampleRow(3, "Collector three", 28, "#A78BFA")} boardId="most-cards-added" />
    </div>
  );
}

function BadgesVisual() {
  return (
    <ol className="grid grid-cols-3 gap-x-2 gap-y-4" aria-label="Badge tiers, Bronze to Legendary">
      {BADGE_TIERS.map((tier) => (
        <li key={tier} className="flex flex-col items-center gap-1.5">
          <Badge category="collector" tier={tier} size={tier === "legendary" ? 72 : 60} label="" />
          <span
            className={`font-mono text-[10px] tracking-wider uppercase ${
              tier === "legendary" ? "font-semibold text-[#A78BFA]" : "text-zinc-400"
            }`}
          >
            {TIER_LABELS[tier]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SocialVisual() {
  const threads: { name: string; line: string; unread: boolean; accent: string }[] = [
    { name: "Collector one", line: "Is that the /25? Clean.", unread: true, accent: "#7C3AED" },
    { name: "Collector two", line: "Sent you the comps.", unread: false, accent: "#5B21B6" },
  ];
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#09090B]">
        <div className="flex items-center gap-3 bg-gradient-to-br from-[#2e1065] to-[#09090B] p-3">
          <div className="w-14 shrink-0">
            <CardSlabArt card={SAMPLE_SLABS[2]} index={9} source={NO_PHOTO} status="loading" onStatus={noop} sizes="56px" />
          </div>
          <p className="min-w-0 flex-1 text-[15px] leading-5 font-semibold text-white">
            New pickup. Numbered to 25 and finally in the PC.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <Logo className="h-4 w-4" />
          <span className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">slabhold.app</span>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-[#09090B]/70">
        <p className="px-3 pt-2.5 text-sm font-bold text-white">Messages</p>
        <ul className="divide-y divide-white/10">
          {threads.map((thread) => (
            <li key={thread.name} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={thread.name} accent={thread.accent} expandable={false} className="h-9 w-9 text-xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{thread.name}</span>
                <span className="block truncate text-xs text-zinc-400">{thread.line}</span>
              </span>
              {thread.unread ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#7C3AED]" /> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const PANEL_VISUALS: Record<(typeof FEATURE_PANELS)[number]["id"], ReactNode> = {
  track: <TrackVisual />,
  comps: <CompsVisual />,
  leaderboard: <LeaderboardVisual />,
  badges: <BadgesVisual />,
  social: <SocialVisual />,
};
