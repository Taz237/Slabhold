"use client";

import { useEffect, useRef, useState } from "react";
import { screenValueFromComps } from "@/lib/comps/shared-value";
import type { FlagReason } from "@/lib/comps/flag-reasons";
import type { CompListing } from "@/lib/types";
import type { CardValueResult, CardValueStatus } from "@/lib/value/types";

export type HiddenSale = {
  itemId: string;
  title: string;
  price: number | null;
  soldAt: string | null;
  reason: string | null;
  url: string | null;
};

const TOAST_MS = 8000;

function listingFromHidden(sale: HiddenSale): CompListing {
  return {
    id: sale.itemId,
    itemId: sale.itemId,
    title: sale.title || "Sale",
    soldPrice: sale.price ?? 0,
    soldDate: (sale.soldAt ?? "").slice(0, 10),
    platform: "eBay",
    condition: "—",
    shipping: null,
    url: sale.url ?? "",
  };
}

function catalogOf(
  comps: CompListing[],
  hidden: HiddenSale[],
  restored: CompListing[],
): CompListing[] {
  const byId = new Map<string, CompListing>();
  for (const comp of comps) byId.set(comp.itemId, comp);
  for (const comp of restored) {
    if (!byId.has(comp.itemId)) byId.set(comp.itemId, comp);
  }
  for (const sale of hidden) {
    if (!byId.has(sale.itemId)) byId.set(sale.itemId, listingFromHidden(sale));
  }
  return [...byId.values()];
}

function pricedFrom(
  comps: CompListing[],
  hidden: HiddenSale[],
  restored: CompListing[],
  previous: CardValueResult | null,
): CardValueResult {
  const hiddenIds = new Set(hidden.map((sale) => sale.itemId));
  const priced = screenValueFromComps(catalogOf(comps, hidden, restored), hiddenIds);
  const status: CardValueStatus =
    previous?.status === "sample"
      ? "sample"
      : priced.count > 0
        ? "ok"
        : "no_sales";
  return {
    status,
    median: priced.median,
    low: priced.low,
    high: priced.high,
    nSales: priced.count,
    matchedAt: previous?.matchedAt ?? null,
  };
}

function hiddenFromComp(comp: CompListing, reason: FlagReason): HiddenSale {
  return {
    itemId: comp.itemId,
    title: comp.title || "Sale",
    price: comp.soldPrice,
    soldAt: comp.soldDate,
    reason,
    url: comp.url || null,
  };
}

export function useCompFlagState(
  cardId: string | null,
  canFlag: boolean,
  comps: CompListing[],
) {
  const [hidden, setHidden] = useState<HiddenSale[]>([]);
  const [restored, setRestored] = useState<CompListing[]>([]);
  const [priced, setPriced] = useState<CardValueResult | null>(null);
  const [toastItemId, setToastItemId] = useState<string | null>(null);
  const compsRef = useRef(comps);
  compsRef.current = comps;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const restoredRef = useRef(restored);
  restoredRef.current = restored;
  const pricedRef = useRef(priced);
  pricedRef.current = priced;

  useEffect(() => {
    if (!canFlag || !cardId) {
      setHidden([]);
      setRestored([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/comps/flags?cardId=${encodeURIComponent(cardId)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { sales?: HiddenSale[] };
      })
      .then((body) => {
        if (cancelled || !body?.sales) return;
        setHidden(body.sales);
      })
      .catch(() => {
        /* the list still works without the disclosure */
      });
    return () => {
      cancelled = true;
    };
  }, [canFlag, cardId]);

  useEffect(() => {
    if (!toastItemId) return;
    const timer = window.setTimeout(() => setToastItemId(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toastItemId]);

  const hiddenIds = new Set(hidden.map((sale) => sale.itemId));
  const visible = catalogOf(comps, hidden, restored).filter((comp) => !hiddenIds.has(comp.itemId));

  async function flag(comp: CompListing, reason: FlagReason): Promise<boolean> {
    if (!canFlag || !cardId) return false;
    const prevHidden = hiddenRef.current;
    const prevRestored = restoredRef.current;
    const prevPriced = pricedRef.current;
    const nextHidden = [
      ...prevHidden.filter((sale) => sale.itemId !== comp.itemId),
      hiddenFromComp(comp, reason),
    ];
    const nextRestored = prevRestored.filter((item) => item.itemId !== comp.itemId);
    setHidden(nextHidden);
    setRestored(nextRestored);
    setPriced(pricedFrom(compsRef.current, nextHidden, nextRestored, prevPriced));

    const res = await fetch("/api/comps/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, itemId: comp.itemId, reason }),
    });
    if (!res.ok) {
      setHidden(prevHidden);
      setRestored(prevRestored);
      setPriced(prevPriced);
      return false;
    }
    const body = (await res.json()) as { value?: CardValueResult };
    if (body.value) setPriced({ ...body.value, matchedAt: body.value.matchedAt ?? null });
    setToastItemId(comp.itemId);
    return true;
  }

  async function restore(itemId: string): Promise<boolean> {
    if (!canFlag || !cardId) return false;
    const prevHidden = hiddenRef.current;
    const prevRestored = restoredRef.current;
    const prevPriced = pricedRef.current;
    const sale = prevHidden.find((item) => item.itemId === itemId);
    const nextHidden = prevHidden.filter((item) => item.itemId !== itemId);
    const nextRestored =
      sale && !compsRef.current.some((comp) => comp.itemId === itemId)
        ? [...prevRestored.filter((comp) => comp.itemId !== itemId), listingFromHidden(sale)]
        : prevRestored;
    setHidden(nextHidden);
    setRestored(nextRestored);
    setPriced(pricedFrom(compsRef.current, nextHidden, nextRestored, prevPriced));
    setToastItemId((current) => (current === itemId ? null : current));

    const res = await fetch("/api/comps/flags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, itemId }),
    });
    if (!res.ok) {
      setHidden(prevHidden);
      setRestored(prevRestored);
      setPriced(prevPriced);
      return false;
    }
    const body = (await res.json()) as { value?: CardValueResult };
    if (body.value) setPriced({ ...body.value, matchedAt: body.value.matchedAt ?? null });
    return true;
  }

  return {
    visible,
    hidden: canFlag ? hidden : [],
    priced,
    toastItemId,
    flag,
    restore,
    undo: () => {
      if (toastItemId) void restore(toastItemId);
    },
  };
}
