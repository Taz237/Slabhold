"use client";

import { SwatchDot } from "@/components/add-card/flow-ui";
import { REVEAL_COPY, REVEAL_FIELDS, type RevealFound } from "@/lib/scan/reveal";

/** Time between one field landing and the next, when several are found at once. */
export const FIELD_STEP_MS = 130;

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
 * The scan reveal's card, made of the collector's own photos: the front, and the back on its
 * reverse. While the card is read it keeps turning (front, then back, then front) so the screen is
 * never still and never blank; with only a front it tilts side to side. Once read, it rests on its
 * front. Reduced motion: no turning at all, the front simply fades in. Transform only, so it stays
 * smooth on any phone.
 */
export function RevealSpinCard({ photo, backPhoto = null, turning, size = "large" }: { photo: string | null; backPhoto?: string | null; turning: boolean; size?: "large" | "small" }) {
  const width = size === "large" ? "w-40" : "w-28";
  const motion = turning
    ? backPhoto
      ? "motion-safe:animate-[reveal-turn_3200ms_cubic-bezier(0.45,0,0.55,1)_infinite]"
      : "motion-safe:animate-[reveal-tilt_1800ms_cubic-bezier(0.45,0,0.55,1)_infinite_alternate]"
    : "";
  return (
    <div className="flex justify-center pt-1 pb-5 [perspective:900px]" data-reveal="scan-card">
      <div className={`${width} motion-safe:animate-[card-flip-in_620ms_cubic-bezier(0.2,0.7,0.2,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both]`}>
        <div
          data-turning={turning ? (backPhoto ? "both-sides" : "tilt") : "rest"}
          className={`relative aspect-[5/7] w-full rounded-2xl shadow-[0_18px_40px_rgba(9,9,11,0.35)] [transform-style:preserve-3d] ${motion}`}
        >
          <div className={face}>{photo ? <Photo src={photo} alt={REVEAL_COPY.front} /> : <EmptyFace label={REVEAL_COPY.noPhoto} />}</div>
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
 * Player, Year, Set, Number and Parallel, each filling in the moment it is found: a skeleton until
 * then, never a spinner. Each lands on its own beat, so ones found together come in order. Once the read is
 * done, a field nothing found says so plainly, muted.
 */
export function RevealFields({ found, done }: { found: RevealFound; done: boolean }) {
  return (
    <dl className="mx-auto grid w-full max-w-xs grid-cols-[auto_1fr] gap-x-4 gap-y-2" data-reveal="fields">
      {REVEAL_FIELDS.map((field) => {
        const value = found[field];
        // Each field keeps its own beat, so ones found together land in order and none replays.
        const delay = REVEAL_FIELDS.indexOf(field) * FIELD_STEP_MS;
        return (
          <div key={field} className="contents" data-field={field}>
            <dt className="text-13 leading-6 text-zinc-500 dark:text-zinc-400">{REVEAL_COPY.labels[field]}</dt>
            <dd className="m-0 min-h-6 min-w-0 text-right">
              {value ? (
                <span
                  data-found
                  className={`inline-flex max-w-full items-center justify-end gap-1.5 truncate text-15 leading-6 font-medium motion-safe:animate-[name-fill-in_320ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both] ${
                    field === "number" ? "font-mono tabular-nums" : ""
                  }`}
                  style={{ animationDelay: `${delay}ms` }}
                >
                  {field === "parallel" ? <SwatchDot name={value} size="sm" /> : null}
                  <span className="truncate">{value}</span>
                </span>
              ) : done ? (
                <span data-open className="text-15 leading-6 text-zinc-400 dark:text-zinc-500">
                  {REVEAL_COPY.open}
                </span>
              ) : (
                <span aria-hidden className="ml-auto block h-4 w-24 translate-y-1 rounded-md skeleton-shimmer" />
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
