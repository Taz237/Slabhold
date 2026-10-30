import Link from "next/link";
import { Camera, ChevronRight } from "lucide-react";

/**
 * Home row for a signed-in collector who has no cards yet. `afterGetStarted`
 * marks the server-drawn copy that shows only when Get started is hidden
 * (see getStartedHintScript and globals.css).
 */
export function HomeFirstCardPrompt({ afterGetStarted = false }: { afterGetStarted?: boolean } = {}) {
  return (
    <div
      data-after-get-started={afterGetStarted ? "" : undefined}
      className="border-b border-zinc-200 px-4 py-3 dark:border-white/10"
    >
      <Link
        href="/cards/new"
        className="flex min-h-11 items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 transition-colors duration-150 hover:bg-zinc-50 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#7C3AED] to-[#5B21B6] text-white shadow-[0_8px_20px_-10px_rgba(124,58,237,0.9)]">
          <Camera aria-hidden className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold tracking-tight">Add your first card</span>
          <span className="block text-sm text-zinc-500 dark:text-zinc-400">
            Snap it and we match recent sold prices.
          </span>
        </span>
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-zinc-400" />
      </Link>
    </div>
  );
}
