"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSocial } from "@/components/social-provider";
import { signupPath } from "@/lib/auth/safe-next";
import { lazyPart } from "@/lib/ui/lazy-part";

export const CARD_TALK_HEADING = "What collectors are saying";

type CardTalkProps = {
  cardId: string;
  heading?: string;
};

/** The posts section's box and header: shared by the loaded section and its loading state. */
export function CardTalkFrame({
  cardId,
  heading = CARD_TALK_HEADING,
  loading,
  children,
}: CardTalkProps & { loading: boolean; children: ReactNode }) {
  const { user } = useSocial();
  const pathname = usePathname() || "/";
  return (
    <section
      data-slot="card-talk"
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5"
      aria-busy={loading || undefined}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold">{heading}</h2>
          <p className="text-xs text-zinc-500">Posts about this card</p>
        </div>
        {user ? (
          <Link
            href={`/compose?card=${encodeURIComponent(cardId)}`}
            className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white dark:bg-zinc-100 dark:text-zinc-950"
          >
            Post about this card
          </Link>
        ) : (
          <Link
            href={signupPath(pathname)}
            className="text-xs font-semibold text-violet-700 underline underline-offset-2 dark:text-violet-300"
          >
            Sign up to post
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function CardTalkSkeleton() {
  return (
    <div className="mt-3 space-y-3">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
      ))}
    </div>
  );
}

/** What the section draws while its posts load: also what shows until its chunk arrives. */
export function CardCollectorsSayingPending(props: CardTalkProps) {
  return (
    <CardTalkFrame {...props} loading>
      <CardTalkSkeleton />
    </CardTalkFrame>
  );
}

/**
 * The posts section from its own chunk. Posts, the timeline row and its menus
 * load after the card itself, below the fold.
 */
export const LazyCardCollectorsSaying = lazyPart<CardTalkProps>(
  () => import("@/components/card-collectors-saying").then((mod) => mod.CardCollectorsSaying),
  CardCollectorsSayingPending,
);
