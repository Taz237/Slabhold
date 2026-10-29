"use client";

import Link from "next/link";
import { WalletCards } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { useSocial } from "@/components/social-provider";
import { COLLECTION_PAGE_CARD_LIMIT, type PublicCollector } from "@/lib/invites/public-collector";
import { invitePath } from "@/lib/share/links";
import type { PublicCard } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";
import { SlabFrame } from "./slab-fan";
import { ShareCollectionCard } from "./share-collection-card";
import { usePublicCollector } from "./use-public-collector";

const joinButton =
  "flex h-12 w-full items-center justify-center rounded-full bg-[#7C3AED] px-6 text-[16px] font-semibold text-white shadow-[0_12px_32px_-12px_rgba(124,58,237,0.9)] transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:outline-none";

function cardLine(card: PublicCard): string {
  return [card.yearLabel || (card.year ? String(card.year) : ""), card.setBrand, card.grade].filter(Boolean).join(" · ");
}

function CollectionGridTile({ card, username, index }: { card: PublicCard; username: string; index: number }) {
  return (
    <li>
      <Link
        href={`${userHref(username)}/cards/${encodeURIComponent(card.id)}`}
        prefetch={false}
        className="group block rounded-2xl p-1 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
      >
        <SlabFrame
          card={card}
          priority={index < 4}
          className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:-translate-y-1"
        />
        <p className="mt-2 truncate px-0.5 text-[14px] leading-5 font-bold tracking-tight">{card.playerName}</p>
        <p className="truncate px-0.5 text-[12px] leading-4 text-zinc-500">{cardLine(card)}</p>
      </Link>
    </li>
  );
}

/** Unknown, reserved or private: the same page for all, with nothing about anyone. */
function GenericCollection() {
  return (
    <div className="px-6 py-16 text-center">
      <Logo className="mx-auto h-12 w-12" />
      <h1 className="mt-5 text-[1.75rem] leading-tight font-extrabold tracking-tight">Collections live on Slabhold</h1>
      <p className="mx-auto mt-2 max-w-xs text-[15px] leading-6 text-zinc-500">
        Track your cards with recent sold prices, and share the ones you&apos;re proud of.
      </p>
      <div className="mx-auto mt-6 max-w-xs">
        <Link href="/" className={joinButton}>
          Open Slabhold
        </Link>
      </div>
    </div>
  );
}

/**
 * /u/<username>/collection: a read-only grid of public cards, most valuable
 * first, with the count and handle. Signed out, a Join button goes through
 * the invite flow, so joining follows this collector.
 */
export function PublicCollection({ handle, collector: server }: { handle: string | null; collector: PublicCollector | null }) {
  const { ready, user } = useSocial();
  const collector = usePublicCollector(handle, server, COLLECTION_PAGE_CARD_LIMIT);
  if (!collector) return <GenericCollection />;
  const own = Boolean(user && user.id === collector.id);
  const total = collector.publicCardCount ?? collector.cards.length;
  const shown = collector.cards.length;

  return (
    <div data-public-collection="" className="pb-28">
      <section className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <Link href={userHref(collector.username)} className="shrink-0 rounded-full" aria-label={`${collector.displayName}'s profile`}>
            <Avatar name={collector.displayName} image={collector.avatarUrl} expandable={false} className="h-12 w-12 text-sm" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={userHref(collector.username)} className="block truncate text-[17px] font-bold tracking-tight hover:underline">
              {collector.displayName}
            </Link>
            <p className="truncate text-[14px] text-zinc-500">@{collector.username}</p>
          </div>
        </div>
        <p className="mt-5 font-mono text-[11px] font-medium tracking-[0.18em] text-violet-600 uppercase dark:text-[#A78BFA]">
          The collection
        </p>
        <h1 className="mt-1 text-[2.5rem] leading-none font-extrabold tracking-[-0.035em] tabular-nums">
          {total.toLocaleString("en-US")} {total === 1 ? "card" : "cards"}
        </h1>
        {total > shown && shown > 0 ? (
          <p className="mt-2 text-[13px] text-zinc-500">The {shown} most valuable.</p>
        ) : null}
      </section>

      {own ? (
        <div className="px-4 pb-4">
          <ShareCollectionCard />
        </div>
      ) : null}

      {shown === 0 ? (
        <div className="mx-4 rounded-3xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-white/15">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-violet-600/10 text-violet-600 dark:bg-violet-500/15 dark:text-[#A78BFA]">
            <WalletCards aria-hidden className="h-5 w-5" />
          </div>
          <p className="mt-3 text-[17px] font-bold tracking-tight">No public cards yet</p>
          <p className="mx-auto mt-1 max-w-[17rem] text-sm text-zinc-500">
            {own ? "Mark a card public in your collection and it shows up here." : "Cards they share will show up here."}
          </p>
        </div>
      ) : (
        <ul aria-label="Public cards" className="grid grid-cols-2 gap-x-3 gap-y-5 px-3 sm:grid-cols-3 lg:grid-cols-4">
          {collector.cards.map((card, index) => (
            <CollectionGridTile key={card.id} card={card} username={collector.username} index={index} />
          ))}
        </ul>
      )}

      {ready && !user ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/70 bg-[color-mix(in_oklab,var(--background)_88%,transparent)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/10">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <Logo className="h-9 w-9 shrink-0" />
            <Link href={invitePath(collector.username)} data-collection-join="" className={joinButton}>
              Join Slabhold
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
