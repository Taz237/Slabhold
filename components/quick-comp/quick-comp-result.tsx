"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { solidButton } from "@/components/button-styles";
import { LazyCompsList } from "@/components/card-page-parts";
import { CompCardSkeleton, CompEmpty, compCard, compLabel } from "@/components/comp-basis";
import type { SalesChart as SalesChartType } from "@/components/sales-chart";
import { TREND_MIN_SALES, shortAgo } from "@/components/sales-chart";
import type { CatalogCard } from "@/lib/card-catalog";
import { salesFromComps, splitOutliers } from "@/lib/chart/sales";
import { money } from "@/lib/format";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { SavedPayload } from "@/lib/quick-comp/recent";
import { quickCompStats, saleSpan, trustLine } from "@/lib/quick-comp/stats";
import { catalogAddHref, catalogResultLine } from "@/lib/search/catalog-results";
import { StatRowSkeleton } from "./quick-comp-states";
import { feedback, focusRing, sectionLabel, textMuted, textSecondary } from "./tokens";

export const QUICK_COMP_EMPTY_TITLE = "No recent sold prices for this card and grade";

/** "2023-24 Panini Prizm #136 Base · PSA 10". */
export function identityLine(identity: QuickCompIdentity): string {
  const line = catalogResultLine({
    yearLabel: identity.yearLabel,
    setBrand: identity.setBrand,
    cardNumber: identity.cardNumber,
    parallel: identity.parallel,
  });
  return [line, identity.grade].filter(Boolean).join(" · ");
}

/**
 * Add card for this card: the catalog fields for a pick, the typed text for a
 * manual entry. /cards/new clips q itself (addCardQuery), and the fields here
 * are already clipped by the form.
 */
export function addToCollectionHref(identity: QuickCompIdentity, catalog: CatalogCard | null): string {
  if (catalog) return catalogAddHref(catalog);
  const text = [identity.yearLabel, identity.setBrand, identity.playerName, identity.cardNumber ? `#${identity.cardNumber}` : ""]
    .filter(Boolean)
    .join(" ");
  return `/cards/new?q=${encodeURIComponent(text)}`;
}

