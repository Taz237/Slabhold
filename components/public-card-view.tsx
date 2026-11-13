"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { useCompFlagState } from "@/components/use-comp-flags";
import { ArrowLeft } from "lucide-react";
import { LazyPlayerNameLink } from "@/components/player-name-lazy";
import { LazyCardCollectorsSaying } from "@/components/card-talk-frame";
import { LazyCompsList, preloadCompsList } from "@/components/card-page-parts";
import { OpenToOffersBadge } from "@/components/open-to-offers";
import { EbaySoldLine, PriceFallbackText, SimilarCardsLine } from "@/components/price-readout";
import { WantButton } from "@/components/want-button";
import { outlineButton } from "@/components/button-styles";
import { ShapedCardThumb } from "@/components/card-thumb";
import {
  CompEmpty,
  CompRowsSkeleton,
  compCaption,
  compCard,
  compEyebrow,
  compHeroValue,
  compLabel,
  compSectionValue,
  compTile,
} from "@/components/comp-basis";
import { PublicCardCompsPreview } from "@/components/public-card-comps";
import { PublicCardSkeleton } from "@/components/public-card-skeleton";
import { useCollection } from "@/components/collection-provider";
import { SoldFreshness } from "@/components/sold-freshness";
import { useSocial } from "@/components/social-provider";
import { SalesChartPending } from "@/components/card-detail-shell";
import { useChartSales } from "@/lib/chart/use-chart-sales";
import type { ChartSale } from "@/lib/chart/sales";
import { isCardOwner } from "@/lib/comps/ownership";
import { messageOwnerHref, showOpenToOffersBadge } from "@/lib/offers/open-to-offers";
import { userHref } from "@/lib/social/user-href";
import { basedOnSalesLabel, countForSalesLabel, valueFromShownSales } from "@/lib/comps/shared-value";
import { soldNotice, soldNoticeTitle } from "@/lib/comps/sold-response";
import { useSoldComps } from "@/lib/comps/use-sold-comps";
import { canonicalParallelName } from "@/lib/cards/parallels";
import { cardTitle } from "@/lib/format";
import {
  hiddenPublicComps,
  type PublicCardComps,
} from "@/lib/comps/public-types";
import type { PublicCardOwner } from "@/lib/social/missing-record";
import type { OwnedCard, PublicCard } from "@/lib/social/types";
import {
  cardValueHasAmount,
  isLowConfidenceValue,
  shownCardValue,
} from "@/lib/value/format";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { shouldCollapseEmptyPrices } from "@/lib/value/empty-price";
import {
  NO_SALES_FOUND_LABEL,
  resolvePriceRead,
  SIMILAR_CARDS_LABEL,
} from "@/lib/value/price-fallback";
import { useCardValue } from "@/lib/value/use-card-values";
import { usePublicCards } from "@/lib/social/use-public-cards";
import { useProfiles } from "@/lib/social/use-profiles";
import { ReadRetry } from "@/components/read-retry";
import { TeamBadge } from "@/components/team-badge";

export { PublicCardSkeleton };

type SalesChartView = ComponentType<{
  card: { id: string; estimatedSellPrice: number; purchasePrice: number };
  points?: { date: string; label: string; value: number }[] | null;
  sales?: ChartSale[] | null;
  selectedSaleId?: string | null;
  onSelectSale?: (id: string | null) => void;
  fetchedAt?: string | null;
  source?: "trawl" | "sample" | "off";
  loading?: boolean;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  count?: number;
  sample?: boolean;
  lockedToComps?: boolean;
  noSalesLabel?: string;
  hideStatusLabel?: boolean;
  heading?: string;
  headlineLabel?: string;
  headlineIsEstimate?: boolean;
}>;

