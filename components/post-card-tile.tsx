"use client";

import { CardTile } from "@/components/card-tile";
import { EbaySoldLink } from "@/components/ebay-sold-link";
import { EAGER_TILES, tileAccessibleName } from "@/lib/collection/grid";
import type { PublicCard } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";

/** Your own card opens its card page. Anyone else's opens their profile card. */
export function postCardHref({
  cardId,
  username,
  owned,
}: {
  cardId: string;
  username: string;
  owned: boolean;
}): string {
  return owned ? `/cards/${cardId}` : `${userHref(username)}/cards/${encodeURIComponent(cardId)}`;
}

/** Centered at 60% with a cap, so the card reads without taking over the feed. */
const POST_TILE_FRAME = "isolate mx-auto mt-3 w-[60%] max-w-[260px]";

/** The card on a post: a Collection slab tile, centered, so it doesn't take over the feed. */
export function PostCardTile({
  card,
  href,
  priceText,
  soldHref,
  eager = false,
}: {
  card: PublicCard;
  href: string;
  /** "…" while the value loads. */
  priceText: string | null;
  soldHref: string | null;
  /** On the first screen: drawn from the server HTML and fetched at once. */
  eager?: boolean;
}) {
  const pending = priceText === "…";
  const label = pending ? null : priceText;
  return (
    <CardTile
      as="div"
      card={card}
      href={href}
      // Feed tiles load lazily, except a first-screen one.
      index={eager ? 0 : EAGER_TILES}
      prefetch={false}
      sizes="260px"
      // A raw card fits its photo, with no empty band above it.
      artFit="hug"
      ariaLabel={tileAccessibleName(card, label)}
      priceLabel={label}
      pricePending={pending}
      className={POST_TILE_FRAME}
    >
      {soldHref ? (
        <p className="px-1.5 pt-0.5 text-xs text-zinc-500">
          <EbaySoldLink href={soldHref} />
        </p>
      ) : null}
    </CardTile>
  );
}
