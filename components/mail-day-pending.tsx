export function MailDayHeading() {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Pickup</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Add a card</h1>
      <p className="mt-1 text-sm text-zinc-500">Add today&apos;s pickups</p>
    </div>
  );
}

export function MailDaySkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-14 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-white/10" />
      <div className="h-28 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-11 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-white/[0.06]" />
        <div className="h-11 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-white/10" />
      </div>
      <div className="h-11 w-36 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
    </div>
  );
}

/** Heading plus form placeholders. Shown before the form data is ready. */
export function MailDayPending() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <MailDayHeading />
      <MailDaySkeleton />
    </div>
  );
}
