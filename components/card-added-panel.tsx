"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Globe, Lock, X } from "lucide-react";
import { openSheetFromLink } from "@/components/add-card-link";
import { CardShareButton } from "@/components/card-share";
import { useVisibilitySave, type VisibilitySave } from "@/components/card-visibility";
import { CardSlabArt } from "@/components/card-slab-art";
import { tileArtCard } from "@/components/card-tile";
import { useCollection } from "@/components/collection-provider";
import { Logo } from "@/components/logo";
import {
  addAnotherPath,
  addedBigPrice,
  addedValueLine,
  milestoneFor,
  recentSoldPrices,
  type AddedRevealLine,
} from "@/lib/cards/added-panel";
import { takeSlabMorph } from "@/lib/cards/slab-morph";
import { writeBrowserVisibilityChoice } from "@/lib/cards/visibility-choice";
import { haptic } from "@/lib/ios/haptics";
import { cardPostFailed, shareSessionStore, takeSharedPost, cardPostId } from "@/lib/social/share-to-feed";
import { pendingCardPost } from "@/lib/social/card-post-queue";
import { photoSource, photoStatusAfter, type PhotoStatus } from "@/lib/collection/grid";
import type { SportsCard } from "@/lib/types";
import type { ConfidenceCopy, MatchConfidence } from "@/lib/value/match-confidence";
import { ScanPeopleLine } from "@/components/scan/scan-people-line";
import type { CardValueResult } from "@/lib/value/types";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

const mainButton = `inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-violet-600 px-5 text-[15px] font-semibold text-white transition-transform duration-150 hover:bg-violet-500 motion-safe:active:scale-[0.97] ${focusRing}`;

/** When the flip lands: the haptic and the confetti go off together. */
export const ADDED_FLIP_MS = 700;
const LAND_MS = 460;

/** Brand confetti only: purple, deep purple, light purple and off-white. */
const CONFETTI = ["#7C3AED", "#A78BFA", "#5B21B6", "#F4F4F5", "#7C3AED", "#A78BFA", "#5B21B6", "#A78BFA", "#F4F4F5", "#7C3AED", "#A78BFA", "#5B21B6", "#7C3AED", "#F4F4F5"];