function StatRow({ comps }: { comps: SavedPayload["comps"] }) {
  const stats = quickCompStats(comps);
  if (!stats) return null;
  const cells = [
    { label: "Avg", value: stats.avg },
    // Not "High"/"Low": the range bar above already uses those for the middle half.
    { label: "Highest", value: stats.high },
    { label: "Lowest", value: stats.low },
  ];
  return (
    <dl data-quick-comp-stats="" className={`grid grid-cols-3 divide-x divide-zinc-950/5 py-3 dark:divide-white/[0.06] ${compCard}`}>
      {cells.map((cell) => (
        <div key={cell.label} className="flex h-10 flex-col justify-between px-3 first:pl-0 last:pr-0">
          <dt className={`text-xs leading-4 ${textMuted}`}>{cell.label}</dt>
          <dd className="text-[15px] leading-5 font-medium tabular-nums">{money(cell.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The one trust line: how many sales and over what days, and Low confidence
 * under 5. The count is left off when the chart caption already says it.
 */
export function TrustLine({ payload }: { payload: SavedPayload }) {
  const sales = salesFromComps(payload.comps);
  const chartShowsCount = splitOutliers(sales).inliers.length >= TREND_MIN_SALES;
  const text = chartShowsCount
    ? saleSpan(payload.comps.map((comp) => comp.soldDate))
    : trustLine(payload.comps);
  // The server's own call (count 1–4), so the shared match module ships nothing new.
  const low = payload.lowConfidence && payload.comps.length > 0;
  if (!text && !low && !payload.sample) return null;
  return (
    <p data-quick-comp-trust="" className={`flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs leading-5 tabular-nums ${textSecondary}`}>
      {text ? <span>{chartShowsCount ? `Sold ${text}` : text}</span> : null}
      {low ? (
        <span className="rounded-md bg-amber-500/15 px-1.5 font-sans text-[11px] leading-5 font-medium text-amber-800 dark:text-amber-200">
          Low confidence
        </span>
      ) : null}
      {payload.sample ? <span className={`font-sans ${textMuted}`}>Sample prices, not real sales</span> : null}
    </p>
  );
}

export function QuickCompResult({
  identity,
  catalog,
  payload,
  Chart,
  savedAt = null,
  onRefresh,
  alternatives = [],
  onAlternative,
  selectedSaleId = null,
  onSelectSale,
}: {
  identity: QuickCompIdentity;
  catalog: CatalogCard | null;
  payload: SavedPayload;
  /** The #157 comp card, loaded on its own. Null while its chunk loads. */
  Chart: typeof SalesChartType | null;
  /** Set when this comp opened from the device's saved list. */
  savedAt?: string | null;
  onRefresh?: () => void;
  alternatives?: CatalogCard[];
  onAlternative?: (card: CatalogCard) => void;
  selectedSaleId?: string | null;
  onSelectSale?: (id: string | null) => void;
}) {
  const sales = salesFromComps(payload.comps);
  const empty = payload.comps.length === 0 || payload.median == null;
  const ago = savedAt ? shortAgo(savedAt) : "";

  return (
    <div data-quick-comp-state={empty ? "empty" : "result"} className="flex flex-col gap-3">
      {savedAt ? (
        <div className={`flex min-h-11 items-center justify-between gap-3 text-[13px] ${textMuted}`}>
          <span>{ago ? `Saved ${ago}` : "Saved on this device"}</span>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className={`-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 font-medium text-zinc-900 hover:bg-zinc-950/5 dark:text-zinc-100 dark:hover:bg-white/5 ${feedback} ${focusRing}`}
            >
              <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} className={textMuted} />
              Refresh
            </button>
          ) : null}
        </div>
      ) : null}

      {empty ? (
        <CompEmpty
          title={QUICK_COMP_EMPTY_TITLE}
          caption="Try another grade, or check the set and number"
          slot="quick-comp-empty"
        />
      ) : Chart ? (
        <Chart
          card={{ id: `quick-comp-${identity.playerName}`, estimatedSellPrice: 0, purchasePrice: 0 }}
          sales={sales}
          selectedSaleId={selectedSaleId}
          onSelectSale={onSelectSale}
          fetchedAt={null}
          source={payload.source}
          median={payload.median}
          p25={payload.p25}
          p75={payload.p75}
          count={payload.count}
          sample={payload.sample}
          lockedToComps
          lowConfidence={false}
          heading="Recent sales"
          stableLayout
        />
      ) : (
        // The chart's chunk is still loading: the same shapes, never $0.
        <CompCardSkeleton />
      )}

      {empty ? null : Chart ? <StatRow comps={payload.comps} /> : <StatRowSkeleton />}
      {empty ? null : <TrustLine payload={payload} />}

      {alternatives.length > 0 && onAlternative ? (
        <section aria-labelledby="quick-comp-alternatives" className="mt-1">
          <h2 id="quick-comp-alternatives" className={sectionLabel}>
            Or did you mean
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {alternatives.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => onAlternative(card)}
                  className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[13px] leading-5 ring-1 ring-zinc-950/10 hover:bg-zinc-950/[0.03] dark:ring-white/10 dark:hover:bg-white/[0.04] ${feedback} ${focusRing}`}
                >
                  <span className="shrink-0 font-medium">{card.playerName}</span>
                  <span className={`min-w-0 truncate ${textMuted}`}>{catalogResultLine(card)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {empty ? null : (
        <section aria-labelledby="quick-comp-sales" className={compCard}>
          <h2 id="quick-comp-sales" className={`flex h-5 items-center ${compLabel}`}>
            Sales behind this price
          </h2>
          <LazyCompsList
            comps={payload.comps}
            canFlag={false}
            selectedId={selectedSaleId}
            onSelect={onSelectSale}
          />
        </section>
      )}

      <Link
        href={addToCollectionHref(identity, catalog)}
        data-quick-comp-add=""
        className={`mt-1 w-full ${solidButton} ${focusRing}`}
      >
        Add to collection
      </Link>
    </div>
  );
}
