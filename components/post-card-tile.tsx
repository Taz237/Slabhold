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

/** The card on a post: a Collection slab tile, centered, so it doesn't take over the feed. */
export function PostCardTile({
  card,
  href,
  priceText,
  soldHref,
}: {
  card: PublicCard;
  href: string;
  /** "…" while the value loads. */
  priceText: string | null;
  soldHref: string | null;
}) {
  const pending = priceText === "…";
  const label = pending ? null : priceText;
  return (
    <CardTile
      as="div"
      card={card}
      href={href}
      // Feed tiles load lazily.
      index={EAGER_TILES}
      sizes="260px"
      ariaLabel={tileAccessibleName(card, label)}
      priceLabel={label}
      pricePending={pending}
      className="mx-auto mt-3 w-[60%] max-w-[260px]"
    >
      {soldHref ? (
        <p className="px-1.5 pt-0.5 text-xs text-zinc-500">
          <EbaySoldLink href={soldHref} />
        </p>
      ) : null}
    </CardTile>
  );
}