export function PublicCardView({
  username,
  id,
  publicComps = hiddenPublicComps(),
  initialCard = null,
  initialOwner = null,
}: {
  username: string;
  id: string;
  publicComps?: PublicCardComps;
  /** Server-read public_cards row, so the card paints before the snapshot. Public data only. */
  initialCard?: OwnedCard | null;
  initialOwner?: PublicCardOwner | null;
}) {
  const social = useSocial();
  const { cards, ready: cardsReady } = useCollection();
  const profile = social.profileByUsername(username);
  const ownerRead = useProfiles(profile ? null : { usernames: [username] });
  const isOwn = Boolean(profile && social.user && profile.id === social.user.id);
  const backHref = `${userHref(username)}?tab=collection`;
  const serverCard = initialCard && initialCard.id === id ? initialCard : null;
  // The live public row decides. The server's copy only stands in until it is read.
  const cardRead = usePublicCards({ ids: [id] });

  // The owner not read yet counts as "still loading": keep the server's paint up.
  if (!social.ready || (isOwn && !cardsReady) || (!profile && !ownerRead.ready)) {
    // Until the snapshot says who is viewing, paint the public card with no
    // viewer: no own-card, message, block or mute state, room held for them.
    const early =
      initialCard && initialOwner && initialCard.id === id && initialCard.ownerId === initialOwner.id
        ? initialCard
        : null;
    if (!early || !initialOwner) {
      return !profile && ownerRead.failed ? (
        <ReadRetry title="Couldn't load this card" onRetry={ownerRead.retry} />
      ) : (
        <PublicCardSkeleton />
      );
    }
    return (
      <PublicCardAnalytics
        card={early}
        displayName={initialOwner.displayName}
        ownerUsername={initialOwner.username}
        backHref={backHref}
        userId={null}
        canFlag={false}
        publicComps={publicComps}
        messageHref={null}
        reserveMessage={early.openToOffers === true}
        manageHref={null}
      />
    );
  }

  if (!profile) {
    return (
      <Missing
        title="Profile not found"
        detail="That collector isn't on Slabhold."
        href="/"
        label="Back to Home"
      />
    );
  }

  const owned = isOwn ? cards.find((card) => card.id === id) : undefined;
  const listed =
    social.publicCards.find((card) => card.id === id && card.ownerId === profile.id) ??
    (!cardRead.ready && serverCard?.ownerId === profile.id ? serverCard : undefined);
  // A failed read never means the card is gone: keep the server's copy, or offer a retry.
  if (!owned && !listed && cardRead.failed) return <PublicCardRetry onRetry={cardRead.retry} />;
  if (!owned && !listed && !cardRead.ready) return <PublicCardSkeleton />;
  const card = owned ? (owned.isPublic ? toPublicCard(owned) : null) : (listed ?? null);

  if (!card) {
    return (
      <Missing
        title="This card isn't public"
        detail="Only cards the collector has shared on their profile can be opened here."
        href={backHref}
        label={`Back to ${profile.displayName}`}
      />
    );
  }

  const messageHref = messageOwnerHref({
    viewerId: social.user?.id ?? null,
    ownerId: profile.id,
    ownerUsername: profile.username,
    cardId: card.id,
    openToOffers: card.openToOffers ?? null,
    blocked: (social.blockedIds ?? []).includes(profile.id),
    muted: (social.mutedIds ?? []).includes(profile.id),
  });

  return (
    <PublicCardAnalytics
      card={card}
      displayName={profile.displayName}
      ownerUsername={profile.username}
      backHref={backHref}
      userId={social.user?.id ?? null}
      canFlag={isCardOwner(profile.id, social.user?.id ?? null)}
      publicComps={publicComps}
      messageHref={messageHref}
      manageHref={owned ? `/cards/${owned.id}` : null}
    />
  );
}

