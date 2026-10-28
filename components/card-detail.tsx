"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { useCompFlagState } from "@/components/use-comp-flags";
import { CardCollectorsSaying } from "@/components/card-collectors-saying";
import { CardAddedPanel } from "@/components/card-added-panel";
import { CardOwnersSection } from "@/components/card-owners";
import { CardPeopleSections } from "@/components/card-people";
import { WantButton } from "@/components/want-button";
import { CategoryPicker } from "@/components/category-picker";
import { FirstCardPrivacyPrompt } from "@/components/first-card-privacy-prompt";
import { SharedPostNote } from "@/components/shared-post-note";
import { useCollection } from "@/components/collection-provider";
import { DealSheet } from "@/components/deal-sheet";
import { MARK_SOLD_LABEL } from "@/lib/deals/state";
import {
  CardDetailPending,
  CardHero,
  CardTopBar,
  SalesChartPending,
  SalesListPending,
  cardPanelClass,
} from "@/components/card-detail-shell";
import { CompBasis } from "@/components/comp-basis";
import { CompsList } from "@/components/comps-list";
import { SimilarCardsLine, EbaySoldLine } from "@/components/price-readout";
import { FairPriceCheck } from "@/components/fair-price-check";
import { SoldFreshness } from "@/components/sold-freshness";
import { useSocial } from "@/components/social-provider";
import { loginPath } from "@/lib/auth/safe-next";
import { publicTogglePatch } from "@/lib/offers/open-to-offers";
import { cardCategory } from "@/lib/card-category";
import {
  dismissFirstCardPrivacyInBrowser,
  readBrowserFirstCardPrivacy,
  subscribeFirstCardPrivacy,
} from "@/lib/collection/first-card-privacy";
import { showAddedPanel } from "@/lib/cards/added-panel";
import type { OwnersAndHunters } from "@/lib/cards/people";
import { gradeDetailSpecs } from "@/lib/cards/grading-company";
import { canonicalParallelName } from "@/lib/cards/parallels";
import { basedOnSalesLabel, countForSalesLabel, valueFromShownSales } from "@/lib/comps/shared-value";
import { soldNotice } from "@/lib/comps/sold-response";
import { useSoldComps } from "@/lib/comps/use-sold-comps";
import {
  cardDatesLine,
  formatPaidLabel,
  hasPaid,
  isSold,
  money,
  pct,
  signedMoney,
} from "@/lib/format";
import {
  cardValueHasAmount,
  estSellTileCopy,
  formatCardValueLabel,
  isLowConfidenceValue,
  shownCardValue,
} from "@/lib/value/format";
import { peekCardValue } from "@/lib/value/card-value-memory";
import type { SportsCard } from "@/lib/types";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { shouldCollapseEmptyPrices } from "@/lib/value/empty-price";
import { NO_SALES_FOUND_LABEL, resolvePriceRead, SIMILAR_CARDS_LABEL } from "@/lib/value/price-fallback";
import { useCardValue } from "@/lib/value/use-card-values";

function subscribeCardValueMemory() {
  return () => {};
}

type SalesChartView = ComponentType<{
  card: { id: string; estimatedSellPrice: number; purchasePrice: number };
  points?: { date: string; label: string; value: number }[] | null;
  source?: "trawl" | "sample" | "off";
  loading?: boolean;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  count?: number;
  sample?: boolean;
  lockedToComps?: boolean;
  noSalesLabel?: string;
  unavailable?: boolean;
  hideStatusLabel?: boolean;
  heading?: string;
  stableLayout?: boolean;
  headlineLabel?: string | null;
  headlineIsEstimate?: boolean;
}>;

type CardFormView = ComponentType<{
  existing?: SportsCard;
  embedded?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
}>;

