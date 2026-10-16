"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CardThumb } from "@/components/card-thumb";
import { CompsList } from "@/components/comps-list";
import { useCollection } from "@/components/collection-provider";
import { ProfileSkeleton } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { ValueChart } from "@/components/value-chart";
import { useSoldComps } from "@/lib/comps/use-sold-comps";
import { cardTitle, money } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";
import type { PublicCard } from "@/lib/social/types";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  formatCardValueLabel,
  isLowConfidenceValue,
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
    />
  );
}

function PublicCardAnalytics({
  card,
  displayName,
  backHref,
  userId,
}: {
  card: PublicCard;
  displayName: string;
  backHref: string;
  userId: string | null;
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
  const showPaid = typeof card.purchasePrice === "number";

  const { value: cardValue, loading: valueLoading } = useCardValue(card.id);
  const sold = useSoldComps(userId ? card.id : null);

  useEffect(() => {
    if (!userId) {
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
  }, [userId, card.id]);

  const authRequired = !userId || sold.status === "auth_required";
  const rateLimited = sold.status === "rate_limited";
  const unavailable = sold.status === "unavailable";
  const usingLive = sold.data?.source === "trawl" && !sold.data.sample;
  const usingSample =
    sold.status === "ready" &&
    (sold.data?.sample === true ||
      sold.data?.source === "sample" ||
      sold.data?.source === "off");
  const compsLoading = Boolean(userId) && sold.status === "loading";
  const liveCount = usingLive ? (sold.data?.count ?? 0) : 0;
  const liveComps = usingLive ? (sold.data?.comps ?? []) : [];
  const displayEst =
    cardValue?.status === "ok" || cardValue?.status === "sample"
      ? cardValue.median
      : null;
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
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{card.playerName}</h1>
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
            {valueLoading
              ? "…"
              : cardValue?.status === "no_sales"
                ? "No sales yet"
                : displayEst != null
                  ? money(displayEst, true)
                  : formatCardValueLabel(cardValue)}
          </p>
          {displayEst != null && cardValue ? (
            <p className="mt-1 text-xs text-zinc-500">
              {cardValue.status === "sample"
                ? "Sample estimate"
                : `Based on ${cardValue.nSales} sale${cardValue.nSales === 1 ? "" : "s"}`}
            </p>
          ) : null}
          {isLowConfidenceValue(cardValue) ? (
            <span className="mt-1 inline-block rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
              Low confidence
            </span>
          ) : null}
        </div>
        {showPaid ? <Metric label="Paid" value={money(card.purchasePrice ?? 0, true)} /> : null}
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
          points={usingLive ? sold.data?.history : null}
          source={sold.data?.source ?? (usingSample ? "sample" : "trawl")}
          loading={compsLoading}
          median={displayEst}
          p25={cardValue?.low ?? null}
          p75={cardValue?.high ?? null}
          count={cardValue?.nSales ?? 0}
          sample={usingSample || cardValue?.status === "sample"}
          noSalesLabel={
            cardValue?.status === "no_sales" ? "No sales yet" : undefined
          }
        />
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Recent sales</h2>
            <p className="text-xs text-zinc-500">
              {authRequired
                ? "Log in to see sold comps"
                : compsLoading
                  ? "Loading sold listings…"
                  : unavailable || rateLimited
                    ? "Sold data unavailable, try again shortly"
                    : usingLive
                      ? liveCount === 0
                        ? "No sales yet"
                        : `Based on ${liveCount} sale${liveCount === 1 ? "" : "s"}${
                            sold.data?.fetchedAt
                              ? ` · Updated ${formatRelativeTime(sold.data.fetchedAt)}`
                              : ""
                          }`
                      : usingSample
                        ? "Sample listings"
                        : ""}
            </p>
          </div>
        </div>
        {authRequired ? (
          <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
            Log in to see sold comps
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
        ) : unavailable || rateLimited ? null : usingLive ? (
          <CompsList
            comps={liveComps}
            cardId={card.id}
            userId={userId}
            flaggedIds={flaggedIds}
            onFlagged={(itemId) =>
              setFlaggedIds((prev) => new Set(prev).add(itemId))
            }
          />
        ) : usingSample ? (
          <CompsList comps={sold.data?.comps ?? []} />
        ) : null}
      </section>
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
  purchasePrice: number;
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
