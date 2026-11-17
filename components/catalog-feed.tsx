"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SignInReason } from "@/components/catalog-feed-comments";
import { ArrowLeft, Bookmark, Heart, MessageCircle, Plus, Send } from "lucide-react";
import { backLinkClick } from "@/components/nav-motion";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { useReducedMotion } from "@/components/timeline-ui";
import { absoluteUrl, copyText } from "@/components/share-button";
import { initials } from "@/lib/format";
import { haptic } from "@/lib/ios/haptics";
import { isNativeApp } from "@/lib/ios/platform";
import { nativeShare } from "@/lib/ios/share";
import { postSharePayload, shareOrCopy } from "@/lib/share/sheet";
import { signupPath } from "@/lib/auth/safe-next";
import { cardIdentityKey } from "@/lib/social/card-identity";
import { userHref } from "@/lib/social/user-href";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { cardSocialClient } from "@/lib/catalog-feed/card-client";
import { wantLabel } from "@/lib/wants/label";
import { CATALOG_PATH, CATALOG_SPORTS } from "@/lib/public-catalog/query";
import {
  appendFeed,
  DOUBLE_TAP_MS,
  doubleTapHeart,
  EMPTY_TASTE,
  FEED_API,
  FEED_LOAD_AHEAD,
  FEED_TABS,
  feedCardLabel,
  feedCount,
  feedEmptyText,
  feedGlow,
  feedIdentity,
  feedPills,
  feedSearch,
  feedSetLine,
  feedWindow,
  heartTap,
  mixFeed,
  prefetchUrls,
  tasteFrom,
  type FeedCard,
  type FeedFilters,
  type FeedPage,
  type FeedTab,
  type FeedTaste,
} from "@/lib/catalog-feed/feed";
import {
  addTaste,
  deviceStore,
  loadSeen,
  loadSpot,
  loadTaste,
  saveSeen,
  saveSpot,
  sessionStore,
} from "@/lib/catalog-feed/session";

const CommentsSheet = dynamic(() => import("@/components/catalog-feed-comments").then((mod) => mod.CommentsSheet), {
  ssr: false,
});
const SignInPrompt = dynamic(() => import("@/components/catalog-feed-comments").then((mod) => mod.SignInPrompt), {
  ssr: false,
});

/** Room for the overlay at the top (tabs and sport chips) and the tab bar at the bottom. */
const TOP_ROOM = "pt-[calc(env(safe-area-inset-top)+6.75rem)]";
const BOTTOM_ROOM = "pb-[calc(env(safe-area-inset-bottom)+5rem)]";
/** The rail's column on a phone. The photo centers in what is left. */
const RAIL_ROOM = "pr-[4.5rem]";

/** A card-shaped box (5:7) as big as its container allows. The container sets container-type: size. */
const CARD_BOX = "aspect-[5/7] w-[min(100cqw,calc(100cqh*5/7))]";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-violet-500";

type Heart = { liked: boolean; count: number };
type Burst = { key: number; x: number; y: number };

function cardHeart(card: FeedCard, hearts: Record<string, Heart>): Heart {
  return hearts[card.id] ?? { liked: false, count: card.likeCount };
}

/** The URL keeps the tab and sport, so a share or a reload opens the same feed. */
function writeUrl(filters: FeedFilters) {
  try {
    window.history.replaceState(window.history.state, "", `${CATALOG_PATH}${feedSearch(filters)}`);
  } catch {
    // Some webviews refuse replaceState. The feed still switches.
  }
}

async function readPage(filters: FeedFilters, offset: number, signal?: AbortSignal): Promise<FeedPage> {
  const response = await fetch(`${FEED_API}${feedSearch(filters, offset)}`, {
    signal,
    credentials: filters.tab === "following" ? "same-origin" : "omit",
  });
  if (!response.ok) throw new Error("Couldn't load cards");
  return (await response.json()) as FeedPage;
}

/**
 * The Slabhold Catalog: every public card, one per screen. Swipe up for the
 * next. For You mixes new posts, popular cards, people you follow and the
 * sports and players you own or hearted. A card never shows twice in a
 * session, and Back from a card lands on the same card.
 */
