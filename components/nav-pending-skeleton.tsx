import { PublicCardSkeleton } from "@/components/public-card-skeleton";

/**
 * Always in the shell, hidden. A tap on a card tile sets
 * <html data-nav-pending="card"> (lib/ui/tap-feedback.ts) and CSS slides this
 * in on the next frame, before the router has the page. NavMotion clears it
 * in the commit that draws the card, which lands in the same boxes. Under
 * the header, above the page, below the bottom bar.
 */
export function NavPendingSkeleton() {
  return (
    <div
      data-nav-pending-skeleton=""
      className="fixed inset-x-0 top-[calc(3.25rem+env(safe-area-inset-top))] bottom-0 z-[25] overflow-hidden bg-[var(--background)]"
    >
      <div className="mx-auto w-full max-w-lg px-4 py-5">
        <PublicCardSkeleton />
      </div>
    </div>
  );
}
