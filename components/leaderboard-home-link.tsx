import Link from "next/link";
import { LEADERBOARD_PATH, LEADERBOARD_TITLE, THIS_WEEK_LABEL } from "@/lib/leaderboard/rules";

/** Home link under Moving today. Server-rendered so the feed client bundle stays the same. */
export function LeaderboardHomeLink() {
  return (
    <Link
      href={LEADERBOARD_PATH}
      className="flex min-h-11 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2.5 text-sm dark:border-white/10"
    >
      <span className="font-semibold">{LEADERBOARD_TITLE}</span>
      <span className="text-zinc-500">{THIS_WEEK_LABEL}</span>
    </Link>
  );
}