export function CatalogFeed({
  initial,
  initialFilters,
}: {
  initial: FeedPage;
  initialFilters: FeedFilters;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { user, follows, toggleFollow, isFollowing } = useSocial();
  const { cards: owned } = useCollection();
  const viewerId = user?.id ?? null;

  const [filters, setFilters] = useState<FeedFilters>(initialFilters);
  const [cards, setCards] = useState<FeedCard[]>(initial.cards);
  const [nextOffset, setNextOffset] = useState<number | null>(initial.nextOffset);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [index, setIndex] = useState(0);
  const [hearts, setHearts] = useState<Record<string, Heart>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [commentsFor, setCommentsFor] = useState<FeedCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const loadingMore = useRef(false);
  const restored = useRef(false);
  const tasteList = useRef(loadTaste(null));
  const [signIn, setSignIn] = useState<SignInReason | null>(null);
  /** The newest heart tap per card. An older reply never undoes a newer tap. */
  const likeTaps = useRef<Map<string, number>>(new Map());

  // Following, for the mix: the people the viewer follows right now.
  const followingIds = useMemo(
    () => (viewerId ? follows.filter((edge) => edge.followerId === viewerId).map((edge) => edge.followingId) : []),
    [follows, viewerId],
  );
  const tasteRef = useRef<FeedTaste>(EMPTY_TASTE);
  const ownedTaste = useMemo(
    () => owned.map((card) => ({ sport: card.sport ?? "", playerName: card.playerName })),
    [owned],
  );
  useEffect(() => {
    tasteRef.current = tasteFrom({
      owned: ownedTaste,
      liked: tasteList.current,
      following: followingIds,
      viewerId,
    });
  }, [ownedTaste, followingIds, viewerId]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 2400);
  }, []);

  /** Jump the scroller to a slide with no animation (restore, tab switch). */
  const jumpTo = useCallback((to: number) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = to * node.clientHeight;
  }, []);

  // First paint: restore the saved spot (Back from a card), or mix the
  // server's page with what this viewer likes. The first card stays put.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const store = sessionStore();
    seen.current = loadSeen(store);
    tasteList.current = loadTaste(deviceStore());
    tasteRef.current = tasteFrom({ owned: ownedTaste, liked: tasteList.current, following: followingIds, viewerId });
    const spot = loadSpot(store, initialFilters);
    // Applied on the next frame: the server's first card paints, then the saved spot takes over.
    requestAnimationFrame(() => {
      if (spot) {
        setCards(spot.cards);
        setNextOffset(spot.nextOffset);
        setIndex(spot.index);
        requestAnimationFrame(() => jumpTo(spot.index));
        return;
      }
      if (initialFilters.tab === "for-you" && initial.cards.length > 2) {
        const [head, ...rest] = initial.cards;
        setCards([head, ...mixFeed(rest, tasteRef.current, new Set())]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every card that reaches the screen is seen for the rest of the session.
  const current = cards[index];
  useEffect(() => {
    if (!current) return;
    if (!seen.current.has(current.id)) {
      seen.current.add(current.id);
      saveSeen(sessionStore(), seen.current);
    }
    router.prefetch(current.href);
  }, [current, router]);

  // Warm the next three photos so a swipe never lands on a blank.
  useEffect(() => {
    for (const url of prefetchUrls(cards, index)) {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
    }
  }, [cards, index]);

  // Save the spot whenever it moves, so Back and a tab switch return to it.
  useEffect(() => {
    if (!restored.current || cards.length === 0) return;
    saveSpot(sessionStore(), filters, { cards, nextOffset, index });
  }, [cards, nextOffset, index, filters]);

  // Hearts and saves the viewer already has on these cards.
  const known = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = cards.filter((card) => !known.current.has(card.id));
    if (fresh.length === 0) return;
    for (const card of fresh) known.current.add(card.id);
    if (!viewerId) return;
    let cancelled = false;
    void loadSupabaseBrowser()
      .then(async (supabase) => {
        if (!supabase || cancelled) return;
        const keys = new Map(fresh.map((card) => [cardIdentityKey(feedIdentity(card)), card.id]));
        const [likedCards, wants] = await Promise.all([
          cardSocialClient.likedCards(viewerId, fresh.map((card) => card.id)).catch(() => new Set<string>()),
          supabase.from("want_list").select("card_key").eq("user_id", viewerId).in("card_key", [...keys.keys()]),
        ]);
        if (cancelled) return;
        setHearts((state) => {
          const next = { ...state };
          for (const card of fresh) {
            // A tap that already happened wins over this read.
            if (likedCards.has(card.id) && !next[card.id]) {
              next[card.id] = { liked: true, count: Math.max(1, card.likeCount) };
            }
          }
          return next;
        });
        const savedIds = ((wants.data ?? []) as { card_key: string }[])
          .map((row) => keys.get(row.card_key))
          .filter((id): id is string => Boolean(id));
        if (savedIds.length) setSaved((state) => ({ ...Object.fromEntries(savedIds.map((id) => [id, true])), ...state }));
      })
      .catch(() => {
        // The rail shows not-liked and not-saved until the next page.
      });
    return () => {
      cancelled = true;
    };
  }, [cards, viewerId]);

  const loadMore = useCallback(async () => {
    if (loadingMore.current || nextOffset == null) return;
    loadingMore.current = true;
    try {
      const page = await readPage(filters, nextOffset);
      const mixed = filters.tab === "for-you" ? mixFeed(page.cards, tasteRef.current, seen.current) : page.cards;
      setCards((list) => appendFeed(list, mixed, seen.current));
      setNextOffset(page.nextOffset);
    } catch {
      // The next swipe asks again.
    } finally {
      loadingMore.current = false;
    }
  }, [filters, nextOffset]);

  useEffect(() => {
    if (cards.length - index <= FEED_LOAD_AHEAD) void loadMore();
  }, [cards.length, index, loadMore]);

  // The slide on screen, from the scroll position. One read per frame.
  const frame = useRef(0);
  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const node = scroller.current;
      if (!node || node.clientHeight === 0) return;
      setIndex(Math.max(0, Math.round(node.scrollTop / node.clientHeight)));
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Arrow keys and J / K page on a keyboard.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (commentsFor || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const down = event.key === "ArrowDown" || event.key === "j";
      const up = event.key === "ArrowUp" || event.key === "k";
      if (!down && !up) return;
      event.preventDefault();
      const node = scroller.current;
      if (!node) return;
      const to = Math.max(0, Math.round(node.scrollTop / node.clientHeight) + (down ? 1 : -1));
      node.scrollTo?.({ top: to * node.clientHeight, behavior: reducedMotion ? "auto" : "smooth" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commentsFor, reducedMotion]);

  const switchTo = useCallback(
    async (next: FeedFilters) => {
      if (next.tab === filters.tab && next.sport === filters.sport) {
        // The chip you are on: back to the first card.
        scroller.current?.scrollTo?.({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
        return;
      }
      saveSpot(sessionStore(), filters, { cards, nextOffset, index });
      setFilters(next);
      writeUrl(next);
      const spot = loadSpot(sessionStore(), next);
      if (spot) {
        setCards(spot.cards);
        setNextOffset(spot.nextOffset);
        setIndex(spot.index);
        setStatus("idle");
        requestAnimationFrame(() => jumpTo(spot.index));
        return;
      }
      setCards([]);
      setIndex(0);
      setNextOffset(null);
      setStatus("loading");
      jumpTo(0);
      try {
        const page = await readPage(next, 0);
        const list = next.tab === "for-you" ? mixFeed(page.cards, tasteRef.current, seen.current) : page.cards;
        // Everything in this tab was seen already: show it again rather than a blank.
        setCards(list.length > 0 ? list : page.cards);
        setNextOffset(page.nextOffset);
        setStatus("idle");
      } catch {
        setStatus("error");
      }
    },
    [cards, filters, index, jumpTo, nextOffset, reducedMotion],
  );

  const retry = useCallback(() => {
    const again = filters;
    void (async () => {
      setStatus("loading");
      try {
        const page = await readPage(again, 0);
        setCards(page.cards);
        setNextOffset(page.nextOffset);
        setStatus("idle");
      } catch {
        setStatus("error");
      }
    })();
  }, [filters]);

  const like = useCallback(
    (card: FeedCard, mode: "tap" | "double") => {
      if (!viewerId) {
        setSignIn("like");
        return false;
      }
      const before = cardHeart(card, hearts);
      const after = mode === "double" ? doubleTapHeart(before) : heartTap(before);
      // A double tap on a card already hearted shows the burst and changes nothing.
      if (after === before) return true;
      setHearts((state) => ({ ...state, [card.id]: after }));
      if (after.liked) {
        haptic("like");
        try {
          navigator.vibrate?.(8);
        } catch {
          // No vibration here.
        }
        tasteList.current = addTaste(deviceStore(), card);
        tasteRef.current = tasteFrom({ owned: ownedTaste, liked: tasteList.current, following: followingIds, viewerId });
      }
      const tap = (likeTaps.current.get(card.id) ?? 0) + 1;
      likeTaps.current.set(card.id, tap);
      const latestTap = () => likeTaps.current.get(card.id) === tap;
      void cardSocialClient
        .like({ cardId: card.id, liked: after.liked })
        .then((result) => {
          if (!latestTap()) return;
          if (!result.ok) {
            setHearts((state) => ({ ...state, [card.id]: before }));
            showToast(result.error);
            return;
          }
          // The saved count, which includes hearts from everyone since this page loaded.
          if (result.likeCount != null) {
            const count = result.likeCount;
            setHearts((state) => ({ ...state, [card.id]: { liked: result.liked, count } }));
          }
        })
        .catch(() => {
          if (!latestTap()) return;
          setHearts((state) => ({ ...state, [card.id]: before }));
          showToast("Couldn't save that like. Try again.");
        });
      return true;
    },
    [followingIds, hearts, ownedTaste, showToast, viewerId],
  );

  const save = useCallback(
    async (card: FeedCard) => {
      if (!viewerId) {
        setSignIn("save");
        return;
      }
      const was = Boolean(saved[card.id]);
      setSaved((state) => ({ ...state, [card.id]: !was }));
      if (!was) haptic("save");
      const identity = feedIdentity(card);
      const cardKey = cardIdentityKey(identity);
      try {
        const supabase = await loadSupabaseBrowser();
        if (!supabase) throw new Error("offline");
        const { error } = was
          ? await supabase.from("want_list").delete().eq("user_id", viewerId).eq("card_key", cardKey)
          : await supabase.from("want_list").upsert(
              {
                user_id: viewerId,
                card_key: cardKey,
                source_card_id: card.id,
                label: wantLabel(identity) || card.player,
                target_price: null,
              },
              { onConflict: "user_id,card_key", ignoreDuplicates: true },
            );
        if (error) throw error;
        showToast(was ? "Removed from your wants" : "Saved to your wants");
      } catch {
        setSaved((state) => ({ ...state, [card.id]: was }));
        showToast("Couldn't save that. Try again.");
      }
    },
    [saved, showToast, viewerId],
  );

  const follow = useCallback(
    async (card: FeedCard) => {
      if (!viewerId) {
        setSignIn("follow");
        return;
      }
      setFollowed((state) => ({ ...state, [card.owner.id]: true }));
      haptic("follow");
      const result = await toggleFollow(card.owner.id);
      if (result.error) {
        setFollowed((state) => ({ ...state, [card.owner.id]: false }));
        showToast(result.error);
      }
    },
    [showToast, toggleFollow, viewerId],
  );

  const share = useCallback(
    async (card: FeedCard) => {
      const title = `${card.player} on Slabhold`;
      const result = await shareOrCopy(
        postSharePayload({ title, text: `${card.player}, ${feedSetLine(card)}`, url: absoluteUrl(card.href) }),
        { share: isNativeApp() ? nativeShare : navigator.share?.bind(navigator), copy: copyText },
      );
      if (result === "copied") showToast("Link copied");
    },
    [showToast],
  );

  const open = useCallback(
    (card: FeedCard) => {
      saveSpot(sessionStore(), filters, { cards, nextOffset, index });
      router.push(card.href);
    },
    [cards, filters, index, nextOffset, router],
  );

  // Slides get stable handlers, so a heart on one card never redraws the others.
  const comment = useCallback(
    (card: FeedCard) => {
      if (!viewerId) setSignIn("comment");
      else setCommentsFor(card);
    },
    [viewerId],
  );
  const latest = useRef({ like, save, follow, share, open, comment });
  useEffect(() => {
    latest.current = { like, save, follow, share, open, comment };
  });
  const handlers = useMemo(
    () => ({
      like: (card: FeedCard, mode: "tap" | "double") => latest.current.like(card, mode),
      save: (card: FeedCard) => void latest.current.save(card),
      follow: (card: FeedCard) => void latest.current.follow(card),
      share: (card: FeedCard) => void latest.current.share(card),
      open: (card: FeedCard) => latest.current.open(card),
      comment: (card: FeedCard) => latest.current.comment(card),
    }),
    [],
  );

  const window_ = feedWindow(index, cards.length);
  const emptyText = feedEmptyText(filters, Boolean(viewerId));
  const ended = nextOffset == null && status === "idle" && cards.length > 0;

  return (
    <div
      data-catalog-feed=""
      className="fixed inset-0 z-[21] bg-[var(--background)] text-[var(--foreground)]"
    >
      <FeedTop filters={filters} onSwitch={(next) => void switchTo(next)} />
      <div
        ref={scroller}
        onScroll={onScroll}
        data-feed-scroller=""
        data-no-pull=""
        aria-label="Public cards"
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {status === "loading" ? <SkeletonSlide /> : null}
        {status === "error" ? <ErrorSlide onRetry={retry} /> : null}
        {status === "idle" && cards.length === 0 ? (
          <EmptySlide
            title={emptyText.title}
            body={emptyText.body}
            tab={filters.tab}
            signedIn={Boolean(viewerId)}
            onForYou={() => void switchTo({ ...filters, tab: "for-you" })}
          />
        ) : null}
        {status === "idle"
          ? cards.map((card, at) => {
              const near = at >= window_.start && at <= window_.end;
              const ownCard = viewerId === card.owner.id;
              return (
                <FeedSlide
                  key={card.id}
                  card={card}
                  near={near}
                  active={at === index}
                  priority={at === 0}
                  heart={cardHeart(card, hearts)}
                  saved={Boolean(saved[card.id])}
                  canFollow={!ownCard && !followed[card.owner.id] && !isFollowing(card.owner.id)}
                  reducedMotion={reducedMotion}
                  onLike={handlers.like}
                  onSave={handlers.save}
                  onFollow={handlers.follow}
                  onShare={handlers.share}
                  onOpen={handlers.open}
                  onComments={handlers.comment}
                />
              );
            })
          : null}
        {ended ? <EndSlide onStartOver={() => jumpTo(0)} /> : null}
        {status === "idle" && nextOffset != null && cards.length > 0 ? <SkeletonSlide /> : null}
      </div>
      {commentsFor ? (
        <CommentsSheet
          card={commentsFor}
          onClose={() => setCommentsFor(null)}
          onCountChange={(cardId, delta) =>
            setCards((list) =>
              list.map((card) =>
                card.id === cardId ? { ...card, commentCount: Math.max(0, card.commentCount + delta) } : card,
              ),
            )
          }
        />
      ) : null}
      {signIn ? <SignInPrompt reason={signIn} onClose={() => setSignIn(null)} /> : null}
      {toast ? (
        <p
          role="status"
          className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-950"
        >
          {toast}
        </p>
      ) : null}
    </div>
  );
}

/** Back, For You / Following, and the sport chips. Sits over the feed with a fade. */
function FeedTop({ filters, onSwitch }: { filters: FeedFilters; onSwitch: (next: FeedFilters) => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-[linear-gradient(to_bottom,var(--background)_0%,color-mix(in_oklab,var(--background)_82%,transparent)_62%,transparent_100%)] pt-[env(safe-area-inset-top)]">
      <div className="pointer-events-auto mx-auto grid h-12 max-w-lg grid-cols-[2.75rem_1fr_2.75rem] items-center px-2">
        <Link
          href="/"
          data-nav-back=""
          onClick={(event) => backLinkClick(event, "/")}
          aria-label="Back to Home"
          className={`grid h-11 w-11 place-items-center rounded-full hover:bg-zinc-900/[0.05] dark:hover:bg-white/10 ${FOCUS}`}
        >
          <ArrowLeft aria-hidden className="h-5 w-5" />
        </Link>
        <h1 className="sr-only">Slabhold Catalog</h1>
        <div role="tablist" aria-label="Feed" className="flex justify-center gap-5">
          {FEED_TABS.map((tab) => {
            const on = filters.tab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onSwitch({ ...filters, tab: tab.id as FeedTab })}
                className={`relative min-h-11 px-1 text-[15px] font-semibold transition-colors duration-150 ${FOCUS} ${
                  on ? "text-[var(--foreground)]" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {tab.label}
                <span
                  aria-hidden
                  className={`absolute inset-x-1 bottom-1.5 h-0.5 rounded-full bg-violet-600 transition-opacity duration-150 ${
                    on ? "opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            );
          })}
        </div>
        <span aria-hidden />
      </div>
      <div
        role="group"
        aria-label="Sport"
        className="pointer-events-auto mx-auto flex max-w-lg gap-2 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {[{ id: null, label: "All" }, ...CATALOG_SPORTS].map((sport) => {
          const on = filters.sport === sport.id;
          return (
            <button
              key={sport.label}
              type="button"
              aria-pressed={on}
              onClick={() => onSwitch({ ...filters, sport: sport.id })}
              className={`hit-44 h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-150 ${FOCUS} ${
                on
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "bg-zinc-900/[0.06] text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-300"
              }`}
            >
              {sport.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FeedSlide = memo(function FeedSlide({
  card,
  near,
  active,
  priority,
  heart,
  saved,
  canFollow,
  reducedMotion,
  onLike,
  onSave,
  onFollow,
  onShare,
  onOpen,
  onComments,
}: {
  card: FeedCard;
  near: boolean;
  active: boolean;
  priority: boolean;
  heart: Heart;
  saved: boolean;
  canFollow: boolean;
  reducedMotion: boolean;
  /** False when nothing happened (signed out): no burst then. */
  onLike: (card: FeedCard, mode: "tap" | "double") => boolean;
  onSave: (card: FeedCard) => void;
  onFollow: (card: FeedCard) => void;
  onShare: (card: FeedCard) => void;
  onOpen: (card: FeedCard) => void;
  onComments: (card: FeedCard) => void;
}) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const lastTap = useRef(0);
  const tapTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(tapTimer.current), []);

  // One tap opens the card, two like it. The first tap waits to see which.
  const onHeroClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    const now = event.timeStamp || Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = 0;
      if (!onLike(card, "double")) return;
      const box = event.currentTarget.getBoundingClientRect();
      const x = event.clientX ? event.clientX - box.left : box.width / 2;
      const y = event.clientY ? event.clientY - box.top : box.height / 2;
      setBursts((list) => [...list.slice(-2), { key: now, x, y }]);
      return;
    }
    lastTap.current = now;
    tapTimer.current = window.setTimeout(() => {
      lastTap.current = 0;
      onOpen(card);
    }, DOUBLE_TAP_MS);
  };

  const pills = feedPills(card);
  const glow = feedGlow(card.accent);

  return (
    <section
      aria-label={feedCardLabel(card)}
      data-feed-slide=""
      data-active={active ? "" : undefined}
      className="relative h-[100dvh] snap-start snap-always overflow-hidden"
    >
      {/* The card's own color behind it, pulled toward brand purple. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-80"
        style={{
          background: `radial-gradient(62% 42% at 50% 44%, color-mix(in oklab, ${glow} 38%, transparent) 0%, transparent 72%)`,
        }}
      />
      <div className={`relative mx-auto flex h-full max-w-lg flex-col ${TOP_ROOM} ${BOTTOM_ROOM}`}>
        <div className={`relative min-h-0 flex-1 px-4 ${RAIL_ROOM} md:pr-[5.5rem]`}>
          <Link
            href={card.href}
            prefetch={false}
            onClick={onHeroClick}
            aria-label={`Open ${card.player}. Double tap to like.`}
            className={`group relative grid h-full w-full place-items-center rounded-2xl [container-type:size] ${FOCUS}`}
          >
            {near ? <Hero card={card} priority={priority} /> : <HeroHold />}
            {bursts.map((burst) => (
              <HeartBurst
                key={burst.key}
                burst={burst}
                reducedMotion={reducedMotion}
                onDone={() => setBursts((list) => list.filter((item) => item.key !== burst.key))}
              />
            ))}
          </Link>
        </div>
        <div className={`relative px-4 pt-4 ${RAIL_ROOM} md:pr-[5.5rem]`}>
          <p className="truncate text-[17px] leading-6 font-semibold tracking-tight">{card.player}</p>
          <p className="truncate text-[13px] leading-5 text-zinc-600 dark:text-zinc-400">{feedSetLine(card)}</p>
          {pills.length ? (
            <ul aria-label="Tags" className="mt-2 flex flex-wrap gap-1.5">
              {pills.map((pill) => (
                <li
                  key={pill.label}
                  className={`rounded-full px-2 py-0.5 font-mono text-[11px] leading-4 font-medium ${
                    pill.tone === "brand"
                      ? "bg-violet-600/12 text-violet-700 dark:bg-violet-400/15 dark:text-[#A78BFA]"
                      : "bg-zinc-900/[0.06] text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-300"
                  }`}
                >
                  {pill.label}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2.5 flex min-h-11 items-center gap-2">
            <Link
              href={userHref(card.owner.username)}
              className={`min-w-0 truncate rounded text-[13px] font-medium text-zinc-700 dark:text-zinc-300 ${FOCUS}`}
            >
              @{card.owner.username}
            </Link>
            {card.priceLabel ? (
              <span className="shrink-0 rounded-full bg-zinc-900/[0.06] px-2 py-0.5 font-mono text-[12px] leading-5 font-medium dark:bg-white/[0.08]">
                <span className="text-zinc-500 dark:text-zinc-400">Value </span>
                {card.priceLabel}
              </span>
            ) : null}
            <Link
              href={card.href}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                onOpen(card);
              }}
              className={`ml-auto inline-flex min-h-11 shrink-0 items-center rounded-full px-1 text-[13px] font-semibold text-violet-700 dark:text-[#A78BFA] ${FOCUS}`}
            >
              See details
            </Link>
          </div>
        </div>
        <Rail
          card={card}
          heart={heart}
          saved={saved}
          canFollow={canFollow}
          onLike={() => onLike(card, "tap")}
          onSave={() => onSave(card)}
          onFollow={() => onFollow(card)}
          onShare={() => onShare(card)}
          onComments={() => onComments(card)}
        />
      </div>
    </section>
  );
});

/** The photo, its true shape, centered and as big as the room allows. No shift while it loads. */
function Hero({ card, priority }: { card: FeedCard; priority: boolean }) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const src = card.imageUrl && failed !== card.imageUrl ? card.imageUrl : null;
  const glow = feedGlow(card.accent);
  if (!src) {
    return (
      <div
        className={`grid place-items-center rounded-xl text-3xl font-semibold text-white shadow-[0_24px_70px_-24px_var(--glow)] ${CARD_BOX}`}
        style={{
          ["--glow" as string]: glow,
          background: `linear-gradient(160deg, ${card.accent}, color-mix(in oklab, ${card.accent} 40%, #09090b))`,
        }}
      >
        {initials(card.player)}
      </div>
    );
  }
  return (
    <>
      {loaded !== src ? (
        <div aria-hidden className={`skeleton-shimmer absolute rounded-xl ${CARD_BOX}`} />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) setLoaded(src);
          else if (img?.complete && img.getAttribute("src")) setFailed(src);
        }}
        onLoad={() => setLoaded(src)}
        onError={() => setFailed(src)}
        style={{ ["--glow" as string]: glow }}
        className={`relative max-h-[100cqh] max-w-[100cqw] rounded-xl object-contain shadow-[0_28px_80px_-28px_var(--glow),0_2px_10px_rgb(0_0_0/0.18)] transition-opacity duration-200 select-none [-webkit-touch-callout:none] motion-reduce:transition-none ${
          loaded === src ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}

/** A far slide keeps its place without drawing a photo. */
function HeroHold() {
  return <div aria-hidden className={`rounded-xl bg-zinc-900/[0.04] dark:bg-white/[0.04] ${CARD_BOX}`} />;
}

function HeartBurst({ burst, reducedMotion, onDone }: { burst: Burst; reducedMotion: boolean; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, reducedMotion ? 450 : 800);
    return () => window.clearTimeout(timer);
  }, [onDone, reducedMotion]);
  return (
    <span
      aria-hidden
      data-heart-burst=""
      className="pointer-events-none absolute"
      style={{ left: burst.x, top: burst.y }}
    >
      <Heart
        className={`h-24 w-24 -translate-x-1/2 -translate-y-1/2 fill-violet-500 text-violet-500 drop-shadow-[0_6px_18px_rgb(0_0_0/0.28)] ${
          reducedMotion ? "animate-[lightbox-fade_200ms_ease-out_both]" : "animate-[feed-heart_800ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
        }`}
      />
    </span>
  );
}

const RAIL_BUTTON = `grid h-12 w-12 place-items-center rounded-full transition-transform duration-150 ease-out motion-safe:active:scale-90 ${FOCUS}`;
const RAIL_WORD = "min-h-4 text-[11px] leading-4 font-medium text-zinc-700 dark:text-zinc-300";
const RAIL_COUNT = "min-h-4 font-mono text-[11px] leading-4 font-medium tabular-nums text-zinc-700 dark:text-zinc-300";

/** Avatar and follow, heart, comments, share and save, down the right side. */
function Rail({
  card,
  heart,
  saved,
  canFollow,
  onLike,
  onSave,
  onFollow,
  onShare,
  onComments,
}: {
  card: FeedCard;
  heart: Heart;
  saved: boolean;
  canFollow: boolean;
  onLike: () => void;
  onSave: () => void;
  onFollow: () => void;
  onShare: () => void;
  onComments: () => void;
}) {
  const [pop, setPop] = useState(0);
  return (
    <div className="absolute right-2 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] flex w-14 flex-col items-center gap-2.5 md:right-4">
      <div className="relative mb-2">
        <Link
          href={userHref(card.owner.username)}
          aria-label={`${card.owner.displayName}, @${card.owner.username}`}
          className={`block h-12 w-12 overflow-hidden rounded-full ring-2 ring-[var(--background)] ${FOCUS}`}
        >
          <OwnerFace owner={card.owner} accent={card.accent} />
        </Link>
        {canFollow ? (
          <button
            type="button"
            aria-label={`Follow @${card.owner.username}`}
            onClick={onFollow}
            className={`absolute -bottom-[1.375rem] left-1/2 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-full ${FOCUS}`}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-violet-600 text-white ring-2 ring-[var(--background)]">
              <Plus aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          </button>
        ) : null}
      </div>
      <div className="flex flex-col items-center">
        <button
          type="button"
          aria-pressed={heart.liked}
          aria-label={heart.liked ? `Unlike, ${heart.count} likes` : `Like, ${heart.count} likes`}
          onClick={() => {
            if (!heart.liked) setPop((n) => n + 1);
            onLike();
          }}
          className={RAIL_BUTTON}
        >
          <Heart
            key={pop}
            aria-hidden
            className={`h-7 w-7 ${heart.liked ? "fill-violet-500 text-violet-500" : ""} ${
              pop ? "motion-safe:animate-[like-pop_320ms_ease-out]" : ""
            }`}
          />
        </button>
        <span className={RAIL_COUNT}>{feedCount(heart.count)}</span>
      </div>
      <div className="flex flex-col items-center">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Comments, ${card.commentCount}`}
          onClick={onComments}
          className={RAIL_BUTTON}
        >
          <MessageCircle aria-hidden className="h-7 w-7" />
        </button>
        <span className={RAIL_COUNT}>{feedCount(card.commentCount)}</span>
      </div>
      <div className="flex flex-col items-center">
        <button type="button" aria-pressed={saved} aria-label={saved ? "Saved to your wants" : "Save to your wants"} onClick={onSave} className={RAIL_BUTTON}>
          <Bookmark aria-hidden className={`h-7 w-7 ${saved ? "fill-violet-500 text-violet-500" : ""}`} />
        </button>
        <span className={RAIL_WORD}>{saved ? "Saved" : "Save"}</span>
      </div>
      <div className="flex flex-col items-center">
        <button type="button" aria-label="Share" onClick={onShare} className={RAIL_BUTTON}>
          <Send aria-hidden className="h-[26px] w-[26px]" />
        </button>
        <span className={RAIL_WORD}>Share</span>
      </div>
    </div>
  );
}

function OwnerFace({ owner, accent }: { owner: FeedCard["owner"]; accent: string }) {
  const [broken, setBroken] = useState(false);
  if (owner.avatarUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={owner.avatarUrl} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />;
  }
  return (
    <span
      className="grid h-full w-full place-items-center text-sm font-semibold text-white"
      style={{ background: `linear-gradient(160deg, ${accent}, color-mix(in oklab, ${accent} 40%, #09090b))` }}
    >
      {initials(owner.displayName || owner.username)}
    </span>
  );
}

function SlideFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section aria-label={label} className="relative h-[100dvh] snap-start snap-always overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: "radial-gradient(60% 40% at 50% 42%, color-mix(in oklab, #7C3AED 22%, transparent) 0%, transparent 70%)" }}
      />
      <div className={`relative mx-auto flex h-full max-w-lg flex-col ${TOP_ROOM} ${BOTTOM_ROOM}`}>{children}</div>
    </section>
  );
}

function SkeletonSlide() {
  return (
    <SlideFrame label="Loading cards">
      <div aria-busy="true" className={`min-h-0 flex-1 px-4 ${RAIL_ROOM} md:pr-[5.5rem]`}>
        <div className="grid h-full w-full place-items-center [container-type:size]">
          <div className={`skeleton-shimmer rounded-xl ${CARD_BOX}`} />
        </div>
      </div>
      <div className={`px-4 pt-4 ${RAIL_ROOM}`}>
        <div className="skeleton-shimmer h-5 w-44 rounded" />
        <div className="skeleton-shimmer mt-2 h-4 w-32 rounded" />
        <div className="mt-3 flex gap-1.5">
          <div className="skeleton-shimmer h-4 w-9 rounded-full" />
          <div className="skeleton-shimmer h-4 w-14 rounded-full" />
        </div>
        <div className="skeleton-shimmer mt-4 h-4 w-24 rounded" />
      </div>
    </SlideFrame>
  );
}

/** Three blank slabs fanned out, in brand purple: the empty and end screens. */
function SlabFan() {
  return (
    <div aria-hidden className="relative mx-auto h-44 w-48">
      {[-12, 0, 12].map((turn, at) => (
        <span
          key={turn}
          className="absolute top-2 left-1/2 h-40 w-28 rounded-xl border border-violet-500/30 bg-[linear-gradient(160deg,color-mix(in_oklab,#7C3AED_26%,var(--background)),color-mix(in_oklab,#5B21B6_14%,var(--background)))] shadow-[0_14px_36px_-18px_rgb(0_0_0/0.45)]"
          style={{ transform: `translateX(-50%) rotate(${turn}deg) translateY(${at === 1 ? -6 : 4}px)`, zIndex: at === 1 ? 2 : 1 }}
        >
          <span className="absolute inset-x-3 top-3 h-4 rounded bg-violet-500/20" />
          <span className="absolute inset-x-3 top-9 bottom-3 rounded-md border border-violet-500/20" />
        </span>
      ))}
    </div>
  );
}

const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]";
const SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-300 dark:text-zinc-100 dark:ring-white/20";

function EmptySlide({
  title,
  body,
  tab,
  signedIn,
  onForYou,
}: {
  title: string;
  body: string;
  tab: FeedTab;
  signedIn: boolean;
  onForYou: () => void;
}) {
  return (
    <SlideFrame label={title}>
      <div data-feed-empty="" className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <SlabFan />
        <h2 className="mt-6 text-xl leading-7 font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-72 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">{body}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {tab === "following" && !signedIn ? (
            <Link href={signupPath(CATALOG_PATH)} className={`${PRIMARY} ${FOCUS}`}>
              Log in
            </Link>
          ) : tab === "following" ? (
            <button type="button" onClick={onForYou} className={`${PRIMARY} ${FOCUS}`}>
              Find collectors
            </button>
          ) : (
            <Link href="/cards/new" className={`${PRIMARY} ${FOCUS}`}>
              Add a card
            </Link>
          )}
          {tab === "following" && !signedIn ? (
            <button type="button" onClick={onForYou} className={`${SECONDARY} ${FOCUS}`}>
              Browse For You
            </button>
          ) : null}
        </div>
      </div>
    </SlideFrame>
  );
}

function ErrorSlide({ onRetry }: { onRetry: () => void }) {
  return (
    <SlideFrame label="Couldn't load cards">
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <SlabFan />
        <h2 className="mt-6 text-xl leading-7 font-semibold tracking-tight">Couldn&apos;t load cards</h2>
        <p className="mt-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">Check your connection and try again.</p>
        <button type="button" onClick={onRetry} className={`mt-6 ${PRIMARY} ${FOCUS}`}>
          Try again
        </button>
      </div>
    </SlideFrame>
  );
}

function EndSlide({ onStartOver }: { onStartOver: () => void }) {
  return (
    <SlideFrame label="You're all caught up">
      <div data-feed-end="" className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <SlabFan />
        <h2 className="mt-6 text-xl leading-7 font-semibold tracking-tight">You&apos;re all caught up</h2>
        <p className="mt-2 max-w-72 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">
          New public cards land here as collectors add them.
        </p>
        <button type="button" onClick={onStartOver} className={`mt-6 ${SECONDARY} ${FOCUS}`}>
          Back to the top
        </button>
      </div>
    </SlideFrame>
  );
}
