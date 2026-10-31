"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { useCompFlagState } from "@/components/use-comp-flags";
import { ArrowLeft } from "lucide-react";
import { LazyPlayerNameLink } from "@/components/player-name-lazy";
import { CardCollectorsSaying } from "@/components/card-collectors-saying";
import { OpenToOffersBadge } from "@/components/open-to-offers";
import { EbaySoldLine, PriceFallbackText, SimilarCardsLine } from "@/components/price-readout";
import { WantButton } from "@/components/want-button";
import { outlineButton } from "@/components/button-styles";
import { CardThumb } from "@/components/card-thumb";
import { CompBasis } from "@/components/comp-basis";
import { CompsList } from "@/components/comps-list";
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
import { soldNotice } from "@/lib/comps/sold-response";
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

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        data-nav-back=""
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {displayName}
      </Link>

      <CardThumb
        card={card}
        priority
        className="mx-auto h-96 w-64 rounded-2xl object-cover shadow-xl shadow-black/20"
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
                <dt className="text-[10px] tracking-wide text-zinc-500 uppercase">{spec.label}</dt>
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
        <>
          {priceRead?.kind === "similar" ? (
            <SimilarCardsLine read={priceRead} />
          ) : (
            <div className="text-sm text-zinc-500">
              <p>{priceRead?.text ?? NO_SALES_FOUND_LABEL}</p>
              {priceRead?.showEbaySold && ebayHref ? (
                <div className="mt-1">
                  <EbaySoldLine href={ebayHref} />
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : (
      <section className="grid grid-cols-1 gap-3">
        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
          {priceRead?.kind === "similar" ? (
            <SimilarCardsLine read={priceRead} />
          ) : (
            <>
              {priceRead?.kind === "last_sale" || priceRead?.kind === "range" || priceRead?.kind === "estimate" || !priceRead ? (
                <p className="text-[11px] tracking-wide text-zinc-500 uppercase">
                  {priceRead?.kind === "last_sale"
                    ? "Last sale"
                    : priceRead?.kind === "range"
                      ? "Recent sales"
                      : "Estimated value"}
                </p>
              ) : null}
              <p className={`mt-1 min-w-0 font-semibold tracking-tight ${priceRead?.kind === "estimate" || !priceRead ? "text-[clamp(1.25rem,5vw,1.5rem)] tabular-nums whitespace-nowrap" : "max-w-full text-[clamp(0.95rem,3.6vw,1.125rem)] leading-snug"}`}>
                {valueLoading && !flags.priced ? (
                  "…"
                ) : priceRead && priceRead.kind !== "estimate" ? (
                  <PriceFallbackText text={priceRead.text} />
                ) : (
                  (priceRead?.text ?? "…")
                )}
              </p>
            </>
          )}
          {displayEst != null ? (
            <>
              {shownValue?.status === "sample" ? (
                <p className="mt-1 text-xs text-zinc-500">Sample estimate</p>
              ) : null}
              <CompBasis count={shownValue?.nSales ?? 0} basis={[]} />
            </>
          ) : null}
          {priceRead?.kind === "estimate" && isLowConfidenceValue(shownValue) ? (
            <span className="mt-1 inline-block rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
              Low confidence
            </span>
          ) : null}
        </div>
      </section>
      )}

      {errorMessage ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {errorMessage}
        </p>
      ) : null}
      {authRequired ? null : soldCopy ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {soldCopy}
        </p>
      ) : showChart && SalesChart && !chartFailed ? (
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
          onRetry={() => {
            setChartFailed(false);
            setSalesChart(null);
            setChartAttempt((attempt) => attempt + 1);
          }}
        />
      ) : showChart ? (
        <SalesChartPending />
      ) : null}

      {collapsePrices || (authRequired && publicComps.status === "hidden") ? null : (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Recent sales</h2>
            {authRequired ? null : (
              <p className="text-xs text-zinc-500">
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
                              {basedOnSalesLabel(salesCount)}
                              <SoldFreshness comps={onScreenComps} fetchedAt={sold.data?.fetchedAt} />
                            </>
                          )
                      : usingSample
                        ? "Sample listings"
                        : ""}
              </p>
            )}
          </div>
        </div>
        {authRequired ? (
          <PublicCardCompsPreview comps={publicComps} pathname={pathname} />
        ) : null}
        {usingLive && !compsLoading && !authRequired ? (
          <p className="mt-3 text-[11px] text-zinc-400">
            Sold data via Trawl (third-party, not affiliated with eBay)
          </p>
        ) : null}
        {authRequired ? null : compsLoading ? (
          <div className="mt-3 space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
              />
            ))}
          </div>
        ) : unavailable || rateLimited ? null : sold.status === "ready" &&
          (onScreenComps.length > 0 || flags.hidden.length > 0) ? (
          <CompsList
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
        ) : null}
        </section>
      )}

      {/* Owners and hunters and the fair price check are off for now. */}
      <CardCollectorsSaying cardId={card.id} />
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
  onRetry,
}: {
  failed: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Recent sales</p>
      <p className="mt-2 text-sm text-zinc-500">
        {failed ? "Couldn't load the sales graph" : "Loading sold prices…"}
      </p>
      <div
        className={`mt-3 h-44 rounded-xl bg-zinc-100 dark:bg-white/5 ${
          failed ? "flex flex-col items-center justify-center gap-3 px-4 text-center" : "animate-pulse"
        }`}
      >
        {failed ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-9 items-center rounded-full bg-violet-600 px-3.5 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Retry
          </button>
        ) : null}
      </div>
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
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-bold text-white transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none"
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
      <Link href={href} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold">
        {label}
      </Link>
    </div>
  );
}
