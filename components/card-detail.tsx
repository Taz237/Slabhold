"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { CardCollectorsSaying } from "@/components/card-collectors-saying";
import { CardOwnersSection } from "@/components/card-owners";
import { WantButton } from "@/components/want-button";
import { CategoryBadge, CategoryPicker } from "@/components/category-picker";
import { useCollection } from "@/components/collection-provider";
import { CardThumb } from "@/components/card-thumb";
import { CompBasis } from "@/components/comp-basis";
import { CompsList } from "@/components/comps-list";
import { FairPriceCheck } from "@/components/fair-price-check";
import { ValueChart } from "@/components/value-chart";
import { useSocial } from "@/components/social-provider";
import { cardCategory } from "@/lib/card-category";
import { basedOnSalesLabel, resolveCardScreenValue } from "@/lib/comps/shared-value";
import { useSoldComps } from "@/lib/comps/use-sold-comps";
import {
  cardSubtitle,
  cardTitle,
  formatDate,
  formatPaidLabel,
  hasPaid,
  isSold,
  money,
  pct,
  signedMoney,
} from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  formatCardValueLabel,
  NOT_ENOUGH_SALES_LABEL,
} from "@/lib/value/format";
import { needsDetails } from "@/lib/types";
import { useCardValue } from "@/lib/value/use-card-values";

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

  const { value: cardValue, loading: valueLoading } = useCardValue(card?.id ?? null);
  const sold = useSoldComps(user ? (card?.id ?? null) : null);

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
  const authRequired = !user || sold.status === "auth_required";
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
    card: {
      playerName: card.playerName,
      year: card.year,
      yearLabel: card.yearLabel,
      setBrand: card.setBrand,
      cardNumber: card.cardNumber,
      noNumber: card.noNumber,
      parallel: card.parallel,
      serialRun: card.serialRun,
      isAuto: card.isAuto,
      isRelic: card.isRelic,
      conditionType: card.conditionType,
      grade: card.grade,
      gradeQualifier: card.gradeQualifier,
      isRookie: card.isRookie,
    },
    hiddenItemIds: flaggedIds,
    stored: cardValue,
  });
  const compsLoading = priced.phase === "loading";
  const onScreenComps = priced.phase === "comps" ? (priced.comps ?? []) : [];

  const estSell = cardSold ? card.sellPrice! : priced.amount;

  const paid = card.purchasePrice;
  const paidKnown = hasPaid(card);
  const delta = estSell != null && paidKnown ? estSell - (paid as number) : 0;
  const showProfit = (cardSold || estSell != null) && paidKnown;
  const profitPctValue = showProfit ? delta / (paid as number) : null;
  const max = Math.max(paidKnown ? (paid as number) : 0, estSell ?? 0, 1);
  const valueStatusLabel = cardSold
    ? null
    : priced.phase === "comps"
      ? priced.emptyLabel
      : compsLoading || valueLoading
        ? null
        : formatCardValueLabel(cardValue, { createdAt: card.createdAt });

  function markSold() {
    const price = Number(sellPrice);
    if (!price || !card) return;
    updateCard(card.id, {
      sellPrice: price,
      sellDate: new Date().toISOString().slice(0, 10),
    });
    setSellPrice("");
  }

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
            {card.isRookie ? (
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:text-sky-300">
                Rookie
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {card.playerName}
          </h1>
          <div className="mt-3">
            <WantButton card={card} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">{cardSubtitle(card)}</p>
          {needsDetails(card) ? (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <Link
                href={`/cards/${card.id}/edit`}
                className="underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
              >
                Add missing details for accurate prices
              </Link>
            </p>
          ) : null}
          <CardSpecs card={card} />
          {card.notes ? (
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {card.notes}
            </p>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric
              label="Paid"
              value={formatPaidLabel(card.purchasePrice, true)}
            />
            <EstSellMetric
              cardSold={cardSold}
              soldPrice={card.sellPrice}
              loading={!cardSold && (compsLoading || (priced.phase !== "comps" && valueLoading))}
              amount={priced.amount}
              count={priced.count}
              basis={priced.basis}
              sample={usingSample}
              lowConfidence={
                priced.phase === "comps" && priced.count > 0 && priced.count < 5
              }
              statusLabel={
                priced.phase === "comps"
                  ? (priced.emptyLabel ?? NOT_ENOUGH_SALES_LABEL)
                  : valueStatusLabel
              }
            />
            <Metric
              label="Profit"
              value={
                showProfit && profitPctValue != null
                  ? `${signedMoney(delta, true)} ${pct(profitPctValue)}`
                  : compsLoading || valueLoading
                    ? "…"
                    : "—"
              }
              tone={
                !showProfit ? undefined : delta >= 0 ? "up" : "down"
              }
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
            <div className="mt-6 flex max-w-sm flex-col gap-2">
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
                className="w-full rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium whitespace-nowrap text-white dark:bg-zinc-100 dark:text-zinc-950"
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
              {cardSold ? "Closed flip" : "Open position"}
              {" · "}
              {showProfit ? signedMoney(delta, true) : "—"}
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <Bar
            label="Paid"
            value={paid ?? 0}
            max={max}
            color="bg-zinc-400 dark:bg-zinc-500"
            empty={!paidKnown}
          />
          <Bar
            label={cardSold ? "Sold" : "Estimated sell"}
            value={estSell ?? 0}
            max={max}
            color={
              estSell == null
                ? "bg-zinc-300 dark:bg-zinc-600"
                : delta >= 0
                  ? "bg-emerald-500"
                  : "bg-rose-500"
            }
            empty={!cardSold && estSell == null}
          />
        </div>
      </section>

      {authRequired ? null : unavailable || rateLimited ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Sold data unavailable, try again shortly
        </p>
      ) : (
        <ValueChart
          card={{
            id: card.id,
            estimatedSellPrice: estSell ?? card.estimatedSellPrice,
            purchasePrice: paid ?? 0,
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
          unavailable={false}
          hideStatusLabel
        />
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
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
                            priced.count < 5 ? " · Low confidence" : ""
                          }${
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
            userId={user?.id ?? null}
            canFlag={Boolean(user)}
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
          isPublic: card.isPublic,
        }}
        salePrices={onScreenComps.map((comp) => comp.soldPrice)}
        canShow
        compsReady={priced.phase === "comps"}
        compsLoading={compsLoading}
        needsLogin={!user}
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
        }}
      />

      <CardCollectorsSaying cardId={card.id} />
    </div>
  );
}

function EstSellMetric({
  cardSold,
  soldPrice,
  loading,
  amount,
  count,
  basis,
  lowConfidence,
  sample = false,
  statusLabel,
}: {
  cardSold: boolean;
  soldPrice: number | null;
  loading: boolean;
  amount: number | null;
  count: number;
  basis: { date: string; price: number; grade: string }[];
  lowConfidence: boolean;
  sample?: boolean;
  statusLabel: string | null;
}) {
  if (cardSold) {
    return (
      <Metric
        label="Sold"
        value={soldPrice != null ? money(soldPrice, true) : "—"}
      />
    );
  }
  if (loading) {
    return <Metric label="Est. sell" value="…" />;
  }

  if (amount != null) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-white/10 dark:bg-black/20">
        <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Est. sell</p>
        <p className="mt-1 text-lg font-semibold">{money(amount, true)}</p>
        {sample ? (
          <p className="mt-0.5 text-[11px] text-zinc-500">Sample estimate</p>
        ) : null}
        <CompBasis count={count} basis={basis} />
        {lowConfidence ? (
          <span className="mt-1 inline-block rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
            Low confidence
          </span>
        ) : null}
      </div>
    );
  }

  return <Metric label="Est. sell" value={statusLabel ?? NOT_ENOUGH_SALES_LABEL} />;
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
  empty = false,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  empty?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-800 dark:text-zinc-200">
          {empty ? "—" : money(value, true)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${color}`}
          style={{
            width: empty ? "0%" : `${Math.min(100, (value / max) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

const fieldClass =
  "flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500";
