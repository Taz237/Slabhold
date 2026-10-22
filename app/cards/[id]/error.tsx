"use client";

import Link from "next/link";

export default function CardDetailError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-medium">Something went wrong opening this card.</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-11 items-center rounded-full bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Try again
        </button>
        <Link
          href="/collection"
          className="inline-flex min-h-11 items-center text-sm text-violet-700 dark:text-violet-300"
        >
          Back to collection
        </Link>
      </div>
    </div>
  );
}
