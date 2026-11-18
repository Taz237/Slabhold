import type { ReactNode } from "react";
import { CompCardSkeleton, GhostPlot, compCard, compLabel } from "@/components/comp-basis";
import { QuickCompPhotoSkeleton } from "./quick-comp-photo";
import { feedback, focusRing, textMuted } from "./tokens";

/** The stat row while the comps load: the same 3 cells and height as the loaded row. */
export function StatRowSkeleton() {
  return (
    <div aria-hidden="true" className={`grid grid-cols-3 divide-x divide-zinc-950/5 py-3 dark:divide-white/[0.06] ${compCard}`}>
      {[0, 1, 2].map((cell) => (
        <div key={cell} className="flex h-10 flex-col justify-between px-3 first:pl-0 last:pr-0">
          <span className="skeleton-shimmer block h-3 w-8 rounded-md bg-zinc-100 dark:bg-white/5" />
          <span className="skeleton-shimmer block h-4 w-16 rounded-md bg-zinc-100 dark:bg-white/5" />
        </div>
      ))}
    </div>
  );
}

/** Comps loading: the photo box and the #157 skeleton in their final shapes, so the result lands without a shift. */
export function QuickCompLoading() {
  return (
    <div data-quick-comp-state="loading" className="flex flex-col gap-3">
      <QuickCompPhotoSkeleton />
      <CompCardSkeleton />
      <StatRowSkeleton />
    </div>
  );
}

/** A comp-card-shaped notice: errors, limits and offline. Never a $0. */
export function QuickCompNotice({
  state,
  title,
  caption,
  action,
}: {
  state: string;
  title: string;
  caption?: string | null;
  action?: ReactNode;
}) {
  return (
    <section data-quick-comp-state={state} className={compCard}>
      <p className={`flex h-5 items-center ${compLabel}`}>Recent sales</p>
      <GhostPlot>
        <p className="text-15 leading-5 font-medium">{title}</p>
        {caption ? <p className={`text-13 leading-5 ${textMuted}`}>{caption}</p> : null}
        {action}
      </GhostPlot>
    </section>
  );
}

export function NoticeButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-2 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 ${feedback} ${focusRing}`}
    >
      {children}
    </button>
  );
}
