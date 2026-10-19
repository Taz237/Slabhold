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

export type CompFlagToast =
  | { kind: "hidden"; itemId: string; cardId: string }
  | { kind: "restored"; cardId: string };

const TOAST_MS = 8000;

type Scope = {
  cardId: string;
  hidden: HiddenSale[];
  restored: CompListing[];
  priced: CardValueResult | null;
};

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

function emptyScope(cardId: string): Scope {
  return { cardId, hidden: [], restored: [], priced: null };
}

export function useCompFlagState(
  cardId: string | null,
  canFlag: boolean,
  comps: CompListing[],
) {
  const [scope, setScope] = useState<Scope | null>(null);
  const [toast, setToast] = useState<CompFlagToast | null>(null);
  const active = canFlag && cardId && scope?.cardId === cardId ? scope : null;
  const scopeRef = useRef<Scope>(emptyScope(cardId ?? ""));
  const compsRef = useRef(comps);

  useEffect(() => {
    scopeRef.current = active ?? emptyScope(cardId ?? "");
  }, [active, cardId]);

  useEffect(() => {
    compsRef.current = comps;
  }, [comps]);

  useEffect(() => {
    if (!canFlag || !cardId) return;
    let cancelled = false;
    fetch(`/api/comps/flags?cardId=${encodeURIComponent(cardId)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { sales?: HiddenSale[] };
      })
      .then((body) => {
        if (cancelled || !body?.sales) return;
        const sales = body.sales;
        setScope((current) => ({
          cardId,
          hidden: sales,
          restored: current?.cardId === cardId ? current.restored : [],
          priced: current?.cardId === cardId ? current.priced : null,
        }));
      })
      .catch(() => {
        /* the list still works without the disclosure */
      });
    return () => {
      cancelled = true;
    };
  }, [canFlag, cardId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const hidden = active?.hidden ?? [];
  const restored = active?.restored ?? [];
  const hiddenIds = new Set(hidden.map((sale) => sale.itemId));
  const visible = catalogOf(comps, hidden, restored).filter((comp) => !hiddenIds.has(comp.itemId));
  const shownToast = toast && cardId && toast.cardId === cardId ? toast : null;

  async function flag(comp: CompListing, reason: FlagReason): Promise<boolean> {
    if (!canFlag || !cardId) return false;
    const prev = scopeRef.current.cardId === cardId ? scopeRef.current : emptyScope(cardId);
    const nextHidden = [
      ...prev.hidden.filter((sale) => sale.itemId !== comp.itemId),
      hiddenFromComp(comp, reason),
    ];
    const nextRestored = prev.restored.filter((item) => item.itemId !== comp.itemId);
    const next: Scope = {
      cardId,
      hidden: nextHidden,
      restored: nextRestored,
      priced: pricedFrom(compsRef.current, nextHidden, nextRestored, prev.priced),
    };
    scopeRef.current = next;
    setScope(next);

    const res = await fetch("/api/comps/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, itemId: comp.itemId, reason }),
    });
    if (!res.ok) {
      scopeRef.current = prev;
      setScope(prev);
      return false;
    }
    const body = (await res.json()) as { value?: CardValueResult };
    if (body.value) {
      const priced = { ...body.value, matchedAt: body.value.matchedAt ?? null };
      const withPrice = { ...scopeRef.current, priced };
      scopeRef.current = withPrice;
      setScope(withPrice);
    }
    setToast({ kind: "hidden", itemId: comp.itemId, cardId });
    return true;
  }

  async function restore(itemId: string): Promise<boolean> {
    if (!canFlag || !cardId) return false;
    const prev = scopeRef.current.cardId === cardId ? scopeRef.current : emptyScope(cardId);
    const sale = prev.hidden.find((item) => item.itemId === itemId);
    const nextHidden = prev.hidden.filter((item) => item.itemId !== itemId);
    const nextRestored =
      sale && !compsRef.current.some((comp) => comp.itemId === itemId)
        ? [...prev.restored.filter((comp) => comp.itemId !== itemId), listingFromHidden(sale)]
        : prev.restored;
    const next: Scope = {
      cardId,
      hidden: nextHidden,
      restored: nextRestored,
      priced: pricedFrom(compsRef.current, nextHidden, nextRestored, prev.priced),
    };
    scopeRef.current = next;
    setScope(next);
    setToast((current) =>
      current?.kind === "hidden" && current.itemId === itemId ? null : current,
    );

    const res = await fetch("/api/comps/flags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, itemId }),
    });
    if (!res.ok) {
      scopeRef.current = prev;
      setScope(prev);
      return false;
    }
    const body = (await res.json()) as { value?: CardValueResult };
    if (body.value) {
      const priced = { ...body.value, matchedAt: body.value.matchedAt ?? null };
      const withPrice = { ...scopeRef.current, priced };
      scopeRef.current = withPrice;
      setScope(withPrice);
    }
    setToast({ kind: "restored", cardId });
    return true;
  }

  return {
    visible,
    hidden: canFlag ? hidden : [],
    priced: active?.priced ?? null,
    toast: shownToast,
    flag,
    restore,
    undo: () => {
      if (shownToast?.kind === "hidden") void restore(shownToast.itemId);
    },
  };
}
