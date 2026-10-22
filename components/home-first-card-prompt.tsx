import Link from "next/link";

/** Small home prompt for a signed-in collector who has no cards yet. */
export function HomeFirstCardPrompt() {
  return (
    <p className="border-b border-zinc-200 px-4 py-2 text-sm dark:border-white/10">
      <Link
        href="/cards/new"
        className="inline-flex min-h-11 items-center font-semibold text-violet-700 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:text-violet-300"
      >
        Add your first card
      </Link>
    </p>
  );
}
