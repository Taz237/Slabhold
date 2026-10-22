"use client";

import { useMemo, useState } from "react";
import { outlineButton, solidButton } from "@/components/button-styles";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { createDeal } from "@/lib/deals/client";
import {
  dmPartnerIds,
  heldCards,
  MARK_SOLD_LABEL,
  priceDollarsToCents,
  type DealKind,
} from "@/lib/deals/state";
import type { SportsCard } from "@/lib/types";

export function DealSheet({
  onClose,
  fixedCard,
  fixedBuyerId,
}: {
  onClose: () => void;
  fixedCard?: SportsCard | null;
  fixedBuyerId?: string | null;
}) {
  const { user, messages, profiles } = useSocial();
  const { cards, reload } = useCollection();
  const [cardId, setCardId] = useState(fixedCard?.id ?? "");
  const [buyerId, setBuyerId] = useState(fixedBuyerId ?? "");
  const [kind, setKind] = useState<DealKind>("sale");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const partnerIds = useMemo(
    () => new Set(user ? dmPartnerIds(messages, user.id) : []),
    [messages, user],
  );
  const partners = useMemo(
    () => profiles.filter((profile) => partnerIds.has(profile.id) && profile.id !== user?.id),
    [partnerIds, profiles, user?.id],
  );
  const choices = fixedCard ? [fixedCard] : heldCards(cards);
  const buyerLocked = Boolean(fixedBuyerId);

  async function send() {
    if (!user || pending) return;
    const cents = priceDollarsToCents(price);
    if (cents === "invalid") {
      setError("Enter a price like 12.50, or leave it blank.");
      return;
    }
    const nextCard = cardId || fixedCard?.id || "";
    const nextBuyer = buyerLocked ? (fixedBuyerId ?? "") : buyerId;
    if (!nextCard) {
      setError("Pick a card you still hold.");
      return;
    }
    if (!nextBuyer || nextBuyer === user.id || !partnerIds.has(nextBuyer)) {
      setError("Pick someone you already message.");
      return;
    }
    setPending(true);
    const result = await createDeal({
      cardId: nextCard,
      buyerId: nextBuyer,
      kind,
      priceCents: cents,
    });
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    reload();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-sheet-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <h2 id="deal-sheet-title" className="text-lg font-bold">
          {MARK_SOLD_LABEL}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          They confirm before the card is marked sold. Nothing is charged.
        </p>
        <div className="mt-4 space-y-3">
          {fixedCard ? (
            <p className="text-sm font-medium">{fixedCard.playerName}</p>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-500">Card</span>
              <select
                value={cardId}
                onChange={(event) => setCardId(event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 dark:border-white/10"
              >
                <option value="">Choose a card</option>
                {choices.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.playerName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {buyerLocked ? (
            <p className="text-sm">
              With @{partners.find((profile) => profile.id === fixedBuyerId)?.username ?? "them"}
            </p>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-500">Person</span>
              <select
                value={buyerId}
                onChange={(event) => setBuyerId(event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 dark:border-white/10"
              >
                <option value="">Someone you message</option>
                {partners.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    @{profile.username}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            {(["sale", "trade"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={option === kind ? solidButton : outlineButton}
              >
                {option === "sale" ? "Sale" : "Trade"}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-500">Price (optional)</span>
            <input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 dark:border-white/10"
            />
          </label>
          {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={outlineButton}>
              Close
            </button>
            <button type="button" disabled={pending} onClick={() => void send()} className={solidButton}>
              {pending ? "Sending" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