export function CardDetail({ id, added = false }: { id: string; added?: boolean }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { user } = useSocial();
  const { ready, getCard, updateCard, removeCard } = useCollection();
  const card = getCard(id);
  const [sellPrice, setSellPrice] = useState("");
  const [editing, setEditing] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addedDismissed, setAddedDismissed] = useState(false);
  const privacyNudge = useSyncExternalStore(
    subscribeFirstCardPrivacy,
    () => readBrowserFirstCardPrivacy(user?.id ?? null, card?.id ?? null, Boolean(card?.isPublic)),
    () => false,
  );
  const [ValueChart, setValueChart] = useState<SalesChartView | null>(null);
  const [chartFailed, setChartFailed] = useState(false);
  const [chartAttempt, setChartAttempt] = useState(0);
  const [CardForm, setCardForm] = useState<CardFormView | null>(null);
  const [formFailed, setFormFailed] = useState(false);
  const [formAttempt, setFormAttempt] = useState(0);
  const remembered = useSyncExternalStore(
    subscribeCardValueMemory,
    () => (card?.id ? peekCardValue(card.id) : null),
    () => null,
  );
  const editorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  const {
    value: cardValue,
    loading: valueLoading,
    errorMessage,
    retry: retryValue,
  } = useCardValue(card?.id ?? null);
  const sold = useSoldComps(user ? (card?.id ?? null) : null);
  const flags = useCompFlagState(
    card?.id ?? null,
    Boolean(user && card),
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

  useEffect(() => {
    let cancelled = false;
    void import("@/components/value-chart")
      .then((mod) => {
        if (cancelled) return;
        setChartFailed(false);
        setValueChart(() => mod.ValueChart);
      })
      .catch(() => {
        if (!cancelled) setChartFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [chartAttempt]);

  useEffect(() => {
    // Drop ?added=1 so a refresh does not show the panel again.
    if (added) window.history.replaceState(null, "", pathname);
  }, [added, pathname]);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    void import("@/components/card-form")
      .then((mod) => {
        if (cancelled) return;
        setFormFailed(false);
        setCardForm(() => mod.CardForm);
      })
      .catch(() => {
        if (!cancelled) setFormFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, formAttempt]);

  useEffect(() => {
    if (!editing) return;
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [menuOpen]);

  if (!ready) return <CardDetailPending id={id} />;

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
  const soldCopy = soldNotice(sold.status, sold.message);
  const usingLive = sold.data?.source === "trawl" && !sold.data.sample;
  const usingSample =
    sold.status === "ready" &&
    (sold.data?.sample === true ||
      sold.data?.source === "sample" ||
      sold.data?.source === "off");
  const compsLoading = Boolean(user) && (sold.status === "loading" || sold.status === "idle");
  const onScreenComps = sold.status === "ready" ? flags.visible : [];
  const shownValue =
    sold.status === "ready"
      ? valueFromShownSales(onScreenComps, flags.priced ?? cardValue)
      : (flags.priced ?? cardValue ?? remembered);
  const salesCount = countForSalesLabel(
    cardValueHasAmount(shownValue) ? shownValue.nSales : null,
    sold.status === "ready" ? onScreenComps.length : null,
  );
  const storedAmount = shownCardValue(card, shownValue);
  const earlyValue = cardValue ?? remembered;
  const ebayHref = ebaySoldSearchUrlForCard(card);
  const exactSales =
    sold.status === "ready"
      ? onScreenComps.map((comp) => ({ price: comp.soldPrice, soldAt: comp.soldDate }))
      : undefined;
  const priceRead = resolvePriceRead({
    value: shownValue,
    createdAt: card.createdAt,
    exactSales,
    similar: cardValue?.similar ?? remembered?.similar ?? null,
    ebayHref,
    card,
  });
  const pricePending = (!cardSold && valueLoading && !earlyValue) || (compsLoading && !earlyValue);
  const pendingLabel = pricePending
    ? null
    : priceRead?.kind === "similar"
      ? SIMILAR_CARDS_LABEL
      : (priceRead?.text ?? null);

  const estSell = cardSold ? card.sellPrice! : priceRead?.kind === "estimate" ? storedAmount : null;
  const paid = card.purchasePrice;
  const paidKnown = hasPaid(card);
  const delta = estSell != null && paidKnown ? estSell - (paid as number) : 0;
  const showProfit = (cardSold || estSell != null) && paidKnown;
  const profitPctValue = showProfit ? delta / (paid as number) : null;
  const max = Math.max(paidKnown ? (paid as number) : 0, estSell ?? 0, 1);
  const rawValueLabel = cardSold
    ? null
    : valueLoading && !flags.priced && !earlyValue
      ? null
      : formatCardValueLabel(shownValue, { createdAt: card.createdAt });
  const collapsePrices = shouldCollapseEmptyPrices({
    loading: (!cardSold && valueLoading && !earlyValue) || compsLoading,
    blocked: authRequired || rateLimited || unavailable,
    settled: sold.status === "ready",
    hasEstimate: priceRead?.kind === "estimate",
    hasSales: onScreenComps.length > 0,
  });
  const valueStatusLabel = rawValueLabel;
  const showChart =
    ValueChart != null &&
    sold.status === "ready" &&
    !collapsePrices &&
    !authRequired &&
    !soldCopy;

  function dismissPrivacyNudge() {
    if (user) dismissFirstCardPrivacyInBrowser(user.id);
  }

  function markSold() {
    const price = Number(sellPrice);
    if (!price || !card) return;
    updateCard(card.id, {
      sellPrice: price,
      sellDate: new Date().toISOString().slice(0, 10),
    });
    setSellPrice("");
  }

  function toggleEdit() {
    setMenuOpen(false);
    setFormFailed(false);
    setEditing((open) => !open);
  }

  function toggleMenu() {
    setEditing(false);
    setMenuOpen((open) => !open);
  }

  return (
    <div className="space-y-6">
      {dealOpen ? <DealSheet fixedCard={card} onClose={() => setDealOpen(false)} /> : null}
      <CardTopBar
        editing={editing}
        menuOpen={menuOpen}
        onEdit={toggleEdit}
        onMenu={toggleMenu}
      />

      {/* card comes from the viewer's own collection, and the page is owner-only. */}
      {showAddedPanel({ added, owned: Boolean(card), dismissed: addedDismissed }) ? (
        <CardAddedPanel
          cardId={card.id}
          value={cardValue}
          loading={valueLoading}
          onDismiss={() => setAddedDismissed(true)}
          onSeeSales={scrollToSales}
        />
      ) : null}

      <CardHero
        card={card}
        onFixDetails={() => {
          setMenuOpen(false);
          setFormFailed(false);
          setEditing(true);
        }}
      />

      {editing ? null : (
        <section aria-label="Visibility and collection" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                updateCard(card.id, publicTogglePatch(card, !card.isPublic));
                if (!card.isPublic) dismissPrivacyNudge();
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                card.isPublic
                  ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
              }`}
            >
              {card.isPublic ? "Public on profile" : "Private"}
            </button>
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-sm text-zinc-500">Move this card</p>
            <CategoryPicker
              value={cardCategory(card)}
              onChange={(category) => updateCard(card.id, { category })}
            />
          </div>
        </section>
      )}

      <SharedPostNote key={card.id} cardId={card.id} />

      {privacyNudge ? (
        <FirstCardPrivacyPrompt
          onToggle={() => {
            updateCard(card.id, { isPublic: !card.isPublic });
            dismissPrivacyNudge();
          }}
          onDismiss={dismissPrivacyNudge}
        />
      ) : null}

      {editing ? (
        <div ref={editorRef} className="scroll-mt-24">
          {CardForm ? (
            <CardForm
              existing={card}
              embedded
              onCancel={() => setEditing(false)}
              onSaved={() => setEditing(false)}
            />
          ) : formFailed ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Couldn&apos;t load the edit form.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFormFailed(false);
                  setCardForm(null);
                  setFormAttempt((attempt) => attempt + 1);
                }}
                className="mt-3 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500"
              >
                Try again
              </button>
            </div>
          ) : (
            <div
              className="h-40 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5"
              aria-busy="true"
            />
          )}
        </div>
      ) : null}

      {menuOpen ? (
        <section
          id="card-actions"
          ref={menuRef}
          className={`${cardPanelClass} scroll-mt-24 space-y-5`}
        >
          <div>
            <h2 className="font-semibold">Value</h2>
            <div className="mt-3 grid min-w-0 grid-cols-2 gap-3">
              <Metric label="Paid" value={formatPaidLabel(card.purchasePrice, true)} />
              <EstSellMetric
                cardSold={cardSold}
                soldPrice={card.sellPrice}
                loading={!cardSold && valueLoading && !flags.priced && !earlyValue}
                label={
                  priceRead && priceRead.kind !== "estimate"
                    ? priceRead.kind === "similar"
                      ? `${SIMILAR_CARDS_LABEL} · ${priceRead.detail}`
                      : priceRead.text
                    : valueStatusLabel
                }
                asEstimate={priceRead?.kind === "estimate" || priceRead == null}
                count={priceRead?.kind === "estimate" ? (shownValue?.nSales ?? 0) : 0}
                sample={shownValue?.status === "sample"}
                lowConfidence={priceRead?.kind === "estimate" && isLowConfidenceValue(shownValue)}
              />
              <Metric
                label="Profit"
                value={
                  showProfit && profitPctValue != null
                    ? `${signedMoney(delta, true)} ${pct(profitPctValue)}`
                    : valueLoading && !flags.priced && !earlyValue
                      ? "…"
                      : "—"
                }
                tone={!showProfit ? undefined : delta >= 0 ? "up" : "down"}
              />
            </div>
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium">
                Paid vs {cardSold ? "sold" : priceRead.kind === "estimate" ? "estimate" : "price"}
              </p>
              <p className="text-xs text-zinc-500">
                {cardSold ? "Closed flip" : "Open position"}
                {" · "}
                {showProfit ? signedMoney(delta, true) : "—"}
              </p>
              <Bar
                label="Paid"
                value={paid ?? 0}
                max={max}
                color="bg-zinc-400 dark:bg-zinc-500"
                empty={!paidKnown}
              />
              <Bar
                label={cardSold ? "Sold" : priceRead.kind === "estimate" ? "Estimated sell" : "Price"}
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
          </div>

          <CardSpecs card={card} />
          {card.notes ? (
            <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{card.notes}</p>
          ) : null}
          <p className="text-sm text-zinc-500">
            {cardDatesLine({
              purchaseDate: card.purchaseDate,
              sold: cardSold,
              soldDate: (card.sellDate || card.soldAt || "").slice(0, 10),
            })}
          </p>

          <WantButton
            card={card}
            fairLow={storedAmount != null ? (shownValue?.low ?? null) : null}
            fairHigh={storedAmount != null ? (shownValue?.high ?? null) : null}
          />

          {!cardSold ? (
            <div className="flex max-w-sm flex-col gap-2">
              <button
                type="button"
                onClick={() => setDealOpen(true)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-violet-600 px-5 text-sm font-medium text-white hover:bg-violet-500"
              >
                {MARK_SOLD_LABEL}
              </button>
              <p className="text-sm text-zinc-500">Or record a price yourself</p>
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
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-violet-600 px-5 text-sm font-medium whitespace-nowrap text-white hover:bg-violet-500"
              >
                Mark as sold
              </button>
            </div>
          ) : null}

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
            compsReady={sold.status === "ready"}
            compsLoading={compsLoading}
            needsLogin={!user}
          />

          <div>
            <h2 className="font-semibold">Owners and hunters</h2>
            <div className="mt-3">
              <CardPeoplePanel id={card.id} card={card} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete ${card.playerName}?`)) return;
              removeCard(card.id);
              router.push("/");
            }}
            className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
          >
            Delete
          </button>
        </section>
      ) : null}

      {errorMessage ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {errorMessage}
        </p>
      ) : null}

      {showChart && ValueChart ? (
        <div data-slot="sales-chart" className="contents">
          <ValueChart
            card={{
              id: card.id,
              estimatedSellPrice: storedAmount ?? 0,
              purchasePrice: paid ?? 0,
            }}
            points={usingLive ? sold.data?.history : null}
            source={sold.data?.source ?? (usingSample ? "sample" : "trawl")}
            loading={false}
            median={priceRead?.kind === "estimate" ? storedAmount : null}
            p25={priceRead?.kind === "estimate" ? (shownValue?.low ?? null) : null}
            p75={priceRead?.kind === "estimate" ? (shownValue?.high ?? null) : null}
            count={priceRead?.kind === "estimate" ? (shownValue?.nSales ?? 0) : onScreenComps.length}
            sample={shownValue?.status === "sample"}
            lockedToComps
            noSalesLabel={NO_SALES_FOUND_LABEL}
            unavailable={false}
            hideStatusLabel
            heading="Recent sales"
            stableLayout
            headlineLabel={
              priceRead && priceRead.kind !== "estimate"
                ? priceRead.kind === "similar"
                  ? SIMILAR_CARDS_LABEL
                  : priceRead.text
                : undefined
            }
            headlineIsEstimate={priceRead?.kind === "estimate"}
          />
        </div>
      ) : collapsePrices ? (
        <section data-slot="sales-chart" className={cardPanelClass}>
          <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Recent sales</p>
          <div className="mt-1 flex min-h-9 items-end">
            <p className="text-lg font-semibold tracking-tight">
              {priceRead?.kind === "similar" ? SIMILAR_CARDS_LABEL : (priceRead?.text ?? NO_SALES_FOUND_LABEL)}
            </p>
          </div>
          <p className="mt-1 min-h-5 text-sm text-zinc-500">&nbsp;</p>
          <div className="mt-3 flex h-44 items-center">
            {priceRead?.kind === "similar" ? (
              <SimilarCardsLine read={priceRead} />
            ) : priceRead?.showEbaySold && ebayHref ? (
              <EbaySoldLine href={ebayHref} />
            ) : null}
          </div>
        </section>
      ) : chartFailed && !authRequired && !soldCopy ? (
        <section data-slot="sales-chart" className={cardPanelClass}>
          <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Recent sales</p>
          <div className="mt-1 flex min-h-9 items-end">
            {priceRead?.kind === "estimate" && pendingLabel ? (
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{pendingLabel}</p>
            ) : pendingLabel ? (
              <p className="text-lg font-semibold tracking-tight">{pendingLabel}</p>
            ) : (
              <div className="h-9 w-32 rounded-lg bg-zinc-100 dark:bg-white/5" />
            )}
          </div>
          <p className="mt-1 min-h-5 text-sm text-zinc-500">&nbsp;</p>
          <div className="mt-3 flex h-44 flex-col items-center justify-center gap-3 rounded-xl bg-zinc-100 px-4 text-center dark:bg-white/5">
            <p className="text-sm text-zinc-500">Couldn&apos;t load the sales graph</p>
            <button
              type="button"
              onClick={() => {
                setChartFailed(false);
                setValueChart(null);
                setChartAttempt((attempt) => attempt + 1);
              }}
              className="inline-flex min-h-9 items-center rounded-full bg-violet-600 px-3.5 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Retry
            </button>
          </div>
        </section>
      ) : (
        <SalesChartPending
          priceLabel={pendingLabel}
          priceIsEstimate={priceRead?.kind === "estimate"}
          note={
            authRequired
              ? "Log in to see sold comps"
              : soldCopy
          }
          busy={compsLoading && !soldCopy && !authRequired}
        />
      )}

      {compsLoading && !authRequired ? (
        <SalesListPending />
      ) : (
        <section data-slot="sales-list" className={cardPanelClass}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-semibold">Recent sales</h2>
              {authRequired ? null : (
                <p className="text-xs text-zinc-500">
                  {soldCopy
                    ? soldCopy
                    : sold.status === "ready"
                      ? onScreenComps.length === 0
                        ? priceRead?.kind === "similar"
                          ? SIMILAR_CARDS_LABEL
                          : (priceRead?.text ?? NO_SALES_FOUND_LABEL)
                        : (
                            <>
                              {basedOnSalesLabel(salesCount)}
                              {salesCount < 5 ? " · Low confidence" : ""}
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
            <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              <Link href={loginPath(pathname)} className="font-semibold underline underline-offset-2">
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
          {authRequired || unavailable || rateLimited ? null : sold.status === "ready" &&
            (onScreenComps.length > 0 || flags.hidden.length > 0) ? (
            <CompsList
              comps={onScreenComps}
              cardId={card.id}
              canFlag={Boolean(user)}
              hidden={flags.hidden}
              onFlag={flags.flag}
              onRestore={flags.restore}
              toast={flags.toast}
              onUndo={flags.undo}
            />
          ) : collapsePrices ? (
            <p className="mt-3 text-sm text-zinc-500">No sales to show</p>
          ) : null}
        </section>
      )}

      <CardCollectorsSaying cardId={card.id} heading="Who's talking about this card" />
    </div>
  );
}

/** Scroll to the sales graph. Its wrapper is display: contents, so use its first box. */
function scrollToSales() {
  const slot = document.querySelector<HTMLElement>('[data-slot="sales-chart"]');
  if (!slot) return;
  const target =
    getComputedStyle(slot).display === "contents"
      ? ((slot.firstElementChild as HTMLElement | null) ?? slot)
      : slot;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function isPeople(value: unknown): value is OwnersAndHunters {
  if (!value || typeof value !== "object") return false;
  const row = value as OwnersAndHunters;
  return Boolean(row.owners && Array.isArray(row.owners.people));
}

function CardPeoplePanel({ id, card }: { id: string; card: SportsCard }) {
  const [people, setPeople] = useState<OwnersAndHunters | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetch(`/api/cards/people?id=${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as unknown;
      })
      .then((body) => {
        if (cancelled) return;
        if (isPeople(body)) {
          setPeople(body);
          setPhase("ready");
          return;
        }
        setPhase("fallback");
      })
      .catch(() => {
        if (!cancelled) setPhase("fallback");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  if (phase === "loading") {
    return <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />;
  }
  if (phase === "ready" && people) return <CardPeopleSections data={people} />;
  return (
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
  );
}

function EstSellMetric({
  cardSold,
  soldPrice,
  loading,
  label,
  count,
  lowConfidence,
  sample = false,
  asEstimate = true,
}: {
  cardSold: boolean;
  soldPrice: number | null;
  loading: boolean;
  label: string | null;
  count: number;
  lowConfidence: boolean;
  sample?: boolean;
  asEstimate?: boolean;
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

  if (asEstimate && label?.startsWith("$")) {
    return (
      <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-white/10 dark:bg-black/20">
        <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Est. sell</p>
        <p className="mt-1 min-w-0 overflow-hidden text-[clamp(0.95rem,3.4vw,1.125rem)] font-semibold tabular-nums whitespace-nowrap text-ellipsis">
          {label}
        </p>
        {sample ? (
          <p className="mt-0.5 text-[11px] text-zinc-500">Sample estimate</p>
        ) : null}
        <CompBasis count={count} basis={[]} />
        {lowConfidence ? (
          <span className="mt-1 inline-block rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
            Low confidence
          </span>
        ) : null}
      </div>
    );
  }

  const copy = estSellTileCopy(label);
  if (copy.title) {
    return <UnavailableEstSell short={copy.text} detail={copy.title} />;
  }
  if (!asEstimate) return <Metric label="Price" value={copy.text} />;
  return <Metric label="Est. sell" value={copy.text} />;
}

function UnavailableEstSell({ short, detail }: { short: string; detail: string }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-white/10 dark:bg-black/20">
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Est. sell</p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        title={detail}
        onClick={() => setOpen((current) => !current)}
        className="mt-1 flex min-h-11 w-full min-w-0 max-w-full items-center text-left text-[clamp(0.95rem,3.4vw,1.125rem)] font-semibold leading-snug break-words"
      >
        <span className="sr-only">{detail}</span>
        <span id={detailId} aria-hidden="true">{open ? detail : short}</span>
      </button>
    </div>
  );
}

function CardSpecs({
  card,
}: {
  card: {
    setBrand: string;
    cardNumber: string;
    grade: string;
    parallel: string;
    conditionType: string;
    certNumber: string;
  };
}) {
  const specs = [
    card.cardNumber.trim() && card.cardNumber.trim() !== "—"
      ? { label: "No.", value: `#${card.cardNumber.trim()}` }
      : null,
    card.parallel.trim()
      ? {
          label: "Parallel",
          value: canonicalParallelName(card.setBrand, card.parallel),
        }
      : null,
    ...gradeDetailSpecs(card),
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
  title,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  title?: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-white/10 dark:bg-black/20">
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">{label}</p>
      <p
        title={title}
        className={`mt-1 min-w-0 max-w-full overflow-hidden text-[clamp(0.95rem,3.4vw,1.125rem)] font-semibold leading-snug break-words tabular-nums ${
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
