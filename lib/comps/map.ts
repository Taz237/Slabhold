import type { CompListing } from "@/lib/types";
import type { ValuePoint } from "@/lib/value-history";
import type { CleanedSale } from "./types";

export function cleanedToCompListings(sales: CleanedSale[]): CompListing[] {
  return sales
    .filter((sale) => sale.itemId !== "__empty__" && sale.price > 0)
    .map((sale) => {
      const condition = [sale.grader, sale.grade].filter(Boolean).join(" ") || "—";
      return {
        id: `${sale.itemId}-${sale.soldAt}`,
        itemId: sale.itemId,
        title: sale.title || condition,
        soldPrice: sale.price,
        soldDate: sale.soldAt.slice(0, 10),
        platform: "eBay" as const,
        condition,
        shipping: null,
        url: sale.url,
      };
    })
    .sort((a, b) => b.soldDate.localeCompare(a.soldDate));
}

/** Chronological sale prices (no averaging) for chart scatter/line. */
export function historyFromSales(sales: CleanedSale[], days = 90): ValuePoint[] {
  const cutoff = Date.now() - days * 86_400_000;
  return sales
    .filter((sale) => sale.itemId !== "__empty__" && sale.price > 0)
    .map((sale) => {
      const date = sale.soldAt.slice(0, 10);
      const t = new Date(`${date}T12:00:00Z`).getTime();
      return { sale, date, t };
    })
    .filter(({ t }) => !Number.isNaN(t) && t >= cutoff)
    .sort((a, b) => a.t - b.t)
    .map(({ sale, date }) => ({
      date,
      label: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      value: Math.round(sale.price),
    }));
}
