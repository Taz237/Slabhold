"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** The leaderboard is read on the server: Try again reads it again, in place. */
export function LeaderboardRetry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={() => startTransition(() => router.refresh())}
      className="mt-4 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none"
    >
      {pending ? "Trying again…" : "Try again"}
    </button>
  );
}
