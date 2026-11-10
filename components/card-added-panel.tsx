"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Award, Check, PenLine, X } from "lucide-react";
import { CardShareButton, PrivateShareSheet } from "@/components/card-share";
import type { VisibilitySave } from "@/components/card-visibility";
import { CardSlabArt } from "@/components/card-slab-art";
import { tileArtCard } from "@/components/card-tile";
import { useCollection } from "@/components/collection-provider";
import {
  addAnotherPath,
  addedCollectionTotals,
  collectionLineText,
  copyCardPath,
  addedValueLine,
  milestoneFor,
  recentSoldPrices,
  type AddedRevealLine,
} from "@/lib/cards/added-panel";
import { playSlabMorph, takeSlabMorph } from "@/lib/cards/slab-morph";
import { collectorReveal, collectorRevealCopy } from "@/lib/badges/collector-reveal";
import {
  FEED_POST_FAILED_TEXT,
  SHARE_CONFIRM_TEXT,
  SHARE_PRIVATE_REASON,
  cardPostFailed,
  cardPostId,
  composeWithCardPath,
  justAddedCaption,
  sharePostPath,
  shareSessionStore,
  takeSharedPost,
  writeComposeCaption,
} from "@/lib/social/share-to-feed";
import { photoSource, photoStatusAfter, type PhotoStatus } from "@/lib/collection/grid";
import type { SportsCard } from "@/lib/types";
import type { ConfidenceCopy, MatchConfidence } from "@/lib/value/match-confidence";
import { useCardValues } from "@/lib/value/use-card-values";
import type { CardValueResult } from "@/lib/value/types";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

const primaryButton = `inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 ${focusRing}`;

/**
 * Shown once on the card page right after Add card: the slab reveal, its value,
 * and up to three recent sold prices. Reads card_values and the sold comps the
 * card page already loaded. No fetch of its own for prices.
 */
