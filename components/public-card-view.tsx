"use client";

import { backLinkClick } from "@/components/nav-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { useCompFlagState } from "@/components/use-comp-flags";
import { ArrowLeft } from "lucide-react";
import { LazyPlayerNameLink } from "@/components/player-name-lazy";
import { LazyCardCollectorsSaying } from "@/components/card-talk-frame";
import { LazyCompsList, preloadCompsList } from "@/components/card-page-parts";
import { OpenToOffersBadge } from "@/components/open-to-offers";
import { EbaySoldLine } from "@/components/price-readout";
import { WantButton } from "@/components/want-button";
import { outlineButton } from "@/components/button-styles";
import { CardStage } from "@/components/card-page/card-stage";
import { CardHeading, cardSpecs } from "@/components/card-page/card-heading";
import { PriceInfo } from "@/components/card-page/price-info";
import {
  PlotEmpty,
  ROUGH_VALUE_NOTE,
  SaleRowsSkeleton,
  TRAWL_ATTRIBUTION,
  ValueHead,
  ValueNotice,
  ValuePending,
  cardSection,
  cardSectionTitle,
  priceInfoLines,
  recentSalesLine,
  valueHeadline,
  type ValueHeadline,
} from "@/components/card-page/value-head";
import { PublicCardCompsPreview } from "@/components/public-card-comps";
import { PublicCardSkeleton } from "@/components/public-card-skeleton";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { useChartSales } from "@/lib/chart/use-chart-sales";
import type { ChartSale } from "@/lib/chart/sales";
import { isCardOwner } from "@/lib/comps/ownership";
import { messageOwnerHref, showOpenToOffersBadge } from "@/lib/offers/open-to-offers";
import { profileCardsPath } from "@/lib/social/profile-tabs";
import { userHref } from "@/lib/social/user-href";
import { valueFromShownSales } from "@/lib/comps/shared-value";
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
import { isLowConfidenceValue, shownCardValue } from "@/lib/value/format";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { shouldCollapseEmptyPrices } from "@/lib/value/empty-price";
import {
  NO_SALES_FOUND_LABEL,
  resolvePriceRead,
  SIMILAR_CARDS_LABEL,
  type PriceRead,
} from "@/lib/value/price-fallback";
import { useCardValue } from "@/lib/value/use-card-values";
import { usePublicCards } from "@/lib/social/use-public-cards";
import { useProfiles } from "@/lib/social/use-profiles";
import { ReadRetry } from "@/components/read-retry";
import { TeamBadge } from "@/components/team-badge";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";

export { PublicCardSkeleton };

type CardOwnerRef = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accent?: string;
};

