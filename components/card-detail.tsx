"use client";

import { scrollBehavior } from "@/lib/ui/scroll-behavior";
import { ActionError, useActionRetry } from "@/components/action-error";
import { ReadRetry } from "@/components/read-retry";
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
import { NearCardCollectorsSaying } from "@/components/card-talk-near";
import { LazyCardAddedPanel, LazyCompsList, preloadCompsList } from "@/components/card-page-parts";
import { CategorySwitch } from "@/components/card-page/category-switch";
import { CardVisibilitySwitch } from "@/components/card-visibility";
import { CardShareButton } from "@/components/card-share";
import { FirstCardPrivacyPrompt } from "@/components/first-card-privacy-prompt";
import { SharedPostNote } from "@/components/shared-post-note";
import { useCollection } from "@/components/collection-provider";
import { SheetLoadFailed } from "@/components/part-load-failed";
import { MenuWantButton as WantButton } from "@/components/menu-want-button";
import { afterFirstIdle } from "@/lib/ui/idle";
import { lazyPart } from "@/lib/ui/lazy-part";
import { MARK_SOLD_LABEL } from "@/lib/deals/state";
import {
  CardDetailPending,
  CardHero,
  CardTopBar,
  SalesChartPending,
  SalesListPending,
  cardPanelClass,
} from "@/components/card-detail-shell";
import {
  PlotEmpty,
  ROUGH_VALUE_NOTE,
  TRAWL_ATTRIBUTION,
  ValueHead,
  ValuePending,
  cardSection,
  cardSectionTitle,
  valueHeadline,
} from "@/components/card-page/value-head";
import { EbaySoldLine } from "@/components/price-readout";
import { useSocial } from "@/components/social-provider";
import { loginPath } from "@/lib/auth/safe-next";
import { categoryMovePatch, publicTogglePatch } from "@/lib/offers/open-to-offers";
import { cardCategory } from "@/lib/card-category";
import {
  dismissFirstCardPrivacyInBrowser,
  readBrowserFirstCardPrivacy,
  subscribeFirstCardPrivacy,
} from "@/lib/collection/first-card-privacy";
import { copyCardPath, showAddedPanel } from "@/lib/cards/added-panel";
import { todayDateInput } from "@/lib/cards/form-defaults";
import { gradeDetailSpecs } from "@/lib/cards/grading-company";
import { insertSpec } from "@/lib/cards/insert-name";
import { canonicalParallelName, parallelMatchKey } from "@/lib/cards/parallels";
import { parallelIn } from "@/lib/cards/product-data";
import { useProductData } from "@/lib/cards/use-product-data";
import { basedOnSalesLabel } from "@/lib/comps/sales-label";
import { countForSalesLabel, valueFromShownSales } from "@/lib/comps/shared-value";
import { lowConfidencePlacement } from "@/lib/value/low-confidence-placement";
import { soldNotice } from "@/lib/comps/sold-response";
import { useSoldComps } from "@/lib/comps/use-sold-comps";
import type { ChartSale } from "@/lib/chart/sales";
import { useChartSales } from "@/lib/chart/use-chart-sales";
import {
  cardDatesLine,
  isSold,
  money,
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
import { confidenceCopy, matchConfidence } from "@/lib/value/match-confidence";
import {
  NO_SALES_FOUND_LABEL,
  resolvePriceRead,
  SIMILAR_CARDS_LABEL,
  type PriceRead,
} from "@/lib/value/price-fallback";
import { useCardValue } from "@/lib/value/use-card-values";
import { MOVE_TEXT } from "@/lib/chart/theme";

/** Only drawn after a tap on the card page, so it is its own chunk. */
const DealSheet = lazyPart(() => import("@/components/deal-sheet").then((mod) => mod.DealSheet), null, {
  name: "deal-sheet",
  failed: SheetLoadFailed,
});

function subscribeCardValueMemory() {
  return () => {};
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
  rough?: boolean;
  similarLabel?: string;
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
  const { ready, loadFailed, reload, getCard, updateCard, removeCard } = useCollection();
  const actions = useActionRetry();
  const [sellPriceNote, setSellPriceNote] = useState<string | null>(null);
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
  const [CardValueView, setCardValueView] = useState<CardValueView | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
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
  // The checklist only matters for a colored parallel saved without a run.
  const checklist = useProductData(
    Boolean(card && !card.serialRun && parallelMatchKey(card.parallel || "Base") !== "base"),
  );
  const flags = useCompFlagState(
    card?.id ?? null,
    Boolean(user && card),
    sold.status === "ready" ? (sold.data?.comps ?? []) : [],
  );

  const shownComps = sold.status === "ready" ? flags.visible : null;
  const chartSales = useChartSales(shownComps);

  useEffect(() => {
    if (
      sold.status === "ready" ||
      sold.status === "unavailable" ||
      sold.status === "rate_limited"
    ) {
      retryValue();
    }
  }, [retryValue, sold.data?.fetchedAt, sold.status]);

  // The sales list draws once the sold prices are in: fetch its code meanwhile.
  useEffect(preloadCompsList, []);

  // The ⋯ menu's Want control: fetched when the page is idle. A menu opened before
  // it lands shows its disabled placeholder until then.
  useEffect(() => afterFirstIdle(() => WantButton.warm()), []);

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
    editorRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [menuOpen]);

  if (!ready) return <CardDetailPending id={id} />;

  if (!card) {
    // The collection didn't load, so this card may well exist: never "not found".
    if (loadFailed) return <ReadRetry title="Couldn't load this card" onRetry={reload} />;
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold">Card not found</p>
        <Link
          href="/collection"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-violet-700 dark:text-[#A78BFA]"
        >
          Back to Collection
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
  const checklistRow = checklist.data
    ? parallelIn(checklist.data, card.sport, card.yearLabel || String(card.year), card.setBrand, card.parallel)
    : null;
  const confidenceOptions = {
    knownRun: checklistRow?.serialRun ?? null,
    runVaries: Boolean(checklistRow?.runVaries),
    sales: exactSales,
  };
  // Only a strong match shows a dollar figure. Weak and none say what's missing.
  const confidence = cardSold ? "strong" : matchConfidence(card, shownValue, confidenceOptions);
  const heldCopy = confidenceCopy(confidence, card, confidenceOptions);
  const pricedAmount = heldCopy ? null : storedAmount;
  const priceRead: PriceRead = heldCopy
    ? { kind: "status", text: heldCopy.text, isEstimate: false, showEbaySold: false }
    : resolvePriceRead({
        value: shownValue,
        createdAt: card.createdAt,
        exactSales,
        similar: cardValue?.similar ?? remembered?.similar ?? null,
        ebayHref,
        card,
      });
  // A low-confidence estimate is the headline value. The actions menu's Est. sell tile tags it.
  const estimateLowConfidence = priceRead?.kind === "estimate" && isLowConfidenceValue(shownValue);
  const pricePending =
    (!cardSold && valueLoading && !earlyValue) ||
    (compsLoading && !earlyValue) ||
    (!cardSold && checklist.loading);
  const pendingLabel = pricePending
    ? null
    : priceRead?.kind === "similar"
      ? SIMILAR_CARDS_LABEL
      : (priceRead?.text ?? null);

  // Card pages show the value only. Paid and profit stay in the data and the edit form.
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
    CardValueView != null &&
    sold.status === "ready" &&
    !collapsePrices &&
    !authRequired &&
    !soldCopy;
  // Thin data is said once, and calmly: in the value line while the chart is up
  // (chunk loaded, not failed) with a value, otherwise under Recent sales.
  const roughPlace = lowConfidencePlacement({
    salesCount,
    live: usingLive,
    estimate: estimateLowConfidence && storedAmount != null,
    showChart,
  });
  const roughShown = roughPlace === "chart";
  const roughInList = roughPlace === "caption";

  function dismissPrivacyNudge() {
    if (user) dismissFirstCardPrivacyInBrowser(user.id);
  }

  function markSold() {
    if (!card) return;
    const price = Number(sellPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setSellPriceNote("Enter a sold price above $0.");
      return;
    }
    setSellPriceNote(null);
    const cardId = card.id;
    const patch = { sellPrice: price, sellDate: todayDateInput() };
    setSellPrice("");
    void actions
      .run("sold", "Couldn't mark this card sold.", () => updateCard(cardId, patch).saved)
      .then((ok) => {
        // Keep what they typed when it didn't save.
        if (!ok) setSellPrice(String(price));
      });
  }

  function moveCategory(category: ReturnType<typeof cardCategory>) {
    if (!card) return;
    const cardId = card.id;
    // The pile and the badge move together: into Open to offers turns the badge on, out turns it off.
    const patch = categoryMovePatch(card, category);
    void actions.run("category", "Couldn't move this card.", () => updateCard(cardId, patch).saved);
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

  function setPublic(next: boolean) {
    if (!card) return;
    const result = updateCard(card.id, publicTogglePatch(card, next));
    // The first-card nudge stays up until the card is really public.
    if (next) void result.saved.then(dismissPrivacyNudge, () => undefined);
    return result;
  }

  return (
    <div className="space-y-6" data-card-page="">
      {dealOpen ? <DealSheet fixedCard={card} onClose={() => setDealOpen(false)} /> : null}
      <CardTopBar
        editing={editing}
        menuOpen={menuOpen}
        onEdit={toggleEdit}
        onMenu={toggleMenu}
        share={<CardShareButton card={card} username={user?.username} onTogglePublic={setPublic} />}
      />

      {/* card comes from the viewer's own collection, and the page is owner-only. */}
      {showAddedPanel({ added, owned: Boolean(card), dismissed: addedDismissed }) ? (
        <LazyCardAddedPanel
          cardId={card.id}
          // The page's own figure (the sales on screen), never another one: card_values can lag or count differently.
          value={shownValue}
          loading={valueLoading || checklist.loading}
          sales={sold.status === "ready" ? onScreenComps : null}
          salesLoading={compsLoading}
          confidence={confidence}
          copy={heldCopy}
          onDismiss={() => setAddedDismissed(true)}
          onSeeSales={scrollToSales}
          viewer={user ? { id: user.id, username: user.username } : null}
          onTogglePublic={setPublic}
        />
      ) : null}

      <CardHero
        card={card}
        parallelName={canonicalParallelName}
        onFixDetails={() => {
          setMenuOpen(false);
          setFormFailed(false);
          setEditing(true);
        }}
      />

      {heldCopy && !editing && !(showAddedPanel({ added, owned: true, dismissed: addedDismissed })) ? (
        <p
          data-slot="price-held"
          className="rounded-2xl bg-violet-500/10 px-4 py-1 text-sm text-zinc-800 dark:text-zinc-200"
        >
          {heldCopy.text}.{" "}
          {heldCopy.fix ? (
            <Link
              href={`/cards/${card.id}/edit`}
              className="inline-flex min-h-11 items-center font-semibold text-violet-700 underline underline-offset-2 dark:text-[#A78BFA]"
            >
              {heldCopy.fix.label}
            </Link>
          ) : null}
        </p>
      ) : null}

      {/* The owner's controls, in one tidy group under the card: who sees it, which pile it is in, and a copy. */}
      {editing ? null : (
        <section aria-label="Collection" data-slot="owner-controls" className="min-w-0 space-y-2">
          <CardVisibilitySwitch isPublic={Boolean(card.isPublic)} onChange={setPublic} />
          <CategorySwitch value={cardCategory(card)} onChange={moveCategory} />
          {actions.failureFor("category") ? (
            <ActionError
              message={actions.failureFor("category")!.message}
              onRetry={actions.failureFor("category")!.retry}
            />
          ) : null}
          {/* Owner only: the same card again, for a second parallel or grade. The reveal has its own. */}
          {showAddedPanel({ added, owned: true, dismissed: addedDismissed }) ? null : (
            <Link
              href={copyCardPath(card)}
              data-slot="copy-card"
              aria-label="Copy this card: add another parallel or grade of it"
              className="inline-flex min-h-11 items-center rounded-full text-sm font-medium text-violet-700 underline decoration-violet-700/40 underline-offset-4 outline-none hover:text-violet-600 focus-visible:ring-2 focus-visible:ring-violet-600 dark:text-[#A78BFA] dark:decoration-[#A78BFA]/40"
            >
              Copy this card
            </Link>
          )}
        </section>
      )}

      {/* The Added panel shows this note itself while it is up. */}
      {showAddedPanel({ added, owned: true, dismissed: addedDismissed }) ? null : (
        <SharedPostNote key={card.id} cardId={card.id} />
      )}

      {privacyNudge ? (
        <FirstCardPrivacyPrompt
          onToggle={() => {
            const { saved } = updateCard(card.id, { isPublic: !card.isPublic });
            void saved.then(dismissPrivacyNudge, () => undefined);
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
              className="h-40 skeleton-shimmer rounded-2xl"
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
          <CardShareButton card={card} username={user?.username} onTogglePublic={setPublic} variant="row" />
          {/* Same href as the link under the hero. The page is owner-only. */}
          <Link
            href={copyCardPath(card)}
            data-slot="copy-card-menu"
            aria-label="Copy this card: add another parallel or grade of it"
            className="flex min-h-11 items-center rounded-xl text-sm font-medium text-violet-700 underline decoration-violet-700/40 underline-offset-4 outline-none hover:text-violet-600 focus-visible:ring-2 focus-visible:ring-violet-600 dark:text-[#A78BFA] dark:decoration-[#A78BFA]/40"
          >
            Copy this card
          </Link>
          <div>
            <h2 className="font-semibold">Value</h2>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3">
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
                lowConfidence={estimateLowConfidence}
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
            fairLow={pricedAmount != null ? (shownValue?.low ?? null) : null}
            fairHigh={pricedAmount != null ? (shownValue?.high ?? null) : null}
          />

          {!cardSold ? (
            <div className="flex max-w-sm flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  void DealSheet.preload().catch(() => {});
                  setDealOpen(true);
                }}
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
                onChange={(e) => {
                  setSellPrice(e.target.value);
                  setSellPriceNote(null);
                }}
                placeholder="Sold price"
                aria-label="Sold price"
                aria-invalid={sellPriceNote ? true : undefined}
                aria-describedby={sellPriceNote ? "sold-price-note" : undefined}
                className={fieldClass}
              />
              {sellPriceNote ? (
                <p id="sold-price-note" className="text-sm text-rose-600 dark:text-rose-400">
                  {sellPriceNote}
                </p>
              ) : null}
              <button
                type="button"
                onClick={markSold}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-violet-600 px-5 text-sm font-medium whitespace-nowrap text-white hover:bg-violet-500"
              >
                Mark as sold
              </button>
              {actions.failureFor("sold") ? (
                <ActionError message={actions.failureFor("sold")!.message} onRetry={actions.failureFor("sold")!.retry} />
              ) : null}
            </div>
          ) : null}

          {/* Owners and hunters and the fair price check are off for now. lib/cards/people.ts,
              lib/comps/fair-price.ts and the people API route stay for when they come back. */}

          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete ${card.playerName}?`)) return;
              removeCard(card.id);
              router.push("/");
            }}
            className="hit-44 inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
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

      {showChart && CardValueView ? (
        <CardValueView
          read={priceRead}
          amount={priceRead?.kind === "estimate" ? storedAmount : null}
          count={priceRead?.kind === "estimate" ? (shownValue?.nSales ?? 0) : onScreenComps.length}
          sales={usingLive ? chartSales : null}
          selectedSaleId={saleId}
          onSelectSale={setSaleId}
          fetchedAt={sold.data?.fetchedAt ?? null}
          live={usingLive}
          sample={shownValue?.status === "sample"}
          rough={roughShown}
          similarLabel={SIMILAR_CARDS_LABEL}
        />
      ) : collapsePrices ? (
        <section data-slot="sales-chart" data-comp-empty="" className={cardSection}>
          <ValueHead
            headline={
              priceRead?.kind === "similar"
                ? {
                    label: SIMILAR_CARDS_LABEL,
                    text: (
                      <Link href={priceRead.href} className="text-violet-700 underline-offset-2 hover:underline dark:text-violet-300">
                        {priceRead.detail}
                      </Link>
                    ),
                  }
                : {
                    label: "Recent sales",
                    text: !priceRead || priceRead.text === NO_SALES_FOUND_LABEL ? "No sales yet" : priceRead.text,
                  }
            }
            line={priceRead?.kind === "similar" ? priceRead.priceText : undefined}
          />
          <PlotEmpty title={priceRead?.kind === "similar" ? "No sales of this exact card yet" : null}>
            {priceRead?.showEbaySold && ebayHref ? <EbaySoldLine href={ebayHref} /> : null}
          </PlotEmpty>
        </section>
      ) : chartFailed && !authRequired && !soldCopy ? (
        <ValuePending
          slot="sales-chart"
          busy={false}
          headline={pendingLabel ? valueHeadline(priceRead, SIMILAR_CARDS_LABEL) : null}
          line=""
          note={
            <>
              <span className="block font-semibold text-zinc-900 dark:text-zinc-100">Sales are taking a break</span>
              <span className="block">Couldn&apos;t load the sales graph.</span>
              <button
                type="button"
                onClick={() => {
                  setChartFailed(false);
                  setCardValueView(null);
                  setChartAttempt((attempt) => attempt + 1);
                }}
                className="mt-1 inline-flex min-h-11 items-center rounded-full text-sm font-semibold text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:text-violet-300"
              >
                Try again
              </button>
            </>
          }
        />
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
        <section data-slot="sales-list" className={cardSection}>
          <h2 className={cardSectionTitle}>Recent sales</h2>
          {authRequired ? null : soldCopy ? (
            <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">{soldCopy}</p>
          ) : sold.status === "ready" && onScreenComps.length === 0 ? (
            <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
              {priceRead?.kind === "similar" ? SIMILAR_CARDS_LABEL : (priceRead?.text ?? NO_SALES_FOUND_LABEL)}
            </p>
          ) : sold.status === "ready" && roughInList ? (
            <p data-rough-value="" className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">{ROUGH_VALUE_NOTE}</p>
          ) : sold.status !== "ready" && usingSample ? (
            <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">Sample listings</p>
          ) : null}
          {authRequired ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              <Link href={loginPath(pathname)} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2">
                Log in
              </Link>{" "}
              to see sold comps
            </p>
          ) : null}
          {authRequired || unavailable || rateLimited ? null : sold.status === "ready" &&
            (onScreenComps.length > 0 || flags.hidden.length > 0) ? (
            <div className="mt-2">
              <LazyCompsList
                compact
                comps={onScreenComps}
                cardId={card.id}
                canFlag={Boolean(user)}
                hidden={flags.hidden}
                onFlag={flags.flag}
                onRestore={flags.restore}
                toast={flags.toast}
                onUndo={flags.undo}
                selectedId={saleId}
                onSelect={setSaleId}
              />
            </div>
          ) : collapsePrices ? (
            <p className="mt-3 text-sm text-zinc-500">No sales to show</p>
          ) : null}
          {/* With the value section up, the credit sits behind its ⓘ. Without it, it stays in plain sight here. */}
          {usingLive && !compsLoading && !authRequired && !(showChart && CardValueView && shownValue?.status !== "sample") ? (
            <p data-trawl-credit="" className="mt-3 text-11 leading-4 text-zinc-500">
              {TRAWL_ATTRIBUTION}
            </p>
          ) : null}
        </section>
      )}

      <NearCardCollectorsSaying cardId={card.id} heading="Who's talking about this card" />
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
        <p className="text-13 text-zinc-500">Est. sell</p>
        <p className="mt-1 min-w-0 overflow-hidden text-[clamp(0.95rem,3.4vw,1.125rem)] font-semibold tabular-nums whitespace-nowrap text-ellipsis">
          {label}
        </p>
        {sample ? (
          <p className="mt-0.5 text-11 text-zinc-500">Sample estimate</p>
        ) : null}
        {count >= 1 ? <p className="mt-1 text-11 text-zinc-500">{basedOnSalesLabel(count)}</p> : null}
        {lowConfidence ? (
          <p className="mt-1 text-11 leading-4 text-zinc-500">{ROUGH_VALUE_NOTE}</p>
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
      <p className="text-13 text-zinc-500">Est. sell</p>
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
    insertName?: string;
  };
}) {
  const specs = [
    // The insert it's in ("Rookie Code"), saved from a scan.
    insertSpec(card),
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
          <dt className="text-13 text-zinc-500">{spec.label}</dt>
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
      <p className="text-13 text-zinc-500">{label}</p>
      <p
        title={title}
        className={`mt-1 min-w-0 max-w-full overflow-hidden text-[clamp(0.95rem,3.4vw,1.125rem)] font-semibold leading-snug break-words tabular-nums ${
          tone ? MOVE_TEXT[tone] : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const fieldClass =
  "flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500";
