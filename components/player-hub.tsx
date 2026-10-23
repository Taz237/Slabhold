import type { ReactNode } from "react";
import Link from "next/link";
import { CardThumb } from "@/components/card-thumb";
import { ShareIconButton } from "@/components/share-button";
import { EmptyState } from "@/components/status";
import { timeAgo } from "@/lib/format";
import {
  PLAYER_CARDS_EMPTY,
  PLAYER_CARDS_HEADING,
  PLAYER_OFFERS_EMPTY,
  PLAYER_OFFERS_HEADING,
  PLAYER_POSTS_EMPTY,
  PLAYER_POSTS_HEADING,
  PLAYER_SALES_EMPTY,
  RECENT_SOLD_PRICES_LABEL,
  type HubCard,
  type HubOwner,
  type HubPost,
  type HubSale,
} from "@/lib/players/hub";
import type { PlayerChoice, PlayerPageData } from "@/lib/players/load-hub";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-zinc-200 py-4 dark:border-white/10">
      <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function PostList({ posts }: { posts: HubPost[] }) {
  if (posts.length === 0) {
    return <EmptyState compact title={PLAYER_POSTS_EMPTY} />;
  }
  return (
    <ul>
      {posts.map((post) => {
        const stamp = timeAgo(post.createdAt);
        return (
          <li key={post.id} className="border-b border-zinc-200 py-3 last:border-b-0 dark:border-white/10">
            <Link href={post.href} className="block">
              <span className="flex min-w-0 items-baseline gap-1 text-[15px]">
                <span className="truncate font-bold">{post.authorName}</span>
                {stamp ? <span className="shrink-0 text-zinc-500">· {stamp}</span> : null}
              </span>
              <span className="mt-0.5 line-clamp-3 block text-[15px] leading-5 whitespace-pre-wrap">
                {post.body}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function CardList({ cards }: { cards: HubCard[] }) {
  if (cards.length === 0) {
    return <EmptyState compact title={PLAYER_CARDS_EMPTY} />;
  }
  return (
    <ul>
      {cards.map((card) => (
        <li key={card.id} className="border-b border-zinc-200 py-3 last:border-b-0 dark:border-white/10">
          <div className="flex items-center gap-3">
            <Link href={card.href} className="shrink-0">
              <CardThumb
                card={{
                  playerName: card.playerName,
                  photoDataUrl: card.imageUrl,
                  accent: card.accent,
                }}
                className="h-14 w-11 rounded-lg"
              />
            </Link>
            <span className="min-w-0">
              <Link href={card.href} className="block truncate text-[15px] font-bold hover:underline">
                {card.detail || card.playerName}
              </Link>
              <Link href={card.ownerHref} className="block truncate text-sm text-zinc-500 hover:underline">
                {card.ownerName}
              </Link>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SaleList({ sales }: { sales: HubSale[] }) {
  if (sales.length === 0) {
    return <EmptyState compact title={PLAYER_SALES_EMPTY} />;
  }
  return (
    <ul>
      {sales.map((sale) => (
        <li
          key={sale.key}
          className="flex items-baseline justify-between gap-3 border-b border-zinc-200 py-2 last:border-b-0 dark:border-white/10"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold tabular-nums">{sale.priceLabel}</span>
            <span className="block truncate text-xs text-zinc-500">{sale.grade}</span>
          </span>
          <span className="shrink-0 text-sm text-zinc-500">{sale.soldLabel}</span>
        </li>
      ))}
    </ul>
  );
}

function OwnerList({ owners }: { owners: HubOwner[] }) {
  if (owners.length === 0) {
    return <EmptyState compact title={PLAYER_OFFERS_EMPTY} />;
  }
  return (
    <ul>
      {owners.map((owner) => (
        <li key={owner.id} className="border-b border-zinc-200 last:border-b-0 dark:border-white/10">
          <Link href={owner.href} className="flex min-h-12 items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold">{owner.displayName}</span>
              <span className="block truncate text-sm text-zinc-500">@{owner.username}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {PLAYER_OFFERS_HEADING}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PlayerChoices({ name, choices }: { name: string; choices: PlayerChoice[] }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
      <p className="mt-2 text-sm text-zinc-500">This name is in more than one sport.</p>
      <ul className="mt-4">
        {choices.map((choice) => (
          <li key={choice.href} className="border-b border-zinc-200 dark:border-white/10">
            <Link href={choice.href} className="flex min-h-12 items-center justify-between py-2">
              <span className="font-semibold">{choice.sport}</span>
              <span className="text-sm text-zinc-500">{choice.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlayerHub({ page }: { page: PlayerPageData }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-500">{page.sport}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{page.name}</h1>
        </div>
        <ShareIconButton path={`/p/${page.slug}`} title={page.name} label="Share" />
      </div>
      <Section title={PLAYER_POSTS_HEADING}>
        <PostList posts={page.posts} />
      </Section>
      <Section title={PLAYER_CARDS_HEADING}>
        <CardList cards={page.cards} />
      </Section>
      <Section title={RECENT_SOLD_PRICES_LABEL}>
        <SaleList sales={page.sales} />
      </Section>
      {page.owners ? (
        <Section title={PLAYER_OFFERS_HEADING}>
          <OwnerList owners={page.owners} />
        </Section>
      ) : null}
    </div>
  );
}

export function PlayerHubError() {
  return (
    <EmptyState
      title="Couldn't load this player"
      detail="Try again in a moment."
    />
  );
}
