"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useCompFlagState } from "@/components/use-comp-flags";
import { ArrowLeft } from "lucide-react";
import { CardCollectorsSaying } from "@/components/card-collectors-saying";
import { CardOwnersSection } from "@/components/card-owners";
import { CardPeopleSections } from "@/components/card-people";
import { EmptyPriceNote } from "@/components/ebay-sold-link";
import { OpenToOffersBadge } from "@/components/open-to-offers";
import { WantButton } from "@/components/want-button";
import { outlineButton } from "@/components/button-styles";
import { CardThumb } from "@/components/card-thumb";
import { CompBasis } from "@/components/comp-basis";
import { CompsList } from "@/components/comps-list";
import { FairPriceCheck } from "@/components/fair-price-check";
import { PublicCardCompsPreview } from "@/components/public-card-comps";
import { useCollection } from "@/components/collection-provider";
import { ProfileSkeleton } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { ValueChart } from "@/components/value-chart";
import { isCardOwner } from "@/lib/comps/ownership";
import { messageOwnerHref, showOpenToOffersBadge } from "@/lib/offers/open-to-offers";
import { basedOnSalesLabel, countForSalesLabel, valueFromShownSales } from "@/lib/comps/shared-value";
import { soldNotice } from "@/lib/comps/sold-response";
import { useSoldComps } from "@/lib/comps/use-sold-comps";
import { canonicalParallelName } from "@/lib/cards/parallels";
import { cardTitle, formatPaidLabel } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";
import {
  hiddenPublicComps,
  type PublicCardComps,
} from "@/lib/comps/public-types";
import type { OwnersAndHunters } from "@/lib/cards/people";
import type { PublicCard } from "@/lib/social/types";
import {
  cardValueHasAmount,
  formatCardValueLabel,
  isLowConfidenceValue,
  NOT_ENOUGH_SALES_LABEL,
} from "@/lib/value/format";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { shouldCollapseEmptyPrices } from "@/lib/value/empty-price";
import { useCardValue } from "@/lib/value/use-card-values";

