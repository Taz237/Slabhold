"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PenLine } from "lucide-react";
import { cardSection, cardSectionTitle } from "@/components/card-page/section-styles";
import { useSocial } from "@/components/social-provider";
import { PartLoadFailed } from "@/components/card-page-parts";
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
    <section data-slot="card-talk" className={cardSection} aria-busy={loading || undefined}>
      <h2 className={cardSectionTitle}>{heading}</h2>
      {/* One clear way in, shaped like the box you would type in. */}
      <Link
        href={user ? `/compose?card=${encodeURIComponent(cardId)}` : signupPath(pathname)}
        data-card-talk-post=""
        className="mt-3 flex min-h-11 items-center gap-2.5 rounded-full bg-zinc-950/[0.04] px-4 text-sm font-medium text-zinc-700 outline-none transition-colors duration-150 hover:bg-zinc-950/[0.07] focus-visible:ring-2 focus-visible:ring-violet-600 motion-reduce:transition-none dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/[0.09]"
      >
        <PenLine aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-violet-600 dark:text-violet-400" strokeWidth={1.5} />
        {user ? "Post about this card" : "Sign up to post"}
      </Link>
      {children}
    </section>
  );
}

/** No posts yet: a warm nudge, not a blank. */
export function CardTalkEmpty() {
  return (
    <div data-card-talk-empty="" className="px-2 pt-6 pb-2 text-center">
      <p className="text-15 leading-5 font-semibold">Nobody has posted about this card yet</p>
      <p className="mx-auto mt-1 max-w-64 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
        Pulled it, chasing it or just like it? Say so and get it started
      </p>
    </div>
  );
}

export function CardTalkSkeleton() {
  return (
    <div className="mt-3 space-y-3">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="h-16 skeleton-shimmer rounded-xl" />
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

/** The section's chunk would not load: the same box and header, with Try again. */
export function CardCollectorsSayingFailed({ retry, ...props }: CardTalkProps & { retry: () => void }) {
  return (
    <CardTalkFrame {...props} loading={false}>
      <PartLoadFailed retry={retry} />
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
  { name: "card-collectors-saying", failed: CardCollectorsSayingFailed },
);
