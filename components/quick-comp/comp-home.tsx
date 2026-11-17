"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ArrowRight, ScanLine } from "lucide-react";
import { money } from "@/lib/format";
import { gapMultiple, gradeGaps, type GradeGap } from "@/lib/quick-comp/grade-gap";
import { isRawGrade, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import { safePhoto, type QuickCompPhoto } from "@/lib/quick-comp/photo";
import type { RecentComp } from "@/lib/quick-comp/recent";
import { focusRing, textMuted, textSecondary } from "./tokens";

export const SCAN_HERO_CTA = "Open camera";
export const RECENT_TITLE = "Recent comps";
export const RECENT_CAPTION = "On this device";
export const EMPTY_TITLE = "Your comps land here";
export const EMPTY_BODY = "Search a player or scan a card. Every price you check stays on this device, so it's one tap away next time.";
export const GAP_CAPTION = "Raw to PSA 10, from your comps";

/** A press is a small scale down. Color and transform only, on the one curve. */
const press =
  "motion-safe:transition-[transform,background-color,box-shadow] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:active:scale-[0.97]";
const surface = "bg-white ring-1 ring-zinc-950/[0.06] dark:bg-zinc-900 dark:ring-white/[0.08]";

/** "2024 Prizm #312", plus the version when it isn't Base. */
export function setLine(identity: QuickCompIdentity): string {
  const number = identity.cardNumber ? ` #${identity.cardNumber}` : "";
  const parallel = identity.parallel && identity.parallel.toLowerCase() !== "base" ? ` ${identity.parallel}` : "";
  return `${identity.yearLabel} ${identity.setBrand}${number}${parallel}`.trim();
}

function priceOf(item: RecentComp): number | null {
  return item.payload.median != null && item.payload.comps.length > 0 ? item.payload.median : null;
}

/** The slab drawn in code: label strip on top, card window under it. The placeholder and the hero share it. */
function SlabMark({ className = "", tone = "neutral" }: { className?: string; tone?: "neutral" | "light" }) {
  const line = tone === "light" ? "border-white/35" : "border-zinc-300 dark:border-white/15";
  const fill = tone === "light" ? "bg-white/[0.06]" : "bg-zinc-50 dark:bg-white/[0.03]";
  return (
    <span aria-hidden="true" className={`relative flex aspect-[5/8] flex-col rounded-lg border ${line} ${fill} ${className}`}>
      <span className={`h-[18%] shrink-0 border-b ${line}`} />
      <span className={`m-[10%] flex-1 rounded-[3px] border ${line}`} />
    </span>
  );
}

/** One sale photo, or the slab mark in the same box. Lazy, sized, never a broken image. */
function CompThumb({ photo, alt, sizeClass }: { photo: QuickCompPhoto | null | undefined; alt: string; sizeClass: string }) {
  const safe = safePhoto(photo);
  const [failed, setFailed] = useState<string | null>(null);
  if (!safe || failed === safe.url) {
    return (
      <span data-comp-thumb="none" className="absolute inset-0 grid place-items-center">
        <SlabMark className={sizeClass} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-comp-thumb="photo"
      src={safe.url}
      alt={alt}
      width={240}
      height={300}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(safe.url)}
      className="absolute inset-0 h-full w-full object-contain p-2"
    />
  );
}

export function GradeChip({ grade, className = "" }: { grade: string; className?: string }) {
  const raw = isRawGrade(grade);
  return (
    <span
      data-grade-chip={raw ? "raw" : "graded"}
      className={`inline-flex h-6 items-center rounded-full px-2 font-mono text-11 leading-4 font-medium ${
        raw
          ? "bg-white/90 text-zinc-700 ring-1 ring-zinc-950/10 dark:bg-zinc-950/80 dark:text-zinc-200 dark:ring-white/10"
          : "bg-violet-600 text-white"
      } ${className}`}
    >
      {raw ? "Raw" : grade}
    </span>
  );
}

/**
 * The scanner's way in, as the screen's one bright object: a deep purple tile
 * with a slab drawn in code and one line sweeping it like the viewfinder.
 * The sweep stops for reduced motion.
 */
export function ScanHero({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      data-scan-entry=""
      data-scan-hero=""
      className={`relative flex min-h-44 overflow-hidden rounded-3xl bg-[linear-gradient(160deg,#6D28D9_0%,#5B21B6_55%,#4C1D95_100%)] p-5 text-white ring-1 ring-white/10 ${press} ${focusRing}`}
    >
      <span className="relative z-10 flex min-w-0 flex-1 flex-col pr-4">
        <span className="text-2xl leading-8 font-semibold tracking-tight">{title}</span>
        <span className="mt-1 text-15 leading-5 text-balance text-white/80">{body}</span>
        <span className="mt-auto inline-flex h-11 w-fit items-center gap-2 rounded-full bg-white px-4 pt-px text-15 font-medium text-[#5B21B6]">
          <ScanLine aria-hidden="true" size={18} strokeWidth={1.75} />
          {SCAN_HERO_CTA}
        </span>
      </span>
      <span aria-hidden="true" className="relative mt-1 mr-1 w-[4.75rem] shrink-0 self-center">
        <SlabMark tone="light" className="w-full" />
        {/* Viewfinder corners, just outside the slab. */}
        <span className="absolute -inset-2 rounded-xl [background:linear-gradient(#fff,#fff)_top_left/14px_2px_no-repeat,linear-gradient(#fff,#fff)_top_left/2px_14px_no-repeat,linear-gradient(#fff,#fff)_top_right/14px_2px_no-repeat,linear-gradient(#fff,#fff)_top_right/2px_14px_no-repeat,linear-gradient(#fff,#fff)_bottom_left/14px_2px_no-repeat,linear-gradient(#fff,#fff)_bottom_left/2px_14px_no-repeat,linear-gradient(#fff,#fff)_bottom_right/14px_2px_no-repeat,linear-gradient(#fff,#fff)_bottom_right/2px_14px_no-repeat]" />
        <span
          className="qc-scan-line absolute inset-x-0 top-1 h-0.5 rounded-full bg-white shadow-[0_0_10px_2px_rgb(167_139_250/0.75)]"
          style={{ "--qc-sweep": "7rem" } as CSSProperties}
        />
      </span>
    </Link>
  );
}

function GapSide({
  item,
  label,
  top,
  onOpen,
}: {
  item: RecentComp;
  label: string;
  top: boolean;
  onOpen: (item: RecentComp) => void;
}) {
  const price = priceOf(item) ?? 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`Open the ${label} comp, ${money(price)}`}
      className={`flex h-16 min-w-0 flex-col justify-center rounded-xl px-3 text-left ${press} ${focusRing} ${
        top
          ? "bg-violet-50 ring-1 ring-violet-600/20 hover:bg-violet-100 dark:bg-violet-500/10 dark:ring-violet-400/25 dark:hover:bg-violet-500/15"
          : "bg-zinc-50 ring-1 ring-zinc-950/[0.06] hover:bg-zinc-100 dark:bg-white/[0.04] dark:ring-white/[0.08] dark:hover:bg-white/[0.07]"
      }`}
    >
      <span className={`font-mono text-11 leading-4 font-medium ${top ? "text-violet-700 dark:text-violet-300" : textMuted}`}>{label}</span>
      <span
        className={`truncate text-xl leading-7 font-semibold tabular-nums ${top ? "text-violet-700 dark:text-violet-200" : ""}`}
      >
        {money(price)}
      </span>
    </button>
  );
}