export function CardAddedPanel({
  cardId,
  value,
  loading,
  sales = null,
  salesLoading = false,
  confidence = "strong",
  copy = null,
  onDismiss,
  onSeeSales,
  viewer = null,
  onTogglePublic,
}: {
  cardId: string;
  value: CardValueResult | null;
  loading: boolean;
  /** The card page's on-screen sold comps. Null until they are ready. */
  sales?: readonly { id?: string; soldPrice: number; soldDate: string }[] | null;
  salesLoading?: boolean;
  confidence?: MatchConfidence;
  copy?: ConfidenceCopy | null;
  onDismiss: () => void;
  onSeeSales: () => void;
  /** The signed-in owner. Collector progress and Share need it. */
  viewer?: { id: string; username: string } | null;
  /** Same public switch the card page uses. Share and Post it ask for it on a private card. */
  onTogglePublic?: (next: boolean) => VisibilitySave | void;
}) {
  const { cards, ready } = useCollection();
  const ids = useMemo(() => cards.map((card) => card.id), [cards]);
  const book = useCardValues(ids);
  const values = useMemo(() => {
    if (!value) return book.values;
    const next = new Map(book.values);
    next.set(cardId, value);
    return next;
  }, [book.values, cardId, value]);
  const card = cards.find((item) => item.id === cardId) ?? null;
  const valueLine = addedValueLine(value, loading, card);
  const line: AddedRevealLine =
    confidence !== "strong" && copy
      ? {
          kind: confidence,
          text: copy.text,
          fix: copy.fix ? { label: copy.fix.label, href: `/cards/${cardId}/edit` } : null,
        }
      : valueLine;
  const totals = addedCollectionTotals(cards, values, !book.loading && !book.error, cardId);
  // One quiet line for a moment worth naming (1st, 10th… card, first slab, first numbered).
  const milestone = card && ready ? milestoneFor(cards, card) : null;
  const slabRef = useRef<HTMLDivElement>(null);
  const morphed = useRef(false);
  // Right after a guided save, the slab glides in from where it sat on Review.
  useLayoutEffect(() => {
    const slab = slabRef.current;
    if (!card || !slab || morphed.current) return;
    morphed.current = true;
    const from = takeSlabMorph();
    if (!from) return;
    // The glide replaces the turn-in, so the reveal stays one motion.
    slab.dataset.morph = "on";
    playSlabMorph(slab, from);
  }, [card]);
  // Sold prices only back a strong match. A weak one would read like its price.
  const recent = line.kind === "ok" ? recentSoldPrices(sales) : [];
  const addAnother = addAnotherPath(card);
  const copyCard = card ? copyCardPath(card) : null;
  const viewerId = viewer?.id ?? null;
  const collector = useMemo(
    () => (viewerId && cards.some((item) => item.id === cardId) ? collectorRevealCopy(collectorReveal(cards, cardId, viewerId)) : null),
    [cardId, cards, viewerId],
  );
  // What this add did on the feed, read once: a post id, or a failed post's caption.
  const [feed] = useState(() => addedFeedState(cardId));
  const [postSheet, setPostSheet] = useState(false);
  const postCaption = feed.failedCaption || (card ? justAddedCaption(card) : "");
  // Post it leads until this add is on the feed; then Add another does.
  const postFirst = Boolean(card) && !feed.postId;
  const keepCaption = () => {
    const store = shareSessionStore();
    if (store && card) writeComposeCaption(store, card.id, postCaption);
  };

  return (
    <section
      aria-label="Added to your collection"
      data-slot="added-panel"
      className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.03] sm:p-6"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className={`absolute top-1.5 right-1.5 z-10 grid size-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-200 ${focusRing}`}
      >
        <X className="size-4" aria-hidden />
      </button>

      <div className="flex flex-col items-center text-center">
        {/* Phones size the slab by screen height so the buttons below stay on screen. */}
        <div
          data-reveal="frame"
          className="relative aspect-[3/5] h-[clamp(8.5rem,calc(100svh-36.5rem-env(safe-area-inset-bottom)),15rem)] md:h-auto md:w-40"
        >
          <div
            aria-hidden
            data-reveal="glow"
            className="pointer-events-none absolute -inset-6 rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.35),rgb(124_58_237/0.12)_55%,transparent)] opacity-70 blur-xl motion-safe:animate-[reveal-glow_900ms_ease-out_both] motion-reduce:hidden"
          />
          <div data-reveal="slab" ref={slabRef} className="relative motion-safe:animate-[slab-reveal_700ms_cubic-bezier(0.2,0.7,0.2,1)_both] data-[morph=on]:animate-none">
            {card ? <RevealSlab card={card} /> : <div className="aspect-[3/5] w-full rounded-xl skeleton-shimmer" />}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-600 text-white">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">
            {milestone ? (
              <>
                {/* The milestone takes the visible line; screen readers still hear the confirmation. */}
                <span className="sr-only">Added to your collection. </span>
                <span data-slot="milestone">{milestone}</span>
              </>
            ) : (
              "Added to your collection"
            )}
          </h2>
        </div>
        {card ? (
          <p className="text-sm text-zinc-500">{card.playerName}</p>
        ) : null}

        <div aria-live="polite" className="mt-2 w-full max-w-sm">
          {line.kind === "pending" ? (
            <div className="flex flex-col items-center gap-1.5" aria-busy="true">
              <span className="skeleton-shimmer block h-6 w-40 rounded-lg" aria-hidden />
              <p className="text-sm text-zinc-500">{line.text}</p>
            </div>
          ) : line.kind === "ok" ? (
            <p className="text-base font-semibold tracking-tight tabular-nums text-balance text-zinc-900 dark:text-zinc-50">
              {line.text}
            </p>
          ) : (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="block text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {line.text}
              </span>
              {"fix" in line && line.fix ? (
                <Link
                  href={line.fix.href}
                  className="inline-flex min-h-11 items-center font-semibold text-violet-700 underline underline-offset-2 dark:text-[#A78BFA]"
                >
                  {line.fix.label}
                </Link>
              ) : line.kind === "no_sales" ? (
                <Link
                  href={`/cards/${cardId}/edit`}
                  className="inline-flex min-h-11 items-center font-semibold text-violet-700 underline underline-offset-2 dark:text-[#A78BFA]"
                >
                  Check the card details
                </Link>
              ) : null}
            </p>
          )}
        </div>
        <CollectionLine count={totals.count} total={totals.total} previous={totals.previous} />
      </div>

      {feed.postId ? (
        <p className="mx-auto mt-3 max-w-sm rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-center text-sm text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200">
          {SHARE_CONFIRM_TEXT}{" "}
          <Link href={sharePostPath(feed.postId)} className="font-semibold underline underline-offset-2">
            View post
          </Link>
        </p>
      ) : feed.failedCaption != null ? (
        <p role="status" className="mt-3 text-center text-sm text-rose-600 dark:text-rose-400">
          {FEED_POST_FAILED_TEXT} Try Post it.
        </p>
      ) : null}

      {/* Thumb zone: the main action, Add another right under it, then a quiet link. */}
      <div data-slot="reveal-actions" className="mx-auto mt-4 flex w-full max-w-sm flex-col gap-2">
        <div className="flex gap-2">
          {postFirst && card ? (
            card.isPublic ? (
              <Link href={composeWithCardPath(card.id)} onClick={keepCaption} className={primaryButton}>
                <PenLine className="size-4" aria-hidden />
                Post it
              </Link>
            ) : (
              <button type="button" onClick={() => setPostSheet(true)} className={primaryButton}>
                <PenLine className="size-4" aria-hidden />
                Post it
              </button>
            )
          ) : (
            <Link href={addAnother} className={primaryButton}>
              Add another
            </Link>
          )}
          {card ? (
            <CardShareButton
              card={card}
              username={viewer?.username}
              onTogglePublic={onTogglePublic ?? (() => undefined)}
            />
          ) : null}
        </div>
        {postFirst ? (
          <Link
            href={addAnother}
            className={`inline-flex min-h-11 w-full items-center justify-center rounded-full border border-zinc-300 bg-white/60 px-4 text-sm font-semibold text-zinc-800 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10 ${focusRing}`}
          >
            Add another
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onSeeSales}
          className={`mx-auto inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-zinc-600 underline decoration-zinc-400/50 underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:decoration-white/20 dark:hover:text-zinc-100 ${focusRing}`}
        >
          See all sales
        </button>
      </div>
      {/* The same card again, for a second parallel or grade. One text line keeps the fit. */}
      {copyCard ? (
        <div className="-mt-1 flex justify-center">
          <Link
            href={copyCard}
            data-slot="copy-card"
            aria-label="Copy this card: add another parallel or grade of it"
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-violet-700 underline decoration-violet-700/40 underline-offset-4 hover:text-violet-600 dark:text-[#A78BFA] dark:decoration-[#A78BFA]/40 ${focusRing}`}
          >
            Copy this card
          </Link>
        </div>
      ) : null}
      {postSheet && card ? (
        <PrivateShareSheet
          isPublic={Boolean(card.isPublic)}
          onTogglePublic={onTogglePublic ?? (() => undefined)}
          onShare={() => setPostSheet(false)}
          onClose={() => setPostSheet(false)}
          copy={{
            title: "Make this card public to post it",
            privateText: SHARE_PRIVATE_REASON,
            publicTitle: "Ready to post",
            publicText: "It shows on your profile now. The post opens with this card attached.",
          }}
          action={
            <Link
              href={composeWithCardPath(card.id)}
              onClick={keepCaption}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-violet-600 px-5 text-[15px] font-semibold text-white hover:bg-violet-500"
            >
              <PenLine aria-hidden className="size-4" />
              Post it
            </Link>
          }
        />
      ) : null}

      {/* The details read below the fold on a phone: sold prices, collection, progress. */}
      <div className="mt-2 flex flex-col items-center text-center">
        {line.kind === "ok" && salesLoading ? (
          <ul className="mt-2 w-full max-w-sm space-y-1.5" aria-hidden>
            {[0, 1, 2].map((row) => (
              <li key={row} className="skeleton-shimmer h-10 rounded-xl" />
            ))}
          </ul>
        ) : recent.length > 0 ? (
          <div className="mt-2 w-full max-w-sm">
            <ul aria-label="Recent sold prices" className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200 bg-white/70 text-left dark:divide-white/5 dark:border-white/10 dark:bg-white/[0.03]">
              {recent.map((sale) => (
                <li key={sale.key} className="flex min-h-10 items-center justify-between gap-3 px-3 text-sm">
                  <span className="font-semibold tabular-nums">{sale.priceText}</span>
                  <span className="text-xs text-zinc-500 tabular-nums">{sale.dateText ?? "Recently"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-zinc-500">Recent sold prices via Trawl</p>
          </div>
        ) : null}

        {collector ? (
          <p
            data-slot="collector-progress"
            className={`mt-2 flex max-w-sm items-start justify-center gap-1.5 text-sm ${
              collector.kind === "earned"
                ? "font-semibold text-violet-700 dark:text-[#A78BFA]"
                : "text-zinc-600 dark:text-zinc-300"
            }`}
          >
            {collector.kind === "earned" ? <Award className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
            <span>{collector.text}</span>
          </p>
        ) : null}
        {collector?.kind === "needs_photo" ? (
          <Link
            href={`/cards/${cardId}/edit`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-violet-700 underline underline-offset-2 dark:text-[#A78BFA]"
          >
            Add a photo to this card
          </Link>
        ) : null}
      </div>
    </section>
  );
}

const TICK_MS = 600;

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/**
 * "Your collection: N cards, about $X", right under the value line. When the
 * old and new totals are both real, the figure counts up from one to the
 * other once, in about 600ms. Reduced motion shows the final figure. Screen
 * readers hear only the final line. No real total: the count alone, never $0.
 */
export function CollectionLine({ count, total, previous }: { count: number; total: number | null; previous: number | null }) {
  const canTick = total != null && previous != null && previous < total;
  const [tick, setTick] = useState<{ phase: "idle" | "running" | "done"; value: number | null }>({
    phase: "idle",
    value: null,
  });
  const [reduce] = useState(prefersReducedMotion);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !canTick || reduce) return;
    started.current = true;
    const from = previous!;
    const to = total!;
    let frame = 0;
    let start: number | null = null;
    let finished = false;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / TICK_MS);
      if (t >= 1) {
        finished = true;
        setTick({ phase: "done", value: null });
        return;
      }
      const eased = 1 - (1 - t) ** 3;
      setTick({ phase: "running", value: from + (to - from) * eased });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      // Cut short (a remount, or the total moved): start clean next time.
      if (!finished) {
        started.current = false;
        setTick({ phase: "idle", value: null });
      }
    };
  }, [canTick, reduce, previous, total]);

  const shown =
    tick.phase === "running" && tick.value != null
      ? tick.value
      : tick.phase === "idle" && canTick && !reduce
        ? previous
        : total;
  const finalText = collectionLineText(count, total);
  return (
    <p data-slot="collection-line" className="mt-1 text-[13px] leading-5 text-zinc-500 tabular-nums">
      <span aria-hidden>{collectionLineText(count, shown)}</span>
      <span aria-live="polite" className="sr-only">
        {finalText}
      </span>
    </p>
  );
}

/** The new card's slab, the same art as its Collection tile. */
function RevealSlab({ card }: { card: SportsCard }) {
  const source = photoSource(card.photoDataUrl);
  const [state, setState] = useState<{ src: string | null; status: PhotoStatus }>({
    src: card.photoDataUrl,
    status: "loading",
  });
  const status = state.src === card.photoDataUrl ? state.status : "loading";
  const onStatus = useCallback(
    (event: "load" | "error") =>
      setState((current) => ({
        src: card.photoDataUrl,
        status: photoStatusAfter(current.src === card.photoDataUrl ? current.status : "loading", event),
      })),
    [card.photoDataUrl],
  );
  return (
    <CardSlabArt
      card={tileArtCard(card)}
      index={0}
      source={source}
      status={status}
      onStatus={onStatus}
      sizes="160px"
    />
  );
}

/** Whether this add already posted, or tried to and failed. Read once from this tab's storage. */
function addedFeedState(cardId: string): { postId: string | null; failedCaption: string | null } {
  try {
    const store = shareSessionStore();
    if (!store) return { postId: null, failedCaption: null };
    // The panel shows the "Shared to your feed" note, so the card page's one-shot note is used up here.
    const oneShot = takeSharedPost(store, cardId);
    const postId = cardPostId(store, cardId) ?? oneShot;
    return { postId, failedCaption: postId ? null : cardPostFailed(store, cardId) };
  } catch {
    return { postId: null, failedCaption: null };
  }
}
