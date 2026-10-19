"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CardCollectorsSaying } from "@/components/card-collectors-saying";
import { CardOwnersSection } from "@/components/card-owners";
import { WantButton } from "@/components/want-button";
import { CardThumb } from "@/components/card-thumb";
import { CompBasis } from "@/components/comp-basis";
import { CompsList } from "@/components/comps-list";
import { FairPriceCheck } from "@/components/fair-price-check";
import { useCollection } from "@/components/collection-provider";
import { ProfileSkeleton } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { ValueChart } from "@/components/value-chart";
import { isCardOwner } from "@/lib/comps/ownership";
import { basedOnSalesLabel, resolveCardScreenValue } from "@/lib/comps/shared-value";
import { useSoldComps } from "@/lib/comps/use-sold-comps";
import { cardTitle, formatPaidLabel, money } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";
import type { PublicCard } from "@/lib/social/types";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  formatCardValueLabel,
  NOT_ENOUGH_SALES_LABEL,
} from "@/lib/value/format";
import { useCardValue } from "@/lib/value/use-card-values";

export function PublicCardView({ username, id }: { username: string; id: string }) {
  const social = useSocial();
  const { cards, ready: cardsReady } = useCollection();
  const profile = social.profileByUsername(username);
  const isOwn = Boolean(profile && social.user && profile.id === social.user.id);

  if (!social.ready || (isOwn && !cardsReady)) return <ProfileSkeleton />;

  const backHref = `/u/${username}?tab=collection`;

  if (!profile) {
    return (
      <Missing
        title="Profile not found"
        detail="That collector isn't on Slabhold."
        href="/"
        label="Back to Timeline"
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

  return (
    <PublicCardAnalytics
      card={card}
      displayName={profile.displayName}
      backHref={backHref}
      userId={social.user?.id ?? null}
      canFlag={isCardOwner(profile.id, social.user?.id ?? null)}
    />
  );
}

function PublicCardAnalytics({
  card,
  displayName,
  backHref,
  userId,
  canFlag,
}: {
  card: PublicCard;
  displayName: string;
  backHref: string;
  userId: string | null;
  canFlag: boolean;
}) {
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const specs = [
    card.sport ? { label: "Sport", value: card.sport } : null,
    card.cardNumber.trim() && card.cardNumber.trim() !== "—"
      ? { label: "No.", value: `#${card.cardNumber.trim()}` }
      : null,
    card.parallel?.trim() ? { label: "Parallel", value: card.parallel.trim() } : null,
    card.grade?.trim() ? { label: "Grade", value: card.grade.trim() } : null,
  ].filter((spec): spec is { label: string; value: string } => Boolean(spec));
  // Paid is private — only present when viewing your own card from the collection.
  const showPaid =
    typeof card.purchasePrice === "number" && Number.isFinite(card.purchasePrice);

  const { value: cardValue, loading: valueLoading } = useCardValue(card.id);
  const sold = useSoldComps(userId ? card.id : null);

  useEffect(() => {
    if (!canFlag || !userId) {
      setFlaggedIds(new Set());
      return;
    }
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from("comp_flags")
      .select("item_id")
      .eq("card_id", card.id)
      .eq("user_id", userId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setFlaggedIds(new Set(data.map((row) => row.item_id as string)));
      });
    return () => {
      cancelled = true;
    };
  }, [canFlag, userId, card.id]);

  const authRequired = !userId || sold.status === "auth_required";
  const rateLimited = sold.status === "rate_limited";
  const unavailable = sold.status === "unavailable";
  const usingLive = sold.data?.source === "trawl" && !sold.data.sample;
  const usingSample =
    sold.status === "ready" &&
    (sold.data?.sample === true ||
      sold.data?.source === "sample" ||
      sold.data?.source === "off");
  const compsPhase =
    authRequired
      ? "auth"
      : sold.status === "ready"
        ? "ready"
        : unavailable || rateLimited
          ? "unavailable"
          : "loading";
  const priced = resolveCardScreenValue({
    phase: compsPhase,
    comps: sold.status === "ready" ? (sold.data?.comps ?? []) : null,
    hiddenItemIds: flaggedIds,
    stored: cardValue,
  });
  const compsLoading = priced.phase === "loading";
  const onScreenComps = priced.phase === "comps" ? (priced.comps ?? []) : [];
  const displayEst = priced.amount;
  const showChart = !authRequired && !unavailable && !rateLimited;

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
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{card.playerName}</h1>
          <WantButton card={card} />
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
      </div>

      <section className={`grid gap-3 ${showPaid ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Estimated value</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {compsLoading || (priced.phase !== "comps" && valueLoading)
              ? "…"
              : displayEst != null
                ? money(displayEst, true)
                : priced.phase === "comps"
                  ? NOT_ENOUGH_SALES_LABEL
                  : formatCardValueLabel(cardValue)}
          </p>
          {displayEst != null ? (
            <>
              {usingSample ? (
                <p className="mt-1 text-xs text-zinc-500">Sample estimate</p>
              ) : null}
              <CompBasis count={priced.count} basis={priced.basis} />
            </>
          ) : null}
          {priced.phase === "comps" && priced.count > 0 && priced.count < 5 ? (
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

      {authRequired ? null : unavailable || rateLimited ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Sold data unavailable, try again shortly
        </p>
      ) : showChart ? (
        <ValueChart
          card={{
            id: card.id,
            estimatedSellPrice: displayEst ?? card.estimatedSellPrice,
            purchasePrice: card.purchasePrice ?? 0,
          }}
          points={priced.phase === "comps" && usingLive ? sold.data?.history : null}
          source={sold.data?.source ?? (usingSample ? "sample" : "trawl")}
          loading={compsLoading}
          median={priced.amount}
          p25={priced.low}
          p75={priced.high}
          count={priced.count}
          sample={usingSample}
          lockedToComps={priced.phase === "comps"}
          noSalesLabel={NOT_ENOUGH_SALES_LABEL}
          hideStatusLabel
        />
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Recent sales</h2>
            {authRequired ? null : (
              <p className="text-xs text-zinc-500">
                {compsLoading
                  ? "Loading sold listings…"
                  : unavailable || rateLimited
                    ? "Sold data unavailable, try again shortly"
                    : priced.phase === "comps"
                      ? priced.count === 0
                        ? NOT_ENOUGH_SALES_LABEL
                        : `${basedOnSalesLabel(priced.count)}${
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
          <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
            <Link href="/login" className="font-semibold underline underline-offset-2">
              Log in
            </Link>{" "}
            to see sold comps
          </p>
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
        ) : unavailable || rateLimited ? null : priced.phase === "comps" && onScreenComps.length > 0 ? (
          <CompsList
            comps={onScreenComps}
            cardId={card.id}
            userId={userId}
            canFlag={canFlag}
            flaggedIds={flaggedIds}
            onFlagged={(itemId) =>
              setFlaggedIds((prev) => new Set(prev).add(itemId))
            }
          />
        ) : null}
      </section>

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
        compsReady={priced.phase === "comps"}
        compsLoading={compsLoading}
        needsLogin={!userId}
      />

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
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
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