/** Who owns this card: avatar and @handle to their profile, then Follow. */
export function CardOwnerRow({ owner, followReady }: { owner: CardOwnerRef; followReady: boolean }) {
  return (
    <div data-card-owner="" className="flex items-center gap-3">
      <Link
        href={userHref(owner.username)}
        aria-label={`${owner.displayName}, @${owner.username}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
      >
        <Avatar
          name={owner.displayName}
          image={owner.avatarUrl}
          accent={owner.accent}
          className="h-9 w-9"
          expandable={false}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1 truncate text-sm leading-5 font-semibold">
            <span className="truncate">{owner.displayName}</span>
            <TeamBadge username={owner.username} inLink />
          </span>
          <span className="block truncate text-13 leading-5 text-zinc-500">@{owner.username}</span>
        </span>
      </Link>
      {followReady ? (
        <FollowButton userId={owner.id} />
      ) : (
        <span aria-hidden="true" className="inline-block h-8 min-w-[6.5rem] shrink-0" />
      )}
    </div>
  );
}

type CardValueView = ComponentType<{
  read: PriceRead | null;
  amount?: number | null;
  count?: number;
  sales?: ChartSale[] | null;
  selectedSaleId?: string | null;
  onSelectSale?: (id: string | null) => void;
  fetchedAt?: string | null;
  live?: boolean;
  sample?: boolean;
  similarLabel?: string;
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
  // Back goes back in history first (the profile, on the card you came from). Opened cold, it is this collector's cards.
  const backHref = profileCardsPath(username);
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
        owner={initialOwner}
        followReady={false}
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
        href={userHref(username)}
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
      owner={{
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarDataUrl,
        accent: profile.accent,
      }}
      followReady
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
  owner,
  followReady,
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
  /** Avatar, @handle and Follow under the card. */
  owner: CardOwnerRef;
  /** False until the snapshot says who is viewing: Follow's room is held, not drawn. */
  followReady: boolean;
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
  // The pages a card opens from: the grid, the profile's carousel, and your own Profile tab.
  const backPages = [backHref, userHref(owner.username), "/profile"];
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
  const [CardValueView, setCardValueView] = useState<CardValueView | null>(null);
  const [chartFailed, setChartFailed] = useState(false);
  const [chartAttempt, setChartAttempt] = useState(0);

  // The sales list draws once the sold prices are in: fetch its code meanwhile.
  useEffect(preloadCompsList, []);

  useEffect(() => {
    let cancelled = false;
    void import("@/components/card-page/card-value")
      .then((mod) => {
        if (cancelled) return;
        setChartFailed(false);
        setCardValueView(() => mod.CardValue);
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
  // The value section (chart, its skeleton, or its retry) carries the price read: no separate price block.
  const chartCard = showChart && !soldCopy;
  // The value section's ⓘ holds the Trawl credit only once it has drawn live data.
  const chartShowsAttribution =
    chartCard && Boolean(CardValueView) && !chartFailed && !valueLoading && shownValue?.status !== "sample";

  const headline = valueHeadline(priceRead, SIMILAR_CARDS_LABEL);
  const similarHead: ValueHeadline | null =
    priceRead?.kind === "similar"
      ? {
          label: SIMILAR_CARDS_LABEL,
          text: (
            <Link href={priceRead.href} className="text-violet-700 underline-offset-2 hover:underline dark:text-violet-300">
              {priceRead.detail}
            </Link>
          ),
          note: priceRead.priceText,
        }
      : null;
  const storedSales = shownValue?.nSales ?? 0;
  const storedLine =
    displayEst != null && shownValue?.status === "sample"
      ? "Sample estimate"
      : priceRead?.kind === "estimate" || priceRead?.kind === "range" || priceRead?.kind === "last_sale"
        ? recentSalesLine(storedSales, {
            rough: priceRead.kind !== "last_sale" && isLowConfidenceValue(shownValue),
            note: headline?.note,
          })
        : (headline?.note ?? "");
  const retryChart = () => {
    setChartFailed(false);
    setCardValueView(null);
    setChartAttempt((attempt) => attempt + 1);
  };

  return (
    <div className="space-y-6" data-card-page="">
      <Link
        href={backHref}
        data-nav-back=""
        // From the profile's carousel or the grid, back is back: the row is still on this card.
        onClick={(event) => backLinkClick(event, backPages)}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {displayName}
        <TeamBadge username={ownerUsername} inLink />
      </Link>

      <CardStage card={card} />

      <div className="space-y-4">
        <CardHeading
          eyebrow={cardTitle(card)}
          name={<LazyPlayerNameLink name={card.playerName} sport={card.sport} className="hover:underline" />}
          specs={cardSpecs(card, canonicalParallelName)}
          tag={showOpenToOffersBadge(card.openToOffers) ? <OpenToOffersBadge tone="brand" /> : null}
          action={
            <WantButton
              compact
              card={card}
              fairLow={storedAmount != null ? (shownValue?.low ?? null) : null}
              fairHigh={storedAmount != null ? (shownValue?.high ?? null) : null}
            />
          }
        />
        <CardOwnerRow owner={owner} followReady={followReady} />
        {messageHref ? (
          <Link href={messageHref} className={`${outlineButton} min-h-11 w-full`}>
            Message owner
          </Link>
        ) : reserveMessage ? (
          <span aria-hidden="true" className={`${outlineButton} invisible min-h-11 w-full`}>
            Message owner
          </span>
        ) : null}
        {manageHref ? (
          <Link href={manageHref} className={`${outlineButton} min-h-11 w-full`}>
            Manage card and privacy
          </Link>
        ) : null}
      </div>

      {collapsePrices ? (
        <section data-comp-empty="" className={cardSection}>
          <ValueHead
            headline={
              similarHead ?? {
                label: "Recent sales",
                text: !priceRead || priceRead.text === NO_SALES_FOUND_LABEL ? "No sales yet" : priceRead.text,
              }
            }
            line={similarHead?.note}
          />
          <PlotEmpty title={similarHead ? "No sales of this exact card yet" : null}>
            {priceRead?.showEbaySold && ebayHref ? <EbaySoldLine href={ebayHref} /> : null}
          </PlotEmpty>
        </section>
      ) : chartCard ? null : (
        <section data-value-read="" className={cardSection}>
          <ValueHead
            headline={similarHead ?? (valueLoading && !flags.priced ? null : headline)}
            line={similarHead ? similarHead.note : storedLine}
            info={
              headline?.price && shownValue?.status !== "sample" && !valueLoading ? (
                <PriceInfo
                  lines={priceInfoLines([
                    priceRead?.kind === "estimate" && isLowConfidenceValue(shownValue) ? ROUGH_VALUE_NOTE : null,
                  ])}
                />
              ) : null
            }
          />
          {soldCopy && !authRequired ? <ValueNotice title={soldNoticeTitle(soldCopy)}>{soldCopy}</ValueNotice> : null}
        </section>
      )}

      {errorMessage ? (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          {errorMessage}
        </p>
      ) : null}
      {chartCard && CardValueView && !chartFailed && !valueLoading ? (
        <CardValueView
          read={priceRead}
          amount={priceRead?.kind === "estimate" ? storedAmount : null}
          count={priceRead?.kind === "estimate" ? (shownValue?.nSales ?? 0) : onScreenComps.length}
          sales={sold.status === "ready" && usingLive ? chartSales : null}
          selectedSaleId={saleId}
          onSelectSale={setSaleId}
          fetchedAt={sold.data?.fetchedAt ?? null}
          live={usingLive}
          sample={shownValue?.status === "sample"}
          similarLabel={SIMILAR_CARDS_LABEL}
        />
      ) : showChart && chartFailed ? (
        <ValuePending
          busy={false}
          headline={similarHead ?? headline}
          line={similarHead ? similarHead.note : storedLine}
          note={
            <>
              <span className="block font-semibold text-zinc-900 dark:text-zinc-100">Sales are taking a break</span>
              <span className="block">{"Couldn't load the sales graph."}</span>
              <button
                type="button"
                onClick={retryChart}
                className="mt-1 inline-flex min-h-11 items-center rounded-full text-sm font-semibold text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:text-violet-300"
              >
                Try again
              </button>
            </>
          }
        />
      ) : chartCard ? (
        <ValuePending headline={valueLoading && !flags.priced ? null : (similarHead ?? headline)} line={headline ? storedLine : undefined} />
      ) : null}

      {collapsePrices || (authRequired && publicComps.status === "hidden") || (soldCopy && !authRequired) ? null : (
        <section data-slot="sales-list" className={cardSection}>
          <h2 className={cardSectionTitle}>Recent sales</h2>
          {authRequired ? null : compsLoading ? (
            <span className="sr-only">Loading sold listings…</span>
          ) : sold.status === "ready" && onScreenComps.length === 0 ? (
            <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
              {priceRead?.kind === "similar" ? SIMILAR_CARDS_LABEL : (priceRead?.text ?? NO_SALES_FOUND_LABEL)}
            </p>
          ) : usingSample ? (
            <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">Sample listings</p>
          ) : null}
          {authRequired ? <PublicCardCompsPreview comps={publicComps} pathname={pathname} /> : null}
          {authRequired ? null : compsLoading ? (
            <SaleRowsSkeleton />
          ) : unavailable || rateLimited ? null : sold.status === "ready" &&
            (onScreenComps.length > 0 || flags.hidden.length > 0) ? (
            <div className="mt-2">
              <LazyCompsList
                compact
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
          {/* With the value section up, the credit sits behind its ⓘ. Without it, it stays in plain sight here. */}
          {usingLive && !compsLoading && !authRequired && !chartShowsAttribution ? (
            <p data-trawl-credit="" className="mt-3 text-11 leading-4 text-zinc-500">
              {TRAWL_ATTRIBUTION}
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
