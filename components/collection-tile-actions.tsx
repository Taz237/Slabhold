"use client";

import Link from "next/link";
import { ArrowLeftRight, Pencil } from "lucide-react";
import { CardShareButton } from "@/components/card-share";
import { CollectionSheet } from "@/components/collection-sheet";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { cardCategory, categoryLabel } from "@/lib/card-category";
import { cardTitle, isSold } from "@/lib/format";
import { publicTogglePatch } from "@/lib/offers/open-to-offers";
import type { SportsCard } from "@/lib/types";

const row =
  "tap inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-zinc-300 px-5 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-white/20 dark:text-zinc-100";

/**
 * A tile's quick actions, from a long press: share the card, move it between
 * Flipping and Personal, or edit it. Each one is the card page's own action;
 * nothing here is new.
 */
export function CollectionTileActions({ card, onClose }: { card: SportsCard; onClose: () => void }) {
  const { user } = useSocial();
  const { updateCard } = useCollection();
  const other = cardCategory(card) === "pc" ? "flipping" : "pc";

  return (
    <CollectionSheet title={card.playerName} detail={cardTitle(card)} onClose={onClose}>
      <div className="flex flex-col items-stretch gap-2 pb-1 [&>*]:max-w-none">
        <CardShareButton
          card={card}
          username={user?.username}
          variant="row"
          onTogglePublic={(next) => updateCard(card.id, publicTogglePatch(card, next))}
        />
        {isSold(card) ? null : (
          <button
            type="button"
            className={row}
            onClick={() => {
              // A failed save puts the card back; the Collection's own error line says so.
              void updateCard(card.id, { category: other }).saved.catch(() => {});
              onClose();
            }}
          >
            <ArrowLeftRight aria-hidden className="h-4 w-4" />
            Move to {categoryLabel(other)}
          </button>
        )}
        <Link href={`/cards/${card.id}/edit`} className={row} onClick={onClose}>
          <Pencil aria-hidden className="h-4 w-4" />
          Edit card
        </Link>
      </div>
    </CollectionSheet>
  );
}