/** One card comped raw and in a PSA 10: the two prices side by side, and how many times over. */
export function GradeGapCard({ gap, onOpen }: { gap: GradeGap; onOpen: (item: RecentComp) => void }) {
  const raw = priceOf(gap.raw) ?? 0;
  const top = priceOf(gap.top) ?? 0;
  const times = gapMultiple(raw, top);
  const identity = gap.top.identity;
  return (
    <article data-grade-gap="" aria-label={`${identity.playerName}: Raw ${money(raw)} to PSA 10 ${money(top)}`} className={`rounded-2xl p-4 ${surface}`}>
      <div className="flex items-center gap-3">
        <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-950/60">
          <CompThumb photo={gap.top.payload.photo ?? gap.raw.payload.photo} alt="" sizeClass="w-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-17 leading-6 font-semibold">{identity.playerName}</span>
          <span className={`block truncate text-13 leading-5 ${textMuted}`}>{setLine(identity)}</span>
        </span>
        {times ? (
          <span className="shrink-0 rounded-full bg-violet-600 px-2.5 py-1 font-mono text-13 leading-5 font-medium text-white tabular-nums">
            {times}
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <GapSide item={gap.raw} label="Raw" top={false} onOpen={onOpen} />
        <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} className={textMuted} />
        <GapSide item={gap.top} label="PSA 10" top onOpen={onOpen} />
      </div>
      <p className={`mt-2 text-12 leading-4 ${textMuted}`}>{GAP_CAPTION}</p>
    </article>
  );
}

function CompCard({ item, onOpen }: { item: RecentComp; onOpen: (item: RecentComp) => void }) {
  const price = priceOf(item);
  const line = setLine(item.identity);
  const grade = isRawGrade(item.identity.grade) ? "Raw" : item.identity.grade;
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={`${item.identity.playerName}, ${line}, ${grade}, ${price != null ? money(price) : "no recent sales"}`}
        className={`flex w-full flex-col overflow-hidden rounded-2xl text-left hover:ring-zinc-950/15 dark:hover:ring-white/15 ${surface} ${press} ${focusRing}`}
      >
        <span className="relative block aspect-[4/5] w-full bg-zinc-100 dark:bg-zinc-950/60">
          <CompThumb photo={item.payload.photo} alt="" sizeClass="w-[42%]" />
          <GradeChip grade={item.identity.grade} className="absolute top-2 left-2" />
        </span>
        <span className="flex min-w-0 flex-col px-3 pt-2.5 pb-3">
          <span className="truncate text-15 leading-5 font-semibold">{item.identity.playerName}</span>
          <span className={`truncate text-12 leading-4 ${textMuted}`}>{line}</span>
          {price != null ? (
            <span className="mt-2 text-xl leading-7 font-semibold tabular-nums">{money(price)}</span>
          ) : (
            <span className={`mt-2 text-15 leading-7 ${textSecondary}`}>No recent sales</span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Saved comps as cards: grade gaps first, then a two-up grid. */
export function RecentComps({ items, onOpen }: { items: RecentComp[]; onOpen: (item: RecentComp) => void }) {
  const { gaps, rest } = gradeGaps(items);
  return (
    <section data-quick-comp-state="recent" aria-labelledby="quick-comp-recent" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="quick-comp-recent" className="text-17 leading-6 font-semibold">
          {RECENT_TITLE}
        </h2>
        <span className={`text-13 leading-5 ${textMuted}`}>{RECENT_CAPTION}</span>
      </div>
      {gaps.map((gap) => (
        <GradeGapCard key={gap.top.key} gap={gap} onOpen={onOpen} />
      ))}
      {rest.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3">
          {rest.map((item) => (
            <CompCard key={item.key} item={item} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Nothing comped yet: three slabs fanned out, and what this space is for. */
export function CompsEmpty() {
  return (
    <section
      data-quick-comp-state="idle"
      className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-950/10 px-6 pt-7 pb-6 text-center dark:border-white/10"
    >
      <span aria-hidden="true" className="flex h-20 items-end">
        <SlabMark className="w-11 translate-x-2 translate-y-1 -rotate-[10deg]" />
        <SlabMark className="relative z-10 w-12 bg-white dark:bg-zinc-900" />
        <SlabMark className="w-11 -translate-x-2 translate-y-1 rotate-[10deg]" />
      </span>
      <p className="mt-4 text-15 leading-5 font-medium">{EMPTY_TITLE}</p>
      <p className={`mt-1 max-w-72 text-13 leading-5 ${textMuted}`}>{EMPTY_BODY}</p>
    </section>
  );
}
