"use client";

import { useEffect, useState } from "react";
import { DealActionButtons } from "@/components/deal-actions";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { cancelDeal, listMyDeals, respondDeal } from "@/lib/deals/client";
import {
  addCardHref,
  dealActions,
  dealIdFromMetadata,
  formatPriceCents,
  prefillFromMetadata,
  type Deal,
} from "@/lib/deals/state";

function usePartyDeals(partnerId?: string | null) {
  const { user } = useSocial();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void listMyDeals().then((result) => {
      if (cancelled || "error" in result) return;
      setDeals(result.deals);
    });
    return () => {
      cancelled = true;
    };
  }, [user, version, partnerId]);

  return {
    deals: partnerId
      ? deals.filter((deal) => deal.sellerId === partnerId || deal.buyerId === partnerId)
      : deals,
    refresh: () => setVersion((value) => value + 1),
  };
}

export function DealConfirmActions({ metadata }: { metadata: unknown }) {
  const dealId = dealIdFromMetadata(metadata);
  const prefill = prefillFromMetadata(metadata);
  const { user } = useSocial();
  const { reload } = useCollection();
  const { deals, refresh } = usePartyDeals();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deal = deals.find((row) => row.id === dealId) ?? null;
  if (!dealId || !user || !deal) return null;
  const activeId = deal.id;
  const actions = dealActions(deal, user.id);
  const price = formatPriceCents(deal.priceCents);

  async function run(decision: "confirmed" | "declined") {
    setPending(true);
    const result = await respondDeal(activeId, decision);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    reload();
    refresh();
  }

  return (
    <div className="mt-2 space-y-2 pl-12">
      {price && deal?.kind === "sale" ? <p className="text-sm text-zinc-500">{price}</p> : null}
      {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
      <DealActionButtons
        actions={actions}
        pending={pending}
        addHref={prefill ? addCardHref(prefill) : null}
        onConfirm={() => void run("confirmed")}
        onDecline={() => void run("declined")}
      />
    </div>
  );
}

export function DealThreadPanel({ partnerId }: { partnerId: string }) {
  const { user, notifications } = useSocial();
  const { reload } = useCollection();
  const { deals, refresh } = usePartyDeals(partnerId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visible = deals.filter((deal) => deal.status === "pending" || deal.status === "confirmed");
  if (!user || visible.length === 0) return null;

  async function respond(deal: Deal, decision: "confirmed" | "declined") {
    setPendingId(deal.id);
    const result = await respondDeal(deal.id, decision);
    setPendingId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    reload();
    refresh();
  }

  async function cancel(deal: Deal) {
    setPendingId(deal.id);
    const result = await cancelDeal(deal.id);
    setPendingId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    refresh();
  }

  return (
    <div className="space-y-2 border-b border-zinc-200 px-4 py-2 dark:border-white/10">
      {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
      {visible.map((deal) => {
        const note = notifications.find((item) => dealIdFromMetadata(item.metadata) === deal.id);
        const prefill = prefillFromMetadata(note?.metadata);
        const actions = dealActions(deal, user.id);
        const price = formatPriceCents(deal.priceCents);
        return (
          <div key={deal.id} className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              {deal.kind === "trade" ? "Trade" : "Sale"}
              {price ? ` · ${price}` : ""}
              {deal.status === "confirmed" ? " · Confirmed" : " · Waiting"}
            </p>
            <DealActionButtons
              actions={actions}
              pending={pendingId === deal.id}
              addHref={prefill ? addCardHref(prefill) : "/cards/new"}
              onConfirm={() => void respond(deal, "confirmed")}
              onDecline={() => void respond(deal, "declined")}
              onCancel={() => void cancel(deal)}
            />
          </div>
        );
      })}
    </div>
  );
}
