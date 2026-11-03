import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { QUICK_COMP_PATH } from "@/lib/quick-comp/flag";

/** Home link to Quick Comp, above the leaderboard link. Only drawn while the flag is on. */
export function QuickCompHomeLink() {
  return (
    <Link
      href={QUICK_COMP_PATH}
      className="flex min-h-11 items-center gap-2 border-b border-zinc-200 px-4 py-2.5 text-sm outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-600 dark:border-white/10"
    >
      <Search aria-hidden="true" size={16} strokeWidth={1.5} className="shrink-0 text-zinc-500 dark:text-zinc-400" />
      <span className="font-medium">Comp a card</span>
      <span className="ml-auto text-zinc-500 dark:text-zinc-400">Recent sold prices</span>
      <ChevronRight aria-hidden="true" size={16} strokeWidth={1.5} className="-mr-1 shrink-0 text-zinc-500 dark:text-zinc-400" />
    </Link>
  );
}
