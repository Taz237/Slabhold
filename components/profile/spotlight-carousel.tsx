"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Layers } from "lucide-react";
import { CardSlabArt } from "@/components/card-slab-art";
import { tileArtCard } from "@/components/card-tile";
import { SPOTLIGHT_CSS } from "@/components/profile/spotlight-styles";
import { useReducedMotion } from "@/components/timeline-ui";
import {
  photoSource,
  photoStatusAfter,
  tileAccessibleName,
  tileKind,
  type PhotoStatus,
} from "@/lib/collection/grid";
import { haptic } from "@/lib/ios/haptics";
import { OPEN_TO_OFFERS_LABEL } from "@/lib/offers/open-to-offers";
import {
  SPOT_LAYERS,
  centeredIndex,
  createTickGate,
  glowTint,
  mountedWindow,
  spotAmount,
  spotClamp,
  spotLabel,
  spotlightRow,
  windowShouldMove,
} from "@/lib/profile/spotlight";
import type { PublicCard } from "@/lib/social/types";
import { userHref } from "@/lib/social/user-href";
import { startPendingNav } from "@/lib/ui/tap-feedback";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { resolvePriceRead, tilePriceText } from "@/lib/value/price-fallback";
import type { CardValueResult } from "@/lib/value/types";

/** The real rendered width of a slide: 62vw on a phone, 248px from 400px up. */
const SPOT_SIZES = "(min-width: 400px) 248px, 62vw";
/**
 * The row is at rest on `scrollend`, or, where WebKit has no `scrollend` yet,
 * after this long with no scroll event (momentum sends one every frame).
 */
const SETTLE_MS = 150;

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

/** Where each profile's row was left, so coming back from a card lands on that card. This tab only. */
const lastCentered = new Map<string, string>();
/** Profiles whose row has already hinted that it scrolls, this tab. */
const nudged = new Set<string>();

/** Tests only. */
export function forgetSpotlightMemory(): void {
  lastCentered.clear();
  nudged.clear();
}

function SpotlightStyles() {
  return (
    <style href="slabhold-spotlight" precedence="default">
      {SPOTLIGHT_CSS}
    </style>
  );
}

function cardHref(username: string, id: string): string {
  return `${userHref(username)}/cards/${encodeURIComponent(id)}`;
}

function cardRead(card: PublicCard, value: CardValueResult | undefined) {
  return resolvePriceRead({
    value,
    createdAt: card.createdAt ?? null,
    similar: value?.similar,
    ebayHref: ebaySoldSearchUrlForCard(card),
    card,
  });
}

/** The same words the grid tile is read as: "Luka Dončić 2018 Prizm, PSA 10, Est. $412.00". */
function cardName(card: PublicCard, value: CardValueResult | undefined): string {
  const read = cardRead(card, value);
  return tileAccessibleName(card, spotLabel(card, read).price ? tilePriceText(read, true) : null);
}

type SlideProps = {
  card: PublicCard;
  value: CardValueResult | undefined;
  index: number;
  href: string;
  /** Near the center: real art and photo. Far: a sized box only. */
  live: boolean;
  /** Within two of center: its own layer while it moves. */
  layer: boolean;
  /** At rest in the center: the card is a link to its page. */
  centered: boolean;
  /** This slide carries the label; `labelOn` fades it in. */
  labelled: boolean;
  labelOn: boolean;
  /** The card the row opened on. Its photo loads at once; the rest are lazy. */
  first: boolean;
  onSide: (index: number) => void;
};

