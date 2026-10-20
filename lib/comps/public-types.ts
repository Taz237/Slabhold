import { centsToDollars } from "@/lib/comps/stats";
import { money } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";

/** Stored sold rows have no marketplace column. The comps list already calls them eBay. */
export const STORED_SALE_SOURCE = "eBay";

export const NOT_ENOUGH_RECENT_SALES = "Not enough recent sales yet";

export const SAMPLE_COMPS_LABEL = "Sample data, not real sales";

/** Same sentence the signed-in comps section already shows. */
export const TRAWL_SOURCE_CREDIT =
  "Sold data via Trawl (third-party, not affiliated with eBay)";

export type PublicCompsStatus =
  | "ok"
  | "no_sales"
  | "stale"
  | "unavailable"
  | "sample"
  | "hidden";

/** One stored sale a signed-out visitor may see. No listing, seller, or owner fields. */
export type PublicCompSale = {
  priceCents: number;
  soldAt: string;
  grade: string;
  source: string;
};

export type PublicCardComps = {
  sales: PublicCompSale[];
  medianCents: number | null;
  p25Cents: number | null;
  p75Cents: number | null;
  nSales: number;
  matchedAt: string | null;
  status: PublicCompsStatus;
};

export type PublicCompsVerdict =
  | { kind: "hidden" }
  | { kind: "sample"; label: string }
  | {
      kind: "range";
      fair: string;
      typical: string;
      basis: string;
      credit: string;
    }
  | { kind: "insufficient"; label: string; credit: string | null };

export function hiddenPublicComps(): PublicCardComps {
  return {
    sales: [],
    medianCents: null,
    p25Cents: null,
    p75Cents: null,
    nSales: 0,
    matchedAt: null,
    status: "hidden",
  };
}

export function blankPublicComps(status: PublicCompsStatus): PublicCardComps {
  return {
    sales: [],
    medianCents: null,
    p25Cents: null,
    p75Cents: null,
    nSales: 0,
    matchedAt: null,
    status,
  };
}

function integerCents(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Fair-price copy for a stored card_values row. Sample data is never worded as real sales. */
export function publicCompsVerdict(comps: PublicCardComps): PublicCompsVerdict {
  if (comps.status === "hidden") return { kind: "hidden" };
  if (comps.status === "sample") return { kind: "sample", label: SAMPLE_COMPS_LABEL };

  if (
    comps.status === "ok" &&
    comps.nSales >= 3 &&
    integerCents(comps.p25Cents) &&
    integerCents(comps.p75Cents) &&
    integerCents(comps.medianCents)
  ) {
    const updated = comps.matchedAt ? formatRelativeTime(comps.matchedAt) : "";
    return {
      kind: "range",
      fair: `Fair price: ${money(centsToDollars(comps.p25Cents))} to ${money(centsToDollars(comps.p75Cents))}`,
      typical: `Typical: ${money(centsToDollars(comps.medianCents))}`,
      basis: updated
        ? `Based on ${comps.nSales} recent sales · updated ${updated}`
        : `Based on ${comps.nSales} recent sales`,
      credit: TRAWL_SOURCE_CREDIT,
    };
  }

  return {
    kind: "insufficient",
    label: NOT_ENOUGH_RECENT_SALES,
    credit: comps.sales.length > 0 ? TRAWL_SOURCE_CREDIT : null,
  };
}
