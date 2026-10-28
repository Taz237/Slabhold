"use client";

import { CardTile } from "@/components/card-tile";
import { EbaySoldLink } from "@/components/ebay-sold-link";
import { OpenToOffersBadge } from "@/components/open-to-offers";
import { GRID_CLASS, tileAccessibleName } from "@/lib/collection/grid";
import type { PublicCard } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { resolvePriceRead, tilePriceText } from "@/lib/value/price-fallback";
import type { CardValueResult } from "@/lib/value/types";

/** Profile Cards tab: the Collection slab tiles, linking to the profile card page. */
export function ProfileCardGrid({
  cards,
  username,
  values,
}: {
  cards: readonly PublicCard[];
  username: string;
  values: Map<string, CardValueResult>;
}) {
  return (
    <ul className={GRID_CLASS}>
      {cards.map((card, index) => {
        const stored = values.get(card.id);
        const ebayHref = ebaySoldSearchUrlForCard(card);
        const priceRead = resolvePriceRead({
          value: stored,
          createdAt: card.createdAt ?? null,
          similar: stored?.similar,
          ebayHref,
          card,
        });
        const priceText = tilePriceText(priceRead, true);
        return (
          <CardTile
            key={card.id}
            card={card}
            href={`${userHref(username)}/cards/${encodeURIComponent(card.id)}`}
            index={index}
            ariaLabel={tileAccessibleName(card, priceText)}
            priceLabel={priceText}
            badge={card.openToOffers === true ? <OpenToOffersBadge className="mb-1" /> : null}
          >
            {priceRead.showEbaySold && ebayHref ? (
              <p className="px-1.5 pt-0.5 text-xs text-zinc-500">
                <EbaySoldLink href={ebayHref} />
              </p>
            ) : null}
          </CardTile>
        );
      })}
    </ul>
  );
}