const Slide = memo(function Slide({
  card,
  value,
  index,
  href,
  live,
  layer,
  centered,
  labelled,
  labelOn,
  first,
  onSide,
}: SlideProps) {
  const [photo, setPhoto] = useState<{ src: string | null; status: PhotoStatus }>({
    src: card.photoDataUrl,
    status: "loading",
  });
  const status = photo.src === card.photoDataUrl ? photo.status : "loading";
  const onStatus = useCallback(
    (event: "load" | "error") =>
      setPhoto((current) => ({
        src: card.photoDataUrl,
        status: photoStatusAfter(current.src === card.photoDataUrl ? current.status : "loading", event),
      })),
    [card.photoDataUrl],
  );

  if (!live) {
    // Same box, no art: the row keeps its full width and nothing far away costs anything.
    return <li data-slide={index} className="spot-slide spot-far" />;
  }

  const slab = tileKind(card) === "slab";
  const name = cardName(card, value);
  const label = labelled ? spotLabel(card, cardRead(card, value)) : null;

  return (
    <li data-slide={index} data-tile={card.id} data-center={centered ? "" : undefined} className="spot-slide spot-live">
      {/* Every slide is the same portrait 5:7 slot. A slab or a sideways card sits whole inside it. */}
      <div className="grid h-full w-full place-items-center">
        <div className={`spot-scale relative ${slab ? "w-[84%]" : "w-full"} ${layer ? "will-change-transform" : ""}`}>
          <span aria-hidden className="spot-lift" />
          <div className="spot-blur relative">
            <CardSlabArt
              card={tileArtCard(card)}
              // 0 loads now, anything else is lazy (tileLoading).
              index={first ? 0 : 99}
              source={photoSource(card.photoDataUrl)}
              status={status}
              onStatus={onStatus}
              sizes={SPOT_SIZES}
              fetchPriority="auto"
              fit="hug"
            />
            <span aria-hidden className={`spot-veil pointer-events-none absolute inset-0 ${slab ? "rounded-[10px]" : "rounded-lg"}`} />
          </div>
          {label ? (
            <div
              data-spot-label=""
              data-on={labelOn ? "" : undefined}
              className="spot-label pointer-events-none absolute inset-x-1.5 bottom-1.5 rounded border border-white/10 px-3 py-2 text-left text-white"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="min-w-0 flex-1 truncate text-13 leading-5 font-semibold">{label.title}</p>
                {label.price ? (
                  <p data-spot-price="" className="shrink-0 font-mono text-12 leading-5 font-medium tabular-nums">
                    {label.price}
                  </p>
                ) : null}
              </div>
              {label.line ? <p className="mt-0.5 truncate text-11 leading-4 text-white/70">{label.line}</p> : null}
              {label.openToOffers ? (
                <p data-spot-offers="" className="mt-1 flex items-center gap-1.5 text-11 leading-4 font-medium text-[#C4B5FD]">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#A78BFA]" />
                  {OPEN_TO_OFFERS_LABEL}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {centered ? (
        <Link
          href={href}
          prefetch={false}
          aria-label={name}
          className={`absolute inset-0 rounded-xl [-webkit-tap-highlight-color:transparent] ${focusRing}`}
        />
      ) : (
        // A side card comes to the center on a tap. It opens from there.
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Show ${name}`}
          onClick={() => onSide(index)}
          className="absolute inset-0 rounded-xl [-webkit-tap-highlight-color:transparent]"
        />
      )}
    </li>
  );
});

const SeeAllSlide = memo(function SeeAllSlide({
  index,
  href,
  count,
  layer,
}: {
  index: number;
  href: string;
  count: number;
  layer: boolean;
}) {
  return (
    <li data-slide={index} data-see-all="" className="spot-slide spot-live">
      <Link
        href={href}
        prefetch={false}
        aria-label={`See all ${count} cards`}
        className={`spot-scale flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-violet-500/60 bg-violet-500/[0.06] text-violet-700 [-webkit-tap-highlight-color:transparent] dark:border-[#A78BFA]/50 dark:bg-[#A78BFA]/[0.07] dark:text-[#A78BFA] ${layer ? "will-change-transform" : ""} ${focusRing}`}
      >
        <Layers aria-hidden className="h-6 w-6" strokeWidth={1.5} />
        <span className="text-15 leading-5 font-semibold">
          See all <span className="font-mono font-medium tabular-nums">{count}</span>
        </span>
      </Link>
    </li>
  );
});

/**
 * The profile's Spotlight carousel: one flat row of every public card, most
 * valuable first. The centered card is full size and sharp; its neighbours
 * shrink, dim and soften by how far they are from center, with no steps.
 *
 * The row is a native scroller with scroll snap, so the swipe has the phone's
 * own momentum: a hard flick spins through many cards, a light one moves one,
 * and it always comes to rest with a card dead center. Nothing here limits a
 * fling and no script moves the row.
 *
 * Tap a side card and it comes to the center. Tap the centered card and its
 * page opens. Left and right arrows move one card; Enter opens.
 */
export function SpotlightCarousel({
  cards,
  username,
  displayName,
  values,
}: {
  /** Already in row order (sortSpotlightCards). Public cards only. */
  cards: readonly PublicCard[];
  username: string;
  displayName: string;
  values: ReadonlyMap<string, CardValueResult>;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const rowRef = useRef<HTMLUListElement>(null);
  const memoryKey = username.toLowerCase();
  const { slides, seeAll, seeAllCount } = spotlightRow(cards.length);
  const seeAllHref = `${userHref(username)}/cards`;

  const [opened] = useState(() => {
    const id = lastCentered.get(memoryKey);
    const at = id ? cards.findIndex((card) => card.id === id) : -1;
    return { index: Math.max(0, at), restored: at > 0 };
  });
  /** The card nearest center, for which slides hold real art. Follows the scroll, never per frame. */
  const [near, setNear] = useState(opened.index);
  /** The card at rest in the center. Null while the row moves. */
  const [settled, setSettled] = useState<number | null>(opened.index);
  /** The slide that carries the label: the last one the row rested on. */
  const [labelAt, setLabelAt] = useState(opened.index);
  const [announce, setAnnounce] = useState("");
  /** One gentle hint that the row scrolls, the first time this profile is seen. */
  const [nudge] = useState(() => slides > 1 && !opened.restored && !nudged.has(memoryKey));

  const state = useRef({
    pitch: 0,
    clamp: 0,
    center: opened.index,
    /** The center of the mounted window, as last asked for. */
    near: opened.index,
    moving: false,
    /** The last thing to move the row was the reader's own swipe (or its momentum), not the code. */
    user: false,
    frame: 0,
    timer: 0 as ReturnType<typeof setTimeout> | 0,
    painted: [] as number[],
  });
  const tick = useRef(createTickGate());
  const latest = useRef({ cards, slides, username, values });
  useEffect(() => {
    latest.current = { cards, slides, username, values };
  });

  useEffect(() => {
    if (nudge) nudged.add(memoryKey);
  }, [memoryKey, nudge]);

  const scrollToIndex = useCallback(
    (index: number, smooth: boolean) => {
      const row = rowRef.current;
      const s = state.current;
      if (!row || !(s.pitch > 0)) return;
      const next = Math.min(latest.current.slides - 1, Math.max(0, index));
      // A scroll the code starts is silent: no tick.
      s.user = false;
      row.scrollTo({ left: next * s.pitch, behavior: smooth && !reduced ? "smooth" : "auto" });
    },
    [reduced],
  );

  const centerSlide = useCallback((index: number) => scrollToIndex(index, true), [scrollToIndex]);

  // Geometry is read on mount and on resize only, never while the row scrolls.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const s = state.current;
    function measure(recenter: boolean) {
      const first = row!.querySelector<HTMLElement>('[data-slide="0"]');
      if (!first) return;
      const second = row!.querySelector<HTMLElement>('[data-slide="1"]');
      // Rects, not offsetLeft: the pitch is a fraction of a pixel (62vw), and a rounded one drifts over 200 cards.
      const box = first.getBoundingClientRect();
      const pitch = second ? second.getBoundingClientRect().left - box.left : box.width;
      if (!(pitch > 0)) return;
      const changed = Math.abs(pitch - s.pitch) > 0.01;
      s.pitch = pitch;
      s.clamp = spotClamp(row!.clientWidth, box.width);
      if (recenter && changed) row!.scrollLeft = s.center * pitch;
    }
    measure(false);
    // Back from a card page: the row opens on that card, before the first paint.
    if (opened.index > 0 && s.pitch > 0) row.scrollLeft = opened.index * s.pitch;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure(true));
    observer.observe(row);
    return () => observer.disconnect();
  }, [opened.index]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const s = state.current;
    // Browsers with scroll timelines draw the look themselves. The rest get one property per visible slide.
    const scripted =
      !reduced && !(typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timeline: view()"));

    function paint(left: number) {
      const from = Math.max(0, s.center - 3);
      const to = Math.min(latest.current.slides - 1, s.center + 3);
      const next: number[] = [];
      for (let index = from; index <= to; index += 1) {
        const slide = row!.children[index + 1] as HTMLElement | undefined;
        if (!slide) continue;
        slide.style.setProperty("--spot-a", spotAmount(index * s.pitch - left, s.clamp).toFixed(4));
        next.push(index);
      }
      for (const index of s.painted) {
        if (index < from || index > to) (row!.children[index + 1] as HTMLElement | undefined)?.style.removeProperty("--spot-a");
      }
      s.painted = next;
    }

    function frame() {
      s.frame = 0;
      if (!(s.pitch > 0)) return;
      const left = row!.scrollLeft;
      const index = centeredIndex(left, s.pitch, latest.current.slides);
      if (index !== s.center) {
        s.center = index;
        if (tick.current(index, performance.now(), s.user)) haptic("select");
        // Which slides hold real art follows along every second card, at low priority, so it never holds up a frame.
        if (windowShouldMove(index, s.near)) {
          s.near = index;
          startTransition(() => setNear(index));
        }
      }
      if (scripted) paint(left);
    }

    function rest() {
      s.timer = 0;
      const index = s.pitch > 0 ? centeredIndex(row!.scrollLeft, s.pitch, latest.current.slides) : s.center;
      const wasUser = s.user;
      s.center = index;
      s.near = index;
      s.moving = false;
      tick.current(index, performance.now(), false);
      const card = latest.current.cards[index];
      if (card) lastCentered.set(latest.current.username.toLowerCase(), card.id);
      else lastCentered.delete(latest.current.username.toLowerCase());
      setNear(index);
      setSettled(index);
      setLabelAt(index);
      if (wasUser) {
        setAnnounce(card ? cardName(card, latest.current.values.get(card.id)) : `See all ${latest.current.cards.length} cards`);
      }
    }

    function onScroll() {
      if (!s.moving) {
        s.moving = true;
        setSettled(null);
      }
      if (!s.frame) s.frame = requestAnimationFrame(frame);
      if (s.timer) clearTimeout(s.timer);
      s.timer = setTimeout(rest, SETTLE_MS);
    }
    function onScrollEnd() {
      if (s.timer) clearTimeout(s.timer);
      rest();
    }
    // A finger or a wheel on the row: from here the row moves by the reader's hand, until the code scrolls it.
    function onHand() {
      s.user = true;
    }

    if (scripted && s.pitch > 0) paint(row.scrollLeft);
    const passive = { passive: true } as const;
    row.addEventListener("scroll", onScroll, passive);
    row.addEventListener("scrollend", onScrollEnd, passive);
    row.addEventListener("touchstart", onHand, passive);
    row.addEventListener("wheel", onHand, passive);
    return () => {
      row.removeEventListener("scroll", onScroll);
      row.removeEventListener("scrollend", onScrollEnd);
      row.removeEventListener("touchstart", onHand);
      row.removeEventListener("wheel", onHand);
      if (s.frame) cancelAnimationFrame(s.frame);
      if (s.timer) clearTimeout(s.timer);
      s.frame = 0;
      s.timer = 0;
    };
  }, [reduced]);

  // A new order (values arrived, a card went public): stay on the card that was centered.
  const order = useMemo(() => cards.map((card) => card.id).join(","), [cards]);
  const lastOrder = useRef(order);
  useLayoutEffect(() => {
    if (lastOrder.current === order) return;
    lastOrder.current = order;
    const row = rowRef.current;
    const s = state.current;
    const id = lastCentered.get(memoryKey);
    const at = id ? cards.findIndex((card) => card.id === id) : -1;
    const index = Math.min(slides - 1, Math.max(0, at >= 0 ? at : s.center));
    s.center = index;
    s.near = index;
    if (row && s.pitch > 0) row.scrollLeft = index * s.pitch;
    setNear(index);
    setSettled(index);
    setLabelAt(index);
  }, [cards, memoryKey, order, slides]);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.target !== event.currentTarget) return;
    const s = state.current;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      scrollToIndex(s.center + (event.key === "ArrowRight" ? 1 : -1), true);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const card = cards[s.center];
    const href = card ? cardHref(username, card.id) : seeAllHref;
    // The card page's skeleton shows at once, as it does for a tapped tile.
    if (card) startPendingNav(window, href);
    router.push(href);
  }

  const [from, to] = mountedWindow(near, slides);
  const tintCard = cards[labelAt] ?? cards[cards.length - 1];

  return (
    <section
      data-spotlight=""
      aria-roledescription="carousel"
      aria-label={`${displayName}'s cards`}
      className={`spot-root relative overflow-hidden ${reduced ? "" : `spot-fx spot-enter ${nudge ? "spot-nudge" : ""}`}`.trim()}
    >
      <SpotlightStyles />
      {/* One layer behind the centered card. Soft gradients, drawn once; only its transform moves. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="spot-glow" style={{ ["--spot-tint" as string]: glowTint(tintCard?.accent) }} />
      </div>
      {/* `relative`: the row holds its own screen-reader words, so a card scrolled far right can't widen the page. */}
      <ul
        ref={rowRef}
        data-no-pull
        data-spot-row=""
        tabIndex={0}
        aria-label="Cards"
        onKeyDown={onKeyDown}
        className="spot-row relative flex overflow-x-auto overflow-y-hidden pt-3 pb-5 outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-inset"
      >
        <li aria-hidden className="spot-edge" />
        {cards.map((card, index) => (
          <Slide
            key={card.id}
            card={card}
            value={values.get(card.id)}
            index={index}
            href={cardHref(username, card.id)}
            live={index >= from && index <= to}
            layer={Math.abs(index - near) <= SPOT_LAYERS}
            centered={settled === index}
            labelled={labelAt === index}
            labelOn={settled === index}
            first={index === opened.index}
            onSide={centerSlide}
          />
        ))}
        {seeAll ? (
          <SeeAllSlide index={cards.length} href={seeAllHref} count={seeAllCount} layer={Math.abs(cards.length - near) <= SPOT_LAYERS} />
        ) : null}
        <li aria-hidden className="spot-edge" />
      </ul>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}

/** The row's place while the cards load: the same height, so nothing below it moves. */
export function SpotlightSkeleton() {
  return (
    <div data-spotlight-skeleton="" aria-hidden className="spot-root relative overflow-hidden">
      <SpotlightStyles />
      <div className="flex items-center justify-center pt-3 pb-5">
        <div className="-mr-3 h-[var(--spot-h)] w-[var(--spot-w)] shrink-0 scale-[0.78] rounded-xl bg-zinc-200 opacity-50 dark:bg-white/[0.06]" />
        <div className="h-[var(--spot-h)] w-[var(--spot-w)] shrink-0 skeleton-shimmer rounded-xl" />
        <div className="-ml-3 h-[var(--spot-h)] w-[var(--spot-w)] shrink-0 scale-[0.78] rounded-xl bg-zinc-200 opacity-50 dark:bg-white/[0.06]" />
      </div>
    </div>
  );
}

/** Your own profile with no public card yet: one slim prompt where the row will be. */
export function SpotlightPrompt() {
  return (
    <div
      data-spotlight-prompt=""
      className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-violet-500/50 pr-4 pl-4 dark:border-[#A78BFA]/40"
    >
      <Link
        href="/collection"
        className={`flex min-h-11 min-w-0 flex-1 items-center rounded-md py-2 text-13 leading-5 text-zinc-700 dark:text-zinc-300 ${focusRing}`}
      >
        Mark a card public and it shows up here
      </Link>
      <Link
        href="/cards/new"
        className={`inline-flex min-h-11 shrink-0 items-center rounded-md text-13 font-semibold text-violet-700 dark:text-[#A78BFA] ${focusRing}`}
      >
        Add a card
      </Link>
    </div>
  );
}

/**
 * What sits under a profile's bio and counts. Cards: the carousel. Still
 * loading: its skeleton, the same height. No public cards: a slim prompt on
 * your own profile, and nothing at all on someone else's.
 */
export function ProfileSpotlight({
  cards,
  loading,
  own,
  username,
  displayName,
  values,
}: {
  cards: readonly PublicCard[];
  loading: boolean;
  own: boolean;
  username: string;
  displayName: string;
  values: ReadonlyMap<string, CardValueResult>;
}) {
  if (loading) return <SpotlightSkeleton />;
  if (cards.length === 0) return own ? <SpotlightPrompt /> : null;
  return <SpotlightCarousel cards={cards} username={username} displayName={displayName} values={values} />;
}
