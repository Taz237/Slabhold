"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { CategoryBadge, CategoryPicker } from "@/components/category-picker";
import { useCollection } from "@/components/collection-provider";
import { CardThumb } from "@/components/card-thumb";
import { CompsList } from "@/components/comps-list";
import { ValueChart } from "@/components/value-chart";
import { useSocial } from "@/components/social-provider";
import { cardCategory } from "@/lib/card-category";
import { mockCompsForCard } from "@/lib/comps/sample";
import { middleFifty } from "@/lib/comps/stats";
import { useSoldComps } from "@/lib/comps/use-sold-comps";
import {
  cardSubtitle,
  cardTitle,
  formatDate,
  isSold,
  money,
  pct,
  profit,
  profitPct,
  signedMoney,
} from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export function CardDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useSocial();
  const { ready, getCard, updateCard, removeCard } = useCollection();
  const card = getCard(id);
  const [sellPrice, setSellPrice] = useState("");
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id || !card?.id) {
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
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setFlaggedIds(new Set(data.map((row) => row.item_id as string)));
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, card?.id]);

  const soldQuery = useMemo(
    () =>
      card
        ? {
            id: card.id,
            playerName: card.playerName,
            year: card.year,
            setBrand: card.setBrand,
            cardNumber: card.cardNumber,
            grade: card.grade,
            estimatedSellPrice: card.estimatedSellPrice,
          }
        : null,
    [card],
  );
  const sold = useSoldComps(soldQuery);
  const sampleComps = useMemo(() => (card ? mockCompsForCard(card) : []), [card]);

  const usingLive = sold.data?.source === "trawl" && !sold.data.sample;
  const showSampleBanner = !usingLive;
  const liveComps = usingLive ? sold.data!.comps : null;
  const compsLoading = sold.status === "loading";

  const compsForList = useMemo(() => {
    const base = usingLive ? (liveComps ?? []).slice(0, 15) : sampleComps;
    return base.filter((c) => !flaggedIds.has(c.itemId));
  }, [usingLive, liveComps, sampleComps, flaggedIds]);

  const liveStats = useMemo(() => {
    if (!usingLive) return null;
    const prices = compsForList.map((c) => c.soldPrice);
    return middleFifty(prices);
  }, [usingLive, compsForList]);

  if (!ready) {
    return (
      <div className="h-64 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
    );
  }

  if (!card) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-medium">Card not found</p>
        <Link href="/collection" className="mt-3 inline-block text-sm text-violet-700 dark:text-violet-300">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const cardSold = isSold(card);
  const delta = profit(card);
  const compare = cardSold ? card.sellPrice! : card.estimatedSellPrice;
  const max = Math.max(card.purchasePrice, compare, 1);

  function markSold() {
    const price = Number(sellPrice);
    if (!price || !card) return;
    updateCard(card.id, {
      sellPrice: price,
      sellDate: new Date().toISOString().slice(0, 10),
    });
    setSellPrice("");
  }

  const liveCount = compsForList.length;
  const liveMedian =
    liveStats?.median != null ? Math.round(liveStats.median) : sold.data?.median ?? null;
  const liveP25 =
    liveStats?.p25 != null ? Math.round(liveStats.p25) : sold.data?.p25 ?? null;
  const liveP75 =
    liveStats?.p75 != null ? Math.round(liveStats.p75) : sold.data?.p75 ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/collection"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Collection
        </Link>
        <div className="flex gap-2">
          <Link
            href={`/cards/${card.id}/edit`}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1.5 text-sm hover:bg-zinc-200 dark:bg-white/10 dark:hover:bg-white/15"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete ${card.playerName}?`)) return;
              removeCard(card.id);
              router.push("/");
            }}
            className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      <section className="grid gap-6 md:grid-cols-[220px_1fr]">
        <CardThumb
          card={card}
          className="mx-auto h-72 w-48 rounded-2xl shadow-xl shadow-black/20 md:mx-0"
        />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-zinc-500">{cardTitle(card)}</p>
            <CategoryBadge card={card} />
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {card.playerName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{cardSubtitle(card)}</p>
          <CardSpecs card={card} />
          {card.notes ? (
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {card.notes}
            </p>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="Paid" value={money(card.purchasePrice, true)} />
            <Metric
              label={cardSold ? "Sold" : "Est. sell"}
              value={money(compare, true)}
            />
            <Metric
              label="Profit"
              value={`${signedMoney(delta, true)} ${pct(profitPct(card))}`}
              tone={delta >= 0 ? "up" : "down"}
            />
          </div>

          <div className="mt-5 max-w-sm">
            <p className="mb-2 text-sm text-zinc-500">Move this card</p>
            <CategoryPicker
              value={cardCategory(card)}
              onChange={(category) => updateCard(card.id, { category })}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
            <span>
              Bought {formatDate(card.purchaseDate)}
              {cardSold ? ` · Sold ${formatDate(card.sellDate)}` : " · Still held"}
            </span>
            <button
              type="button"
              onClick={() => updateCard(card.id, { isPublic: !card.isPublic })}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                card.isPublic
                  ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
              }`}
            >
              {card.isPublic ? "Public on profile" : "Private"}
            </button>
          </div>

          {!cardSold && (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <input
                type="number"
                min={0}
                step="0.01"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="Sold price"
                className={fieldClass}
              />
              <button
                type="button"
                onClick={markSold}
                className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-950"
              >
                Mark as sold
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Paid vs {cardSold ? "sold" : "estimate"}</h2>
            <p className="text-xs text-zinc-500">
              {cardSold ? "Closed flip" : "Open position"} · {signedMoney(delta, true)}
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <Bar
            label="Paid"
            value={card.purchasePrice}
            max={max}
            color="bg-zinc-400 dark:bg-zinc-500"
          />
          <Bar
            label={cardSold ? "Sold" : "Estimated sell"}
            value={compare}
            max={max}
            color={delta >= 0 ? "bg-emerald-500" : "bg-rose-500"}
          />
        </div>
      </section>

      <ValueChart
        card={card}
        points={usingLive ? sold.data?.history : null}
        source={sold.data?.source ?? "sample"}
        loading={compsLoading}
        median={usingLive ? liveMedian : null}
        p25={usingLive ? liveP25 : null}
        p75={usingLive ? liveP75 : null}
        count={usingLive ? liveCount : 0}
        fetchedAt={sold.data?.fetchedAt ?? null}
        sample={!usingLive}
      />

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Recent sales</h2>
            <p className="text-xs text-zinc-500">
              {compsLoading
                ? "Loading sold listings…"
                : usingLive
                  ? liveCount === 0
                    ? "No recent sales found"
                    : `Based on ${liveCount} sale${liveCount === 1 ? "" : "s"}${
                        liveCount < 5 ? " · Low confidence" : ""
                      }${
                        sold.data?.fetchedAt
                          ? ` · Updated ${formatRelativeTime(sold.data.fetchedAt)}`
                          : ""
                      }`
                  : "Sample listings"}
            </p>
          </div>
        </div>
        {showSampleBanner && !compsLoading ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Showing sample data until live results are available.
          </p>
        ) : null}
        {usingLive && !compsLoading ? (
          <p className="mt-3 text-[11px] text-zinc-400">
            Sold data via Trawl (third-party, not affiliated with eBay)
            {sold.data?.fetchedAt
              ? ` · Updated ${formatRelativeTime(sold.data.fetchedAt)}`
              : null}
          </p>
        ) : null}
        {compsLoading ? (
          <div className="mt-3 space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
              />
            ))}
          </div>
        ) : (
          <CompsList
            comps={usingLive ? (liveComps ?? []).slice(0, 15) : sampleComps}
            cardId={card.id}
            userId={user?.id ?? null}
            flaggedIds={flaggedIds}
            onFlagged={(itemId) =>
              setFlaggedIds((prev) => new Set(prev).add(itemId))
            }
          />
        )}
      </section>
    </div>
  );
}

function CardSpecs({
  card,
}: {
  card: { cardNumber: string; grade: string; parallel: string };
}) {
  const specs = [
    card.cardNumber.trim() && card.cardNumber.trim() !== "—"
      ? { label: "No.", value: `#${card.cardNumber.trim()}` }
      : null,
    card.parallel.trim() ? { label: "Parallel", value: card.parallel.trim() } : null,
    card.grade.trim() ? { label: "Grade", value: card.grade.trim() } : null,
  ].filter((spec): spec is { label: string; value: string } => Boolean(spec));
  if (!specs.length) return null;
  return (
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
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-white/10 dark:bg-black/20">
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          tone === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "down"
              ? "text-rose-600 dark:text-rose-400"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-800 dark:text-zinc-200">
          {money(value, true)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

const fieldClass =
  "flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500";
