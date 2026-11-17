"use client";

import { useMemo } from "react";
import { REVEAL_COPY, revealLines, typingPlan } from "@/lib/scan/reveal";
import type { ScanMatch } from "@/lib/scan/match";

const face = "absolute inset-0 overflow-hidden rounded-2xl ring-1 ring-zinc-900/10 [backface-visibility:hidden] dark:ring-white/10";

function Photo({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={160} height={224} decoding="async" draggable={false} className="h-full w-full object-cover" />;
}

/** A designed empty card, never a broken image. */
function EmptyFace({ label }: { label: string }) {
  return (
    <div role="img" aria-label={label} className="grid h-full w-full place-items-center bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-white/[0.08] dark:to-white/[0.03]">
      <span aria-hidden className="size-8 rounded-full bg-zinc-900/[0.06] dark:bg-white/10" />
    </div>
  );
}

/**
 * "reading": the card turns (front, back, front) while it's read, so the screen is never blank.
 * "landing": the read is in; the card spins from its back to its front once, with a glare sweep
 * across it. "rest": it sits on its front. Reduced motion: no turning, no glare, the front simply
 * fades in. Transform and opacity only, so it stays smooth on any phone.
 */
export type RevealMotion = "reading" | "landing" | "rest";

/** The scan reveal's card, made of the collector's own photos: the front, and the back on its reverse. */
export function RevealSpinCard({ photo, backPhoto = null, motion, size = "large" }: { photo: string | null; backPhoto?: string | null; motion: RevealMotion; size?: "large" | "small" }) {
  const width = size === "large" ? "w-40" : "w-24";
  const spin =
    motion === "reading"
      ? backPhoto
        ? "motion-safe:animate-[reveal-turn_3200ms_cubic-bezier(0.45,0,0.55,1)_infinite]"
        : "motion-safe:animate-[reveal-tilt_1800ms_cubic-bezier(0.45,0,0.55,1)_infinite_alternate]"
      : motion === "landing"
        ? backPhoto
          ? "motion-safe:animate-[reveal-land_900ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
          : "motion-safe:animate-[reveal-land-front_600ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
        : "";
  const glare =
    motion === "reading"
      ? "motion-safe:animate-[reveal-glare_2400ms_ease-in-out_infinite]"
      : motion === "landing"
        ? "motion-safe:animate-[reveal-glare_900ms_ease-out_400ms_both]"
        : "";
  return (
    <div className="flex justify-center pt-1 pb-5 [perspective:900px]" data-reveal="scan-card">
      <div className={`${width} motion-safe:animate-[card-flip-in_620ms_cubic-bezier(0.2,0.7,0.2,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both]`}>
        <div data-motion={motion} data-both-sides={backPhoto ? "" : undefined} className={`relative aspect-[5/7] w-full rounded-2xl shadow-[0_18px_40px_rgba(9,9,11,0.35)] [transform-style:preserve-3d] ${spin}`}>
          <div className={face}>
            {photo ? <Photo src={photo} alt={REVEAL_COPY.front} /> : <EmptyFace label={REVEAL_COPY.noPhoto} />}
            {glare ? (
              <span
                aria-hidden
                data-glare=""
                className={`pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-0 ${glare}`}
              />
            ) : null}
          </div>
          {backPhoto ? (
            <div aria-hidden className={`${face} [transform:rotateY(180deg)]`}>
              <Photo src={backPhoto} alt="" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The card's details typing in one line at a time, like a slab label being read: a raw card's
 * year, set, number, player and parallel; a slab's cert, then player, year, set, number, grade and
 * parallel. While the card is still being read, a caret waits. Reduced motion: the lines simply
 * show. Screen readers get the whole label at once.
 */
export function RevealLabel({ match, onDone }: { match: ScanMatch | null; onDone?: () => void }) {
  const lines = useMemo(() => (match ? revealLines(match) : []), [match]);
  const plan = useMemo(() => typingPlan(lines), [lines]);
  return (
    <div
      data-reveal="label"
      onClick={onDone}
      className="mx-auto w-full max-w-xs rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-sm leading-6 dark:border-white/10 dark:bg-white/[0.03]"
    >
      {match ? (
        <>
          <p className="sr-only" role="status">
            {lines.map((line) => line.text).join(", ")}
          </p>
          <ul aria-hidden className="space-y-0.5">
            {lines.map((line, index) => {
              const timing = plan.lines[index];
              const open = line.field === "parallel" && !match.parallel;
              return (
                <li key={`${line.field}-${index}`} data-line={line.field} className={`flex ${line.field === "player" ? "text-15 font-semibold" : ""} ${open ? "text-zinc-400 dark:text-zinc-500" : ""}`}>
                  <span
                    className="inline-block max-w-full overflow-hidden whitespace-nowrap motion-safe:animate-[reveal-type_var(--type-ms)_steps(var(--type-chars))_var(--type-delay)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both]"
                    style={
                      {
                        "--type-ms": `${timing.durationMs}ms`,
                        "--type-chars": String(Math.max(1, timing.chars)),
                        "--type-delay": `${timing.delayMs}ms`,
                      } as React.CSSProperties
                    }
                  >
                    {line.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p role="status" className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
          {REVEAL_COPY.reading}
          <span aria-hidden className="inline-block h-4 w-2 bg-violet-600 motion-safe:animate-[reveal-caret_1s_steps(1)_infinite] dark:bg-[#A78BFA]" />
        </p>
      )}
    </div>
  );
}
