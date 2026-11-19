import { GRID_CLASS } from "@/lib/collection/grid";

/** The cards page while it loads: its header row and six tile slots in the same grid. */
export function ProfileCardsSkeleton() {
  return (
    <div className="-mx-4 -mt-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading cards</span>
      <div className="flex h-[3.75rem] items-center gap-3 border-b border-zinc-200 px-4 dark:border-white/10">
        <div className="h-9 w-9 skeleton-shimmer rounded-full" />
        <div className="h-4 w-32 skeleton-shimmer rounded-full" />
      </div>
      <ul className={`${GRID_CLASS} px-4 py-4`} aria-hidden>
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className="p-1">
            <div className="aspect-[3/5] w-full skeleton-shimmer rounded-xl" />
            <div className="mt-2 h-3.5 w-3/4 skeleton-shimmer rounded-full" />
            <div className="mt-1.5 h-3 w-1/2 skeleton-shimmer rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
