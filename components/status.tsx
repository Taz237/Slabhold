export function EmptyState({
  title,
  detail,
  compact = false,
  icon,
  children,
}: {
  title: string;
  detail?: string;
  compact?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={compact ? "px-4 py-8 text-center" : "px-6 py-12 text-center"}>
      {icon ? (
        <div
          className={`mx-auto grid place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400 ${
            compact ? "mb-2.5 h-10 w-10" : "mb-3 h-12 w-12"
          }`}
        >
          {icon}
        </div>
      ) : null}
      <p className={`font-bold tracking-tight ${compact ? "text-[15px]" : "text-[17px]"}`}>
        {title}
      </p>
      {detail ? (
        <p
          className={`mx-auto mt-1.5 text-sm leading-5 text-zinc-500 ${
            compact ? "max-w-[16rem]" : "max-w-[18rem]"
          }`}
        >
          {detail}
        </p>
      ) : null}
      {children ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="px-4 py-2">
      {Array.from({ length: count }, (_, row) => (
        <div key={row} className="flex gap-3 border-b border-zinc-200 py-3 dark:border-white/10">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
          <div className="min-w-0 flex-1 space-y-2 pt-1.5">
            <div className="h-3 w-28 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
            <div className="h-3 w-full animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" />
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="-mx-4 -mt-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading timeline</span>
      <div className="grid grid-cols-2 border-b border-zinc-200 dark:border-white/10">
        <div className="mx-auto my-4 h-3 w-16 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
        <div className="mx-auto my-4 h-3 w-20 animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" />
      </div>
      <LoadingRows count={4} />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="-mx-4 -mt-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading profile</span>
      <div className="h-40 animate-pulse bg-zinc-200/80 dark:bg-white/5" />
      <div className="px-4">
        <div className="-mt-10 h-20 w-20 animate-pulse rounded-full bg-zinc-200 ring-4 ring-[var(--background)] dark:bg-white/10" />
        <div className="mt-4 h-4 w-36 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
        <div className="mt-2 h-3 w-24 animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" />
        <div className="mt-4 h-3 w-40 animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" />
      </div>
      <LoadingRows count={2} />
    </div>
  );
}

export function CollectionSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading collection</span>
      <div>
        <div className="h-3 w-16 animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" />
        <div className="mt-2 h-7 w-40 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="h-14 w-11 shrink-0 animate-pulse rounded-lg bg-zinc-200/80 dark:bg-white/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-32 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
              <div className="h-3 w-48 max-w-full animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
