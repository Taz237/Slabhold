"use client";

import { Check } from "lucide-react";
import { QUICK_ADD_COPY } from "@/lib/scan/quick-add";

/**
 * The moment a scanned card is added: the card pops (a quick swell and settle) with a purple check,
 * over a dimmed screen, then the collection opens. One tap, no sheet after it. Reduced motion: it
 * simply fades in.
 */
export function AddedPop({ photo }: { photo: string | null }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-zinc-950/60 motion-safe:animate-[lightbox-fade_160ms_ease-out_both]" data-added-pop="">
      <p className="sr-only" role="status">
        {QUICK_ADD_COPY.added}
      </p>
      <div aria-hidden className="flex flex-col items-center gap-4">
        <div className="relative motion-safe:animate-[added-pop_520ms_cubic-bezier(0.34,1.56,0.64,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" width={128} height={179} className="aspect-[5/7] w-32 rounded-xl object-cover shadow-[0_18px_40px_rgba(9,9,11,0.45)] ring-1 ring-white/10" />
          ) : (
            <div className="aspect-[5/7] w-32 rounded-xl bg-zinc-800 ring-1 ring-white/10" />
          )}
          <span className="absolute -right-3 -bottom-3 grid size-10 place-items-center rounded-full bg-violet-600 text-white ring-4 ring-zinc-950/60">
            <Check className="size-5" strokeWidth={2.25} />
          </span>
        </div>
        <span className="text-15 font-semibold text-zinc-50">{QUICK_ADD_COPY.added}</span>
      </div>
    </div>
  );
}
