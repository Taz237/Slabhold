"use client";

import { useCallback, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { CardSlabArt, type ArtCard } from "@/components/card-slab-art";
import { photoSource, photoStatusAfter, type PhotoStatus } from "@/lib/collection/grid";
import { parallelSwatch } from "@/lib/cards/parallel-swatch";

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

const chipBase = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition-[background-color,border-color,transform] duration-150 ease-out motion-safe:active:scale-[0.97] motion-reduce:transition-none ${focusRing}`;

const chipIdle =
  "border-zinc-200 bg-white text-zinc-900 hover:border-violet-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:border-violet-400/60";

const chipOn = "border-violet-600 bg-violet-600 text-white hover:bg-violet-500";

/** A choice chip. Pass `selected` for a pick; leave it out for a plain action. */
export function Chip({
  selected,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`${chipBase} ${selected ? chipOn : chipIdle} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

/** A quiet text button, still 44px tall. */
export function QuietButton({
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-[#A78BFA] ${focusRing} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 w-full items-center justify-center rounded-full bg-violet-600 px-6 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
      {children}
    </p>
  );
}

/** A colored dot for a parallel. Decorative: the name sits next to it. */
export function SwatchDot({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const swatch = parallelSwatch(name);
  const box = size === "lg" ? "size-7" : size === "sm" ? "size-3.5" : "size-5";
  return (
    <span
      aria-hidden
      data-swatch={swatch.kind}
      className={`${box} shrink-0 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ${
        swatch.ring ? "ring-1 ring-zinc-400/60 dark:ring-white/30" : ""
      }`}
      style={{ background: swatch.background }}
    />
  );
}

/** "/99" on a parallel with a known run. "1/1" for a one of one. */
export function RunBadge({ run }: { run: number }) {
  return (
    <span className="shrink-0 rounded-md bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] leading-4 font-semibold tracking-wide text-white tabular-nums dark:bg-white/15 dark:text-zinc-100">
      {run === 1 ? "1/1" : `/${run}`}
    </span>
  );
}

export function FlowProgress({
  value,
  label,
}: {
  /** 0 to 1. */
  value: number;
  label: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10"
    >
      <div
        className="h-full rounded-full bg-violet-600 transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.max(pct, 4)}%` }}
      />
    </div>
  );
}

export function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-900/5 dark:text-zinc-200 dark:hover:bg-white/10 ${focusRing}`}
    >
      <ChevronLeft className="size-5" aria-hidden />
    </button>
  );
}

/**
 * The slab art for the draft. Same art as the Collection tile, so what you see
 * here is what lands in your collection.
 */
export function DraftSlab({ art, photo }: { art: ArtCard; photo: string | null }) {
  const source = photoSource(photo);
  const [state, setState] = useState<{ src: string | null; status: PhotoStatus }>({
    src: photo,
    status: "loading",
  });
  const status = state.src === photo ? state.status : "loading";
  const onStatus = useCallback(
    (event: "load" | "error") =>
      setState((current) => ({
        src: photo,
        status: photoStatusAfter(current.src === photo ? current.status : "loading", event),
      })),
    [photo],
  );
  return (
    <CardSlabArt card={art} index={0} source={source} status={status} onStatus={onStatus} sizes="176px" />
  );
}