export function PublicCardView({
  username,
  id,
  publicComps = hiddenPublicComps(),
  people = null,
}: {
  username: string;
  id: string;
  publicComps?: PublicCardComps;
  people?: OwnersAndHunters | null;
}) {
  const social = useSocial();
  const { cards, ready: cardsReady } = useCollection();
  const profile = social.profileByUsername(username);
  const isOwn = Boolean(profile && social.user && profile.id === social.user.id);

  if (!social.ready || (isOwn && !cardsReady)) return <ProfileSkeleton />;

  const backHref = `/u/${encodeURIComponent(username)}?tab=collection`;

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
  const listed = social.publicCards.find((card) => card.id === id && card.ownerId === profile.id);
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
      people={people}
      messageHref={messageHref}
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
  people,
  messageHref,
}: {
  card: PublicCard;
  displayName: string;
  backHref: string;
  userId: string | null;
  canFlag: boolean;
  publicComps: PublicCardComps;
  people: OwnersAndHunters | null;
  messageHref: string | null;
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
  // Paid is private — only present when viewing your own card from the collection.
  const showPaid =
    typeof card.purchasePrice === "number" && Number.isFinite(card.purchasePrice);

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
  const storedAmount = cardValueHasAmount(shownValue) ? shownValue.median : null;
  const displayEst = storedAmount;
  const valueLabel =
    valueLoading && !flags.priced
      ? null
      : formatCardValueLabel(shownValue, { createdAt: card.createdAt });
  const collapsePrices = shouldCollapseEmptyPrices({
    loading: valueLoading || compsLoading,
    blocked: authRequired || rateLimited || unavailable,
    settled: sold.status === "ready",
    hasEstimate:
      displayEst != null ||
      Boolean(valueLabel && valueLabel !== NOT_ENOUGH_SALES_LABEL),
    hasSales: onScreenComps.length > 0,
  });
  const showChart = !collapsePrices && !authRequired && !unavailable && !rateLimited;

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {displayName}
      </Link>

      <CardThumb
        card={card}
        className="mx-auto h-96 w-64 rounded-2xl object-cover shadow-xl shadow-black/20"
      />

      <div>
        <p className="text-sm text-zinc-500">{cardTitle(card)}</p>
        <div className="flex items-start justify-between gap-3">
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{card.playerName}</h1>
            {showOpenToOffersBadge(card.openToOffers) ? <OpenToOffersBadge /> : null}
          </div>
          <WantButton
            card={card}
            fairLow={cardValueHasAmount(shownValue) ? shownValue.low : null}
            fairHigh={cardValueHasAmount(shownValue) ? shownValue.high : null}
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
        ) : null}
      </div>

      {collapsePrices ? (
        <>
          {showPaid ? (
            <section className="grid grid-cols-1 gap-3">
              <Metric
                label="Paid"
                value={formatPaidLabel(card.purchasePrice ?? 0, true)}
              />
            </section>
          ) : null}
          <EmptyPriceNote href={ebaySoldSearchUrlForCard(card)} />
        </>
      ) : (
      <section className={`grid gap-3 ${showPaid ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Estimated value</p>
          <p className="mt-1 min-w-0 text-[clamp(1.25rem,5vw,1.5rem)] font-semibold tracking-tight tabular-nums whitespace-nowrap">
            {valueLoading && !flags.priced ? "…" : valueLabel}
          </p>
          {displayEst != null ? (
            <>
              {shownValue?.status === "sample" ? (
                <p className="mt-1 text-xs text-zinc-500">Sample estimate</p>
              ) : null}
              <CompBasis count={shownValue?.nSales ?? 0} basis={[]} />
            </>
          ) : null}
          {isLowConfidenceValue(shownValue) ? (
            <span className="mt-1 inline-block rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
              Low confidence
            </span>
          ) : null}
        </div>
        {showPaid ? (
          <Metric
            label="Paid"
            value={formatPaidLabel(card.purchasePrice ?? 0, true)}
          />
        ) : null}
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
      ) : showChart ? (
        <ValueChart
          card={{
            id: card.id,
            estimatedSellPrice: storedAmount ?? 0,
            purchasePrice: card.purchasePrice ?? 0,
          }}
          points={sold.status === "ready" && usingLive ? sold.data?.history : null}
          source={sold.data?.source ?? (usingSample ? "sample" : "trawl")}
          loading={valueLoading}
          median={storedAmount}
          p25={storedAmount != null ? (shownValue?.low ?? null) : null}
          p75={storedAmount != null ? (shownValue?.high ?? null) : null}
          count={storedAmount != null ? (shownValue?.nSales ?? 0) : 0}
          sample={shownValue?.status === "sample"}
          lockedToComps
          noSalesLabel={NOT_ENOUGH_SALES_LABEL}
          hideStatusLabel
        />
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
                        ? NOT_ENOUGH_SALES_LABEL
                        : `${basedOnSalesLabel(salesCount)}${
                            sold.data?.fetchedAt
                              ? ` · Updated ${formatRelativeTime(sold.data.fetchedAt)}`
                              : ""
                          }`
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
          />
        ) : null}
        </section>
      )}

      <FairPriceCheck
        card={{
          id: card.id,
          playerName: card.playerName,
          year: card.year,
          yearLabel: card.yearLabel,
          setBrand: card.setBrand,
          cardNumber: card.cardNumber,
          grade: card.grade,
          parallel: card.parallel,
          sport: card.sport,
          photoDataUrl: card.photoDataUrl,
          accent: card.accent,
          estimatedSellPrice: card.estimatedSellPrice,
          conditionType: card.conditionType,
          grader: card.grader,
          isPublic: true,
        }}
        salePrices={onScreenComps.map((comp) => comp.soldPrice)}
        canShow
        compsReady={sold.status === "ready"}
        compsLoading={compsLoading}
        needsLogin={!userId}
      />

      {people ? (
        <CardPeopleSections data={people} />
      ) : (
        <CardOwnersSection
          card={{
            id: card.id,
            playerName: card.playerName,
            year: card.year,
            yearLabel: card.yearLabel,
            setBrand: card.setBrand,
            cardNumber: card.cardNumber,
            parallel: card.parallel,
            grade: card.grade,
            conditionType: card.conditionType,
            grader: card.grader,
          }}
        />
      )}

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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 min-w-0 text-[clamp(1.25rem,5vw,1.5rem)] font-semibold tracking-tight tabular-nums whitespace-nowrap">
        {value}
      </p>
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