function PublicCardAnalytics({
  card,
  displayName,
  ownerUsername,
  backHref,
  userId,
  canFlag,
  publicComps,
  messageHref,
  reserveMessage = false,
  manageHref,
}: {
  card: PublicCard;
  displayName: string;
  /** For the Slabhold team badge beside the owner's name. */
  ownerUsername?: string | null;
  backHref: string;
  userId: string | null;
  canFlag: boolean;
  publicComps: PublicCardComps;
  messageHref: string | null;
  /** Before the snapshot: hold the Message owner button's room so it doesn't push the page. */
  reserveMessage?: boolean;
  /** Your own card: where to switch public or private. */
  manageHref: string | null;
}) {
  const pathname = usePathname() || "/";
  const specs = [
    card.sport ? { label: "Sport", value: card.sport } : null,
    card.cardNumber.trim() && card.cardNumber.trim() !== "—"
      ? { label: "No.", value: `#${card.cardNumber.trim()}` }
      : null,
    card.parallel?.trim()
      ? {
          label: "Parallel",
          value: canonicalParallelName(card.setBrand, card.parallel),
        }
      : null,
    card.grade?.trim() ? { label: "Grade", value: card.grade.trim() } : null,
  ].filter((spec): spec is { label: string; value: string } => Boolean(spec));

  const {
    value: cardValue,
    loading: valueLoading,
    errorMessage,
    retry: retryValue,
  } = useCardValue(card.id);
  const sold = useSoldComps(userId ? card.id : null);
  const flags = useCompFlagState(
    card.id,
    canFlag,
    sold.status === "ready" ? (sold.data?.comps ?? []) : [],
  );
  const [saleId, setSaleId] = useState<string | null>(null);
  const chartSales = useChartSales(sold.status === "ready" ? flags.visible : null);
  const [SalesChart, setSalesChart] = useState<SalesChartView | null>(null);
  const [chartFailed, setChartFailed] = useState(false);
  const [chartAttempt, setChartAttempt] = useState(0);

  // The sales list draws once the sold prices are in: fetch its code meanwhile.
  useEffect(preloadCompsList, []);

  useEffect(() => {
    let cancelled = false;
    void import("@/components/sales-chart")
      .then((mod) => {
        if (cancelled) return;
        setChartFailed(false);
        setSalesChart(() => mod.SalesChart);
      })
      .catch(() => {
        if (!cancelled) setChartFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [chartAttempt]);

  useEffect(() => {
    if (
      sold.status === "ready" ||
      sold.status === "unavailable" ||
      sold.status === "rate_limited"
    ) {
      retryValue();
    }
  }, [retryValue, sold.data?.fetchedAt, sold.status]);

  const authRequired = !userId || sold.status === "auth_required";
  const rateLimited = sold.status === "rate_limited";
  const unavailable = sold.status === "unavailable";
  const soldCopy = soldNotice(sold.status, sold.message);
  const usingLive = sold.data?.source === "trawl" && !sold.data.sample;
  const usingSample =
    sold.status === "ready" &&
    (sold.data?.sample === true ||
      sold.data?.source === "sample" ||
      sold.data?.source === "off");
  const compsLoading = Boolean(userId) && (sold.status === "loading" || sold.status === "idle");
  const onScreenComps = sold.status === "ready" ? flags.visible : [];
  const shownValue =
    sold.status === "ready"
      ? valueFromShownSales(onScreenComps, flags.priced ?? cardValue)
      : (flags.priced ?? cardValue);
  const salesCount = countForSalesLabel(
    cardValueHasAmount(shownValue) ? shownValue.nSales : null,
    sold.status === "ready" ? onScreenComps.length : null,
  );
  const storedAmount = shownCardValue(card, shownValue);
  const ebayHref = ebaySoldSearchUrlForCard(card);
  const exactSales =
    sold.status === "ready"
      ? onScreenComps.map((comp) => ({ price: comp.soldPrice, soldAt: comp.soldDate }))
      : undefined;
  const priceRead =
    valueLoading && !flags.priced && !shownValue
      ? null
      : resolvePriceRead({
          value: shownValue,
          createdAt: card.createdAt,
          exactSales,
          similar: cardValue?.similar ?? null,
          ebayHref,
          card,
        });
  const displayEst = priceRead?.kind === "estimate" ? storedAmount : null;
  const collapsePrices = shouldCollapseEmptyPrices({
    loading: valueLoading || compsLoading,
    blocked: authRequired || rateLimited || unavailable,
    settled: sold.status === "ready",
    hasEstimate: priceRead?.kind === "estimate",
    hasSales: onScreenComps.length > 0,
  });
  const showChart = !collapsePrices && !authRequired && !unavailable && !rateLimited;
  // The comp card (chart, its skeleton, or its retry) carries the price read: no separate price block.
  const chartCard = showChart && !soldCopy;
  // The comp card prints the Trawl line only once it has rendered live data.
  const chartShowsAttribution =
    chartCard && Boolean(SalesChart) && !chartFailed && !valueLoading && shownValue?.status !== "sample";

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        data-nav-back=""
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {displayName}
        <TeamBadge username={ownerUsername} inLink />
      </Link>

      <ShapedCardThumb
        card={card}
        priority
        className="mx-auto h-96 w-64 rounded-2xl object-cover shadow-xl shadow-black/20"
        landscapeClassName="mx-auto aspect-[7/5] w-full max-w-[22rem] rounded-2xl shadow-xl shadow-black/20"
      />

      <div>
        <p className="text-sm text-zinc-500">{cardTitle(card)}</p>
        <div className="flex items-start justify-between gap-3">
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              <LazyPlayerNameLink name={card.playerName} sport={card.sport} className="hover:underline" />
            </h1>
            {showOpenToOffersBadge(card.openToOffers) ? <OpenToOffersBadge /> : null}
          </div>
          <WantButton
            card={card}
            fairLow={storedAmount != null ? (shownValue?.low ?? null) : null}
            fairHigh={storedAmount != null ? (shownValue?.high ?? null) : null}
          />
        </div>
        {specs.length > 0 ? (
          <dl className="mt-3 flex flex-wrap gap-2">
            {specs.map((spec) => (
              <div
                key={spec.label}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/5"
              >
                <dt className="text-13 text-zinc-500">{spec.label}</dt>
                <dd className="text-sm font-semibold">{spec.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {messageHref ? (
          <Link href={messageHref} className={`${outlineButton} mt-4`}>
            Message owner
          </Link>
        ) : reserveMessage ? (
          <span aria-hidden="true" className={`${outlineButton} invisible mt-4`}>
            Message owner
          </span>
        ) : null}
        {manageHref ? (
          <Link href={manageHref} className={`${outlineButton} mt-4 min-h-11`}>
            Manage card and privacy
          </Link>
        ) : null}
      </div>

      {collapsePrices ? (
        priceRead?.kind === "similar" ? (
          <section className={compCard}>
            <SimilarCardsLine read={priceRead} />
          </section>
        ) : (
          <CompEmpty
            title={!priceRead || priceRead.text === NO_SALES_FOUND_LABEL ? "No sales yet" : priceRead.text}
          >
            {priceRead?.showEbaySold && ebayHref ? <EbaySoldLine href={ebayHref} /> : null}
          </CompEmpty>
        )
      ) : chartCard ? null : (
      <section className="grid grid-cols-1 gap-3">
        <div className={`min-w-0 ${compCard}`}>
          {priceRead?.kind === "similar" ? (
            <SimilarCardsLine read={priceRead} />
          ) : (
            <>
              <p className={`flex min-h-5 items-center ${compLabel}`}>{compEyebrow(priceRead?.kind ?? "estimate")}</p>
              <p className={`mt-1 min-h-10 min-w-0 ${priceRead?.kind === "estimate" || !priceRead ? `${compHeroValue} whitespace-nowrap` : `max-w-full py-1.5 ${compSectionValue}`}`}>
                {valueLoading && !flags.priced ? (
                  <span data-skeleton="hero" className="skeleton-shimmer inline-block h-8 w-32 rounded-lg bg-zinc-100 align-middle dark:bg-white/5" />
                ) : priceRead && priceRead.kind !== "estimate" ? (
                  <PriceFallbackText text={priceRead.text} />
                ) : priceRead ? (
                  priceRead.text
                ) : (
                  <span data-skeleton="hero" className="skeleton-shimmer inline-block h-8 w-32 rounded-lg bg-zinc-100 align-middle dark:bg-white/5" />
                )}
              </p>
            </>
          )}
          {displayEst != null || (priceRead?.kind === "estimate" && isLowConfidenceValue(shownValue)) ? (
            <p className={`mt-2 flex min-h-4 flex-wrap items-center gap-x-1.5 leading-4 ${compCaption}`}>
              {displayEst != null && shownValue?.status === "sample" ? <span>Sample estimate ·</span> : null}
              {displayEst != null && (shownValue?.nSales ?? 0) > 0 ? (
                <span>{basedOnSalesLabel(shownValue?.nSales ?? 0)}</span>
              ) : null}
              {priceRead?.kind === "estimate" && isLowConfidenceValue(shownValue) ? (
                <span className="rounded-md bg-amber-500/15 px-1.5 text-11 leading-4 font-semibold text-amber-800 dark:text-amber-200">
                  Low confidence
                </span>
              ) : null}
            </p>
          ) : null}
          {soldCopy && !authRequired ? (
            <div className={`mt-4 px-4 py-4 text-center ${compTile}`}>
              <p className="text-sm font-semibold">{soldNoticeTitle(soldCopy)}</p>
              <p className="mt-1 text-sm text-zinc-500">{soldCopy}</p>
            </div>
          ) : null}
        </div>
      </section>
      )}

      {errorMessage ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {errorMessage}
        </p>
      ) : null}
      {chartCard && SalesChart && !chartFailed ? (
        <SalesChart
          card={{
            id: card.id,
            estimatedSellPrice: storedAmount ?? 0,
            purchasePrice: card.purchasePrice ?? 0,
          }}
          points={sold.status === "ready" && usingLive ? sold.data?.history : null}
          sales={sold.status === "ready" && usingLive ? chartSales : null}
          selectedSaleId={saleId}
          onSelectSale={setSaleId}
          fetchedAt={sold.data?.fetchedAt ?? null}
          source={sold.data?.source ?? (usingSample ? "sample" : "trawl")}
          loading={valueLoading}
          median={priceRead?.kind === "estimate" ? storedAmount : null}
          p25={priceRead?.kind === "estimate" ? (shownValue?.low ?? null) : null}
          p75={priceRead?.kind === "estimate" ? (shownValue?.high ?? null) : null}
          count={priceRead?.kind === "estimate" ? (shownValue?.nSales ?? 0) : onScreenComps.length}
          sample={shownValue?.status === "sample"}
          lockedToComps
          noSalesLabel={NO_SALES_FOUND_LABEL}
          hideStatusLabel
          heading={compEyebrow(priceRead?.kind ?? "estimate", SIMILAR_CARDS_LABEL)}
          headlineLabel={
            priceRead && priceRead.kind !== "estimate"
              ? priceRead.kind === "similar"
                ? SIMILAR_CARDS_LABEL
                : priceRead.text
              : undefined
          }
          headlineIsEstimate={priceRead?.kind === "estimate"}
        />
      ) : showChart && chartFailed ? (
        <SalesChartPlaceholder
          failed={chartFailed}
          eyebrow={compEyebrow(priceRead?.kind ?? "estimate", SIMILAR_CARDS_LABEL)}
          value={
            priceRead?.kind === "estimate"
              ? priceRead.text
              : priceRead?.kind === "similar"
                ? SIMILAR_CARDS_LABEL
                : (priceRead?.text ?? null)
          }
          onRetry={() => {
            setChartFailed(false);
            setSalesChart(null);
            setChartAttempt((attempt) => attempt + 1);
          }}
        />
      ) : chartCard ? (
        <SalesChartPending />
      ) : null}

      {collapsePrices || (authRequired && publicComps.status === "hidden") || (soldCopy && !authRequired) ? null : (
        <section className={compCard}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Recent sales</h2>
          {!authRequired && sold.status === "ready" && onScreenComps.length > 0 ? (
            <p className="shrink-0 text-xs font-medium text-zinc-500 tabular-nums">
              {salesCount} sale{salesCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        {authRequired ? null : (
          <p className={`mt-1 leading-4 ${compCaption}`}>
            {compsLoading
              ? "Loading sold listings…"
              : soldCopy
                ? soldCopy
                : sold.status === "ready"
                  ? onScreenComps.length === 0
                    ? priceRead?.kind === "similar"
                      ? SIMILAR_CARDS_LABEL
                      : (priceRead?.text ?? NO_SALES_FOUND_LABEL)
                    : (
                        <>
                          Recent sold prices
                          <SoldFreshness comps={onScreenComps} fetchedAt={sold.data?.fetchedAt} />
                        </>
                      )
                  : usingSample
                    ? "Sample listings"
                    : ""}
          </p>
        )}
        {authRequired ? (
          <PublicCardCompsPreview comps={publicComps} pathname={pathname} />
        ) : null}
        {authRequired ? null : compsLoading ? (
          <CompRowsSkeleton />
        ) : unavailable || rateLimited ? null : sold.status === "ready" &&
          (onScreenComps.length > 0 || flags.hidden.length > 0) ? (
          <div className="mt-2">
            <LazyCompsList
              comps={onScreenComps}
              cardId={card.id}
              canFlag={canFlag}
              hidden={flags.hidden}
              onFlag={flags.flag}
              onRestore={flags.restore}
              toast={flags.toast}
              onUndo={flags.undo}
              selectedId={saleId}
              onSelect={setSaleId}
            />
          </div>
        ) : null}
        {/* With the comp card up, the attribution sits in its footer. */}
        {usingLive && !compsLoading && !authRequired && !chartShowsAttribution ? (
          <p className="mt-3 text-11 text-zinc-400">
            Sold data via Trawl (third-party, not affiliated with eBay)
          </p>
        ) : null}
        </section>
      )}

      {/* Owners and hunters and the fair price check are off for now. */}
      <LazyCardCollectorsSaying cardId={card.id} />
    </div>
  );
}

function toPublicCard(card: {
  id: string;
  playerName: string;
  year: number;
  setBrand: string;
  cardNumber: string;
  sport: string;
  photoDataUrl: string | null;
  accent: string;
  estimatedSellPrice: number;
  grade: string;
  parallel: string;
  purchasePrice: number | null;
  openToOffers?: boolean | null;
}): PublicCard {
  return {
    id: card.id,
    playerName: card.playerName,
    year: card.year,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    sport: card.sport,
    photoDataUrl: card.photoDataUrl,
    accent: card.accent,
    estimatedSellPrice: card.estimatedSellPrice,
    grade: card.grade,
    parallel: card.parallel,
    purchasePrice: card.purchasePrice,
    openToOffers: card.openToOffers ?? null,
  };
}

function SalesChartPlaceholder({
  failed,
  eyebrow,
  value,
  onRetry,
}: {
  failed: boolean;
  eyebrow: string;
  /** The price read, so the card still answers what it's worth. */
  value: string | null;
  onRetry: () => void;
}) {
  return (
    <section className={compCard}>
      <p className={`flex min-h-5 items-center ${compLabel}`}>{eyebrow}</p>
      <div className="mt-1 flex min-h-10 items-baseline">
        {value && /^\$[\d,]+\.\d{2}$/.test(value) ? (
          <p className={compHeroValue}>{value}</p>
        ) : value ? (
          <p className={`max-w-full py-1.5 ${compSectionValue}`}>
            <PriceFallbackText text={value} />
          </p>
        ) : null}
      </div>
      {failed ? (
        <div className={`mt-4 flex min-h-44 flex-col items-center justify-center gap-1 px-4 py-4 text-center ${compTile}`}>
          <p className="text-sm font-semibold">Sales are taking a break</p>
          <p className="text-sm text-zinc-500">{"Couldn't load the sales graph."}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-violet-700 hover:bg-violet-500/10 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:text-violet-300"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="skeleton-shimmer mt-4 h-44 rounded-xl" aria-busy="true">
          <span className="sr-only">Loading sold prices</span>
        </div>
      )}
    </section>
  );
}

function PublicCardRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-public-card-retry="" className="py-16 text-center">
      <p className="text-lg font-semibold">Couldn&apos;t load this card</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-zinc-500">Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none"
      >
        Try again
      </button>
    </div>
  );
}

function Missing({
  title,
  detail,
  href,
  label,
}: {
  title: string;
  detail: string;
  href: string;
  label: string;
}) {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-zinc-500">{detail}</p>
      <Link href={href} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold">
        {label}
      </Link>
    </div>
  );
}
