import { STAGE_HEIGHT, cardSection } from "@/components/card-page/section-styles";

const BAR = "rounded bg-zinc-200/80 dark:bg-white/[0.06]";

/**
 * The card page's boxes before data: back row, the card on its stage, the
 * title and owner lines and the value read. Same sizes as the page, so the
 * swap does not move anything. loading.tsx, the page's own wait for the
 * social store, and the shell's tap-time skeleton (NavPendingSkeleton) all use
 * it. Kept apart from the card page, and kept small, so the shell can draw it
 * without loading that page's code.
 */
export function PublicCardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" data-public-card-skeleton="">
      <span className="sr-only">Loading card</span>
      <div aria-hidden="true" className="flex h-11 items-center">
        <div className={`h-4 w-28 ${BAR}`} />
      </div>
      {/* The stage: the card's 5:7 box at the page's fixed stage height. */}
      <div aria-hidden="true" className="-mx-4 flex justify-center py-5">
        <div className="skeleton-shimmer aspect-[5/7] rounded-xl" style={{ height: STAGE_HEIGHT }} />
      </div>
      {/* Title lines (80px), then the owner row (44px). */}
      <div aria-hidden="true" className="h-[8.75rem] pt-1">
        <div className={`h-3 w-32 ${BAR}`} />
        <div className={`mt-3 h-7 w-52 ${BAR}`} />
      </div>
      {/* The value read: label, price and line (96px), then the plot. */}
      <div aria-hidden="true" className={cardSection}>
        <div className="h-24 pt-[1.625rem]">
          <div className={`h-8 w-36 ${BAR}`} />
        </div>
        <div className="skeleton-shimmer mt-4 h-52 rounded-2xl" />
      </div>
    </div>
  );
}
