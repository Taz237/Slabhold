import Link from "next/link";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

/** At least 44px tall, with a visible focus ring. Links to /cards/new. */
export function AddCardLink({ prominent = false }: { prominent?: boolean }) {
  const className = prominent
    ? `mt-6 inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-zinc-900 px-6 text-base font-bold text-white dark:bg-zinc-100 dark:text-zinc-950 ${focusRing}`
    : `inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-zinc-900 px-4 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-950 ${focusRing}`;
  return (
    <Link href="/cards/new" className={className}>
      Add a card
    </Link>
  );
}
