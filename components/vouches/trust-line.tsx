"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useVouchSummary } from "@/components/use-vouch-summary";
import { NO_VOUCHES, percentPositive, vouchCount, wholeCount, type VouchSummary } from "@/lib/vouches/core";
import { userHref } from "@/lib/social/user-href";

/** Where a person's vouches live. */
export function vouchesHref(username: string): string {
  return `${userHref(username)}/vouches`;
}

/** Pulled up 8px so it reads as part of the counts above it. The tap target is still 44px tall. */
const row = "-mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md pr-1 text-sm";

/** The line itself, from counts that are already in hand. */
export function TrustLineView({ summary, href }: { summary: VouchSummary; href: string }) {
  const total = wholeCount(summary.total);
  if (total === 0) {
    return (
      <Link href={href} className={`${row} text-zinc-500 hover:underline`}>
        {NO_VOUCHES}
      </Link>
    );
  }
  const percent = percentPositive(summary);
  const [number, word] = vouchCount(total).split(" ");
  return (
    <Link href={href} className={`${row} hover:underline`}>
      <BadgeCheck aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-violet-600 dark:text-[#A78BFA]" strokeWidth={1.75} />
      <span>
        <span className="font-semibold tabular-nums">{number}</span> <span className="text-zinc-500">{word}</span>
        {percent === null ? null : (
          <span className="text-zinc-500">
            {" "}
            · <span className="tabular-nums">{percent}%</span> positive
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * A person's vouches in one line, linking to their vouches page. It draws nothing until this
 * database has vouches. While that is being found out, and while the counts load, it holds its
 * height with a skeleton, so the profile under it never moves.
 */
export function TrustLine({ userId, username }: { userId: string; username: string }) {
  const { summary, supported, pending } = useVouchSummary(userId);
  if (!supported && !pending) return null;
  if (!summary) {
    return (
      <div className={row} aria-hidden="true">
        <span className="inline-block h-4 w-36 skeleton-shimmer rounded" />
      </div>
    );
  }
  return <TrustLineView summary={summary} href={vouchesHref(username)} />;
}