export const ADDED_COPY = {
  title: "Added",
  addAnother: "Add another",
  share: "Share",
  seeSales: "See sales",
  hideSales: "Hide sales",
  checkDetails: "Check the card details",
  postFailed: "Couldn't post to your feed.",
  credit: "Recent sold prices via Trawl",
} as const;

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/**
 * Shown once, right after Add card: a full-screen scene over the card page.
 * The card flips over with a tap of haptics and a short confetti burst, then
 * one big price (the value the card page shows, never another), Add another
 * and Share. Recent sales wait behind See sales; Public / Private sits small
 * at the end. Reduced motion fades it in with no flip and no confetti.
 * Reads card_values and the sold comps the card page already loaded: no fetch
 * of its own for prices.
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
  /** No sales loaded here: close the scene and go to the card page's sales. */
  onSeeSales: () => void;
  /** The signed-in owner. Share needs it. */
  viewer?: { id: string; username: string } | null;
  /** Same public switch the card page uses. */
  onTogglePublic?: (next: boolean) => VisibilitySave | void;
}) {
  const { cards, ready } = useCollection();
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
  const price = line.kind === "ok" ? addedBigPrice(value, card) : null;
  // One short heading for a moment worth naming (1st, 10th… card, first slab, first numbered).
  const milestone = card && ready ? milestoneFor(cards, card) : null;
  // Sold prices only back a strong match. A weak one would read like its price.
  const recent = line.kind === "ok" ? recentSoldPrices(sales) : [];
  const [salesOpen, setSalesOpen] = useState(false);
  const salesId = useId();
  const titleId = useId();
  const [reduce] = useState(prefersReducedMotion);
  const [landed, setLanded] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const failedPost = useFailedPost(cardId);

  // The Review slab's glide is replaced by the flip; take its record so it never plays late.
  useEffect(() => {
    takeSlabMorph();
  }, []);

  // The flip lands: a tap of haptics and, with motion allowed, the confetti.
  useEffect(() => {
    if (!card || landed) return;
    const timer = window.setTimeout(() => {
      setLanded(true);
      haptic("tick");
    }, reduce ? 0 : LAND_MS);
    return () => window.clearTimeout(timer);
  }, [card, landed, reduce]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  function seeSales() {
    if (recent.length > 0 || salesLoading) setSalesOpen((open) => !open);
    else onSeeSales();
  }

  const scene = (
    <div className="fixed inset-0 z-[55] flex items-end justify-center md:items-center" data-slot="added-scene">
      <button
        type="button"
        aria-label="Dismiss"
        tabIndex={-1}
        onClick={onDismiss}
        className="absolute inset-0 bg-zinc-950/75 backdrop-blur-xl motion-safe:animate-[backdrop-in_260ms_ease-out_both]"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-slot="added-panel"
        className="relative flex max-h-[100dvh] w-full max-w-md flex-col overflow-y-auto overscroll-contain rounded-t-[28px] border border-b-0 border-zinc-200 bg-[var(--background)] md:border-b dark:border-white/10 px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none motion-safe:animate-[sheet-up_360ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both] md:rounded-[28px] md:pb-5"
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`absolute top-2 right-2 z-10 grid size-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-200 ${focusRing}`}
        >
          <X className="size-5" aria-hidden />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* The flip: the card's back turns over to its face. Phones size it by screen height so the buttons stay on screen. */}
          <div
            data-reveal="frame"
            className="relative mt-3 aspect-[3/5] h-[clamp(9rem,calc(100svh-31rem-env(safe-area-inset-bottom)),16rem)] min-w-0 [perspective:1100px]"
          >
            <div
              aria-hidden
              data-reveal="glow"
              className="pointer-events-none absolute -inset-8 rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.35),rgb(124_58_237/0.12)_55%,transparent)] opacity-70 blur-xl motion-safe:animate-[reveal-glow_900ms_ease-out_both] motion-reduce:hidden"
            />
            {landed && !reduce ? <Confetti /> : null}
            <div
              data-reveal="flip"
              className="relative h-full w-full [transform-style:preserve-3d] motion-safe:animate-[added-flip_700ms_cubic-bezier(0.2,0.7,0.2,1)_both] motion-reduce:animate-[add-fade_220ms_ease-out_both]"
            >
              <div data-reveal="slab" className="absolute inset-0 [backface-visibility:hidden]">
                {card ? <RevealSlab card={card} /> : <div className="aspect-[3/5] w-full rounded-xl skeleton-shimmer" />}
              </div>
              <div
                aria-hidden
                data-reveal="back"
                className="absolute inset-0 grid place-items-center rounded-xl bg-[#18181B] ring-1 ring-white/10 [backface-visibility:hidden] [transform:rotateY(180deg)] motion-reduce:hidden"
              >
                <Logo className="size-12" />
              </div>
            </div>
          </div>

          <h2 id={titleId} className="mt-5 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-violet-600 text-white">
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </span>
            {milestone ? (
              <>
                {/* The milestone takes the visible line; screen readers still hear the confirmation. */}
                <span className="sr-only">Added to your collection. </span>
                <span data-slot="milestone">{milestone}</span>
              </>
            ) : (
              <>
                {ADDED_COPY.title}
                <span className="sr-only"> to your collection</span>
              </>
            )}
          </h2>
          {card ? <p className="mt-0.5 max-w-full truncate text-sm text-zinc-500">{card.playerName}</p> : null}

          <div aria-live="polite" className="mt-3 w-full">
            {line.kind === "pending" ? (
              <div className="flex flex-col items-center gap-2" aria-busy="true">
                <span className="skeleton-shimmer block h-11 w-40 rounded-xl" aria-hidden />
                <p className="text-sm text-zinc-500">{line.text}</p>
              </div>
            ) : price ? (
              <div data-slot="added-price">
                {/* The same figure as the value line, in big type; the full line for screen readers. */}
                <span className="sr-only">{line.text}</span>
                <p aria-hidden className="font-mono text-[44px] leading-none font-semibold tracking-tight tabular-nums text-zinc-950 dark:text-zinc-50">
                  {price.amount}
                </p>
                <p aria-hidden className="mt-2 text-[13px] text-zinc-500 tabular-nums">
                  {price.detail}
                </p>
              </div>
            ) : (
              <div className="text-sm text-zinc-600 dark:text-zinc-300">
                <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{line.text}</p>
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
                    {ADDED_COPY.checkDetails}
                  </Link>
                ) : null}
              </div>
            )}
          </div>
          {/* After a scan save only: who else has it, as two counts. */}
          <ScanPeopleLine cardId={cardId} />
        </div>

        {line.kind === "ok" ? (
          <div className="mt-2 flex flex-col items-center">
            <button
              type="button"
              onClick={seeSales}
              aria-expanded={recent.length > 0 || salesLoading ? salesOpen : undefined}
              aria-controls={salesOpen ? salesId : undefined}
              className={`inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 ${focusRing}`}
            >
              {salesOpen ? ADDED_COPY.hideSales : ADDED_COPY.seeSales}
              <ChevronDown
                aria-hidden
                className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${salesOpen ? "rotate-180" : ""}`}
              />
            </button>
            {salesOpen ? (
              <div id={salesId} className="w-full motion-safe:animate-[add-step-in_220ms_ease-out_both] motion-reduce:animate-[add-fade_160ms_ease-out_both]">
                {salesLoading ? (
                  <ul className="w-full space-y-1.5" aria-hidden>
                    {[0, 1, 2].map((row) => (
                      <li key={row} className="skeleton-shimmer h-10 rounded-xl" />
                    ))}
                  </ul>
                ) : (
                  <>
                    <ul
                      aria-label="Recent sold prices"
                      className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200 text-left dark:divide-white/5 dark:border-white/10"
                    >
                      {recent.map((sale) => (
                        <li key={sale.key} className="flex min-h-10 items-center justify-between gap-3 px-3 text-sm">
                          <span className="font-mono font-semibold tabular-nums">{sale.priceText}</span>
                          <span className="font-mono text-xs text-zinc-500 tabular-nums">{sale.dateText ?? "Recently"}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-center text-[11px] text-zinc-500">{ADDED_COPY.credit}</p>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {failedPost ? (
          <p role="status" className="mt-2 text-center text-sm text-rose-600 dark:text-rose-400">
            {ADDED_COPY.postFailed}
          </p>
        ) : null}

        {/* Thumb zone: the only two buttons. */}
        <div data-slot="reveal-actions" className="mt-4 flex w-full gap-2">
          <Link
            href={addAnotherPath(card)}
            onClick={(event) => {
              // A plain tap closes this and opens the Add card sheet again.
              if (openSheetFromLink(event)) onDismiss();
            }}
            className={mainButton}
          >
            {ADDED_COPY.addAnother}
          </Link>
          {card ? (
            <CardShareButton
              card={card}
              username={viewer?.username}
              onTogglePublic={onTogglePublic ?? (() => undefined)}
              variant="pill"
            />
          ) : null}
        </div>

        {card && onTogglePublic ? (
          <VisibilityPill
            isPublic={Boolean(card.isPublic)}
            onChange={(next) => {
              // The next add starts from this choice, as the old segment on Add card did.
              if (viewer) writeBrowserVisibilityChoice(viewer.id, next);
              return onTogglePublic(next);
            }}
          />
        ) : null}
      </section>
    </div>
  );
  // On document.body, so the page column's own layer (and the tab bar) never sits over the scene.
  return typeof document === "undefined" ? scene : createPortal(scene, document.body);
}

/** Public / Private, small, at the end of the flow. Saves on tap, like the card page switch. */
function VisibilityPill({
  isPublic,
  onChange,
}: {
  isPublic: boolean;
  onChange: (next: boolean) => VisibilitySave | void;
}) {
  const { state, toggle } = useVisibilitySave(onChange);
  const Icon = isPublic ? Globe : Lock;
  return (
    <div className="mt-3 flex items-center justify-center gap-2" data-slot="added-visibility">
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        aria-label="Public on profile"
        onClick={() => toggle(!isPublic)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 ${focusRing}`}
      >
        <Icon className="size-3.5" aria-hidden />
        <span aria-hidden>{isPublic ? "Public" : "Private"}</span>
        <span
          aria-hidden
          className={`relative ml-1 inline-block h-5 w-8 rounded-full transition-colors duration-150 motion-reduce:transition-none ${
            isPublic ? "bg-violet-600" : "bg-zinc-300 dark:bg-white/20"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0 size-4 rounded-full bg-white shadow transition-transform duration-150 motion-reduce:transition-none ${
              isPublic ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
      {state === "failed" ? (
        <span role="status" className="text-[13px] text-rose-600 dark:text-rose-400">
          Couldn&apos;t save
        </span>
      ) : null}
    </div>
  );
}

/** A short burst from behind the card as the flip lands. Decorative, and never under reduced motion. */
function Confetti() {
  return (
    <div aria-hidden data-reveal="confetti" className="pointer-events-none absolute inset-0 z-10">
      {CONFETTI.map((color, index) => {
        const angle = (index / CONFETTI.length) * Math.PI * 2;
        const reach = 90 + (index % 3) * 26;
        return (
          <span
            key={index}
            className="added-confetti absolute top-1/2 left-1/2 h-3 w-2 rounded-[2px]"
            style={
              {
                backgroundColor: color,
                animationDelay: `${(index % 4) * 30}ms`,
                "--dx": `${Math.round(Math.cos(angle) * reach)}px`,
                "--dy": `${Math.round(Math.sin(angle) * reach * 0.8 + 40)}px`,
                "--spin": `${(index % 2 === 0 ? 1 : -1) * (180 + index * 24)}deg`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

/**
 * Whether this add's feed post failed, read once from this tab's storage.
 * A post still on the way is checked again when it lands.
 */
function useFailedPost(cardId: string): boolean {
  const [failed, setFailed] = useState(() => readFailedPost(cardId));
  useEffect(() => {
    const running = pendingCardPost(cardId);
    if (!running) return;
    let live = true;
    void running.then(() => {
      if (live) setFailed(readFailedPost(cardId));
    });
    return () => {
      live = false;
    };
  }, [cardId]);
  return failed;
}

function readFailedPost(cardId: string): boolean {
  try {
    const store = shareSessionStore();
    if (!store) return false;
    // The scene stands in for the card page's one-shot "Shared to your feed" note.
    const oneShot = takeSharedPost(store, cardId);
    const postId = cardPostId(store, cardId) ?? oneShot;
    return !postId && cardPostFailed(store, cardId) != null;
  } catch {
    return false;
  }
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
  const art = useMemo(() => tileArtCard(card), [card]);
  return <CardSlabArt card={art} index={0} source={source} status={status} onStatus={onStatus} sizes="200px" />;
}
