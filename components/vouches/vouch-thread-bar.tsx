"use client";

import { useSocial } from "@/components/social-provider";
import { lazyPart } from "@/lib/ui/lazy-part";

type BarProps = { partner: { id: string; username: string } };

/** The bar's height while its chunk, or the answer about vouches, is on the way: nothing below it moves. */
function VouchThreadBarSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-h-11 shrink-0 items-center border-b border-zinc-200/80 px-4 dark:border-white/[0.08]">
      <span className="inline-block h-4 w-36 skeleton-shimmer rounded" />
    </div>
  );
}

const VouchThreadBarView = lazyPart<BarProps>(
  () => import("@/components/vouches/vouch-thread-bar-view").then((mod) => mod.VouchThreadBarView),
  VouchThreadBarSkeleton,
  { name: "vouch-thread-bar" },
);

/**
 * One row under a chat's header: the other person's vouches on the left, and Vouch (or why not
 * yet) on the right. Nothing draws when you blocked them. Everything else, including the check
 * that this database has vouches at all, is in the row's own chunk, so a chat loads only this
 * small shell with it.
 */
export function VouchThreadBar({ partner }: BarProps) {
  const { user, blockedIds } = useSocial();
  if (!user || user.id === partner.id || blockedIds.includes(partner.id)) return null;
  return <VouchThreadBarView partner={partner} />;
}
