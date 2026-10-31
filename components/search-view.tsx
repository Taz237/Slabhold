"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Clock, Search, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ResolvedPlayerName } from "@/components/resolved-player-name";
import { CardThumb } from "@/components/card-thumb";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { EmptyState, LoadingRows } from "@/components/status";
import { CARD_CATALOG, type CatalogCard } from "@/lib/card-catalog";
import {
  CATALOG_SEARCH_DEBOUNCE_MS,
  CATALOG_SEARCH_TIMEOUT_MESSAGE,
  catalogSearchNeedsRetry,
  loadCatalogSearchSession,
} from "@/lib/catalog/catalog-search-session";
import { searchCatalogRemote } from "@/lib/catalog/search-remote";
import { cardSubtitle, cardTitle, timeAgo } from "@/lib/format";
import { userHref } from "@/lib/social/user-href";
import {
  SEARCH_CATALOG_LIMIT,
  catalogAddHref,
  catalogResultLine,
  catalogSecondaryLink,
} from "@/lib/search/catalog-results";
import {
  addCardQuery,
  createRecentSearchStore,
  parseRecentSearches,
  recentSearchKey,
  rememberRecentSearch,
} from "@/lib/search/recent";
import {
  SEARCH_ADD_CARD_LABEL,
  SEARCH_IDLE_DETAIL,
  addCardSearchHref,
  recentPlayerNames,
  searchEmptyTitle,
  showSearchMissLink,
  suggestedSearchPlayers,
  visibleSearchSections,
} from "@/lib/search/sections";
import { matchesEverySearchWord, matchesPlainWords, ownCardSearchFields } from "@/lib/search/words";

/** @ queries are people searches. Skip the catalog RPC and its skeleton. */
function wantsCatalogSearch(query: string) {
  return query.length > 0 && !query.startsWith("@");
}

const recentAccounts = createRecentSearchStore();

const recentListeners = new Set<() => void>();

function subscribeRecent(listener: () => void) {
  recentListeners.add(listener);
  return () => recentListeners.delete(listener);
}

function notifyRecent() {
  recentListeners.forEach((listener) => listener());
}

function useRecentSearches(userId: string | null) {
  const key = recentSearchKey(userId);
  const raw = useSyncExternalStore(
    subscribeRecent,
    () => {
      try {
        return window.localStorage.getItem(key) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  return useMemo(() => parseRecentSearches(raw), [raw]);
}

function searchHref(term: string) {
  const trimmed = addCardQuery(term.trim());
  if (!trimmed) return "/search";
  return `/search?q=${encodeURIComponent(trimmed)}`;
}

export function SearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQ = (searchParams.get("q") ?? "").trim();
  const urlQ = addCardQuery(rawQ);
  const { ready: socialReady, profiles, homePosts, blockedIds, user, publicCards, refresh } = useSocial();
  const { ready: cardsReady, cards, reload } = useCollection();
  const [query, setQuery] = useState(urlQ);
  const recentOwner = user?.id ?? null;
  const recent = useRecentSearches(recentOwner);

  useEffect(() => {
    try {
      recentAccounts.dropShared(window.localStorage);
    } catch {
      // Site storage can be blocked. Search still works with no recent list.
    }
  }, []);
  const typed = query.trim();
  const [catalogFor, setCatalogFor] = useState(urlQ.trim());
  const [catalogCards, setCatalogCards] = useState<CatalogCard[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(wantsCatalogSearch(urlQ.trim()));
  const [catalogTrouble, setCatalogTrouble] = useState(false);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const catalogRequest = useRef(0);
  if (catalogFor !== typed) {
    setCatalogFor(typed);
    setCatalogCards([]);
    setCatalogTrouble(false);
    setCatalogLoading(wantsCatalogSearch(typed));
  }

  useEffect(() => {
    setQuery(urlQ);
    if (rawQ !== urlQ) router.replace(searchHref(urlQ), { scroll: false });
  }, [rawQ, router, urlQ]);

  useEffect(() => {
    if (!wantsCatalogSearch(typed)) {
      catalogRequest.current += 1;
      return;
    }
    const id = ++catalogRequest.current;
    const session = loadCatalogSearchSession({
      query: typed,
      limit: SEARCH_CATALOG_LIMIT,
      debounceMs: CATALOG_SEARCH_DEBOUNCE_MS,
      search: searchCatalogRemote,
    });
    void session.done.then((snapshot) => {
      if (snapshot.aborted || id !== catalogRequest.current) return;
      setCatalogCards(snapshot.results.slice(0, SEARCH_CATALOG_LIMIT));
      setCatalogTrouble(catalogSearchNeedsRetry(snapshot));
      setCatalogLoading(false);
    });
    return () => {
      session.abort();
    };
  }, [catalogAttempt, typed]);

  function setSearchQuery(next: string) {
    const clipped = addCardQuery(next);
    setQuery(clipped);
    const href = searchHref(clipped);
    const current = searchHref(urlQ);
    if (href !== current) {
      router.replace(href, { scroll: false });
    }
  }

  const people = useMemo(() => {
    if (!typed) return [];
    const hidden = new Set(blockedIds);
    const rank = typed.toLowerCase().replace(/^@+/, "");
    return profiles
      .filter((profile) => !hidden.has(profile.id))
      .filter((profile) => matchesPlainWords(typed, [profile.username, profile.displayName]))
      .sort((a, b) => {
        const score = (profile: { username: string; displayName: string }) => {
          const handle = profile.username.toLowerCase();
          const name = profile.displayName.toLowerCase();
          if (handle === rank || name === rank) return 0;
          if (handle.startsWith(rank) || name.startsWith(rank)) return 1;
          return 2;
        };
        return score(a) - score(b);
      });
  }, [blockedIds, profiles, typed]);

  const matchedPosts = useMemo(() => {
    if (!typed) return [];
    return homePosts.filter((post) => matchesPlainWords(typed, [post.body]));
  }, [homePosts, typed]);

  const matchedCards = useMemo(() => {
    if (!typed) return [];
    return cards.filter((card) =>
      matchesEverySearchWord(typed, ownCardSearchFields(card), { grade: card.grade }),
    );
  }, [cards, typed]);

  const authors = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  const suggestions = useMemo(
    () =>
      suggestedSearchPlayers({
        recentPlayers: recentPlayerNames(cards),
        catalogPlayers: CARD_CATALOG.map((card) => card.playerName),
      }),
    [cards],
  );

  function publishRecent(items: string[]) {
    try {
      recentAccounts.save(window.localStorage, recentOwner, items);
      notifyRecent();
    } catch {
      // Site storage can be blocked. Search still works with no recent list.
    }
  }

  function remember(term: string) {
    const saved = rememberRecentSearch(recent, term);
    if (saved === recent) return;
    publishRecent(saved);
  }

  function forget(term: string) {
    publishRecent(recent.filter((item) => item !== term));
  }

  function clearRecent() {
    publishRecent([]);
  }

  function refreshSearch() {
    reload();
    return refresh();
  }

  const loading = !socialReady || !cardsReady;
  const visibleSections = visibleSearchSections({
    people: people.length,
    posts: matchedPosts.length,
    catalog: catalogCards.length,
    myCards: matchedCards.length,
  });
  const addCardMiss =
    !catalogTrouble &&
    showSearchMissLink({
      query: typed,
      catalogLoading,
      people: people.length,
      posts: matchedPosts.length,
      catalog: catalogCards.length,
      myCards: matchedCards.length,
    });
  const showMiss =
    addCardMiss ||
    (!catalogTrouble && typed.startsWith("@") && !catalogLoading && visibleSections.length === 0);

  function retryCatalog() {
    setCatalogTrouble(false);
    setCatalogLoading(true);
    setCatalogAttempt((current) => current + 1);
  }

  return (
    <PullToRefresh onRefresh={refreshSearch} className="-mx-4 -mt-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          remember(typed);
        }}
        className="sticky top-[var(--app-header-h)] z-10 border-b border-zinc-200 bg-[var(--background)] px-4 py-2.5 dark:border-white/10"
      >
        <label className="flex min-h-12 items-center gap-2 rounded-full bg-zinc-100 px-3 dark:bg-white/10">
          <Search className="h-5 w-5 shrink-0 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setSearchQuery(event.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="Search"
            aria-label="Search"
            maxLength={100}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-zinc-500 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-200/80 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>
      </form>

      {loading ? (
        <LoadingRows />
      ) : !typed ? (
        recent.length === 0 && suggestions.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="Search Slabhold"
            detail={SEARCH_IDLE_DETAIL}
          />
        ) : (
          <div>
            <p className="px-4 pt-4 text-sm text-zinc-500">{SEARCH_IDLE_DETAIL}</p>
            {recent.length > 0 ? (
              <section>
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <h2 className="text-xl font-extrabold tracking-tight">Recent</h2>
                  <button
                    type="button"
                    onClick={clearRecent}
                    className="rounded-full px-2 py-1 text-sm font-medium text-sky-600 dark:text-sky-400"
                  >
                    Clear all
                  </button>
                </div>
                <ul>
                  {recent.map((term) => (
                    <li
                      key={term}
                      className="flex items-center border-b border-zinc-200 dark:border-white/10"
                    >
                      <button
                        type="button"
                        onClick={() => setSearchQuery(term)}
                        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 text-left"
                      >
                        <Clock className="h-5 w-5 shrink-0 text-zinc-400" />
                        <span className="truncate text-[15px]">{term}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => forget(term)}
                        aria-label={`Remove ${term}`}
                        className="mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {suggestions.length > 0 ? (
              <section>
                <h2 className="px-4 pt-4 pb-1 text-xl font-extrabold tracking-tight">Suggested</h2>
                <ul className="flex flex-wrap gap-2 px-4 pt-2 pb-4">
                  {suggestions.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => setSearchQuery(name)}
                        className="inline-flex min-h-11 items-center rounded-full bg-zinc-100 px-3 text-sm font-medium dark:bg-white/10"
                      >
                        {name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )
      ) : showMiss ? (
        <div>
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title={searchEmptyTitle(typed)}
            detail={addCardMiss ? "Try a name, @handle, a card, or words from a post." : undefined}
          >
            {addCardMiss ? (
              <Link
                href={addCardSearchHref(typed)}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7C3AED] px-4 text-sm font-semibold text-white"
              >
                {SEARCH_ADD_CARD_LABEL}
              </Link>
            ) : null}
          </EmptyState>
        </div>
      ) : (
        <div>
          {catalogLoading || catalogCards.length > 0 || catalogTrouble ? (
            <section aria-busy={catalogLoading} aria-live="polite">
              <h2 className="px-4 pt-4 pb-1 text-xl font-extrabold tracking-tight">Cards</h2>
              {catalogLoading ? <span className="sr-only">Searching cards</span> : null}
              {catalogTrouble ? <CatalogTrouble onRetry={retryCatalog} /> : null}
              {catalogLoading ? (
                <ul aria-hidden="true">
                  {Array.from({ length: 3 }, (_, row) => (
                    <li
                      key={row}
                      className="flex min-h-[4.5rem] items-center border-b border-zinc-200 px-4 py-3 dark:border-white/10"
                    >
                      <span className="min-w-0 flex-1 space-y-2">
                        <span className="block h-3.5 w-32 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
                        <span className="block h-3 w-48 max-w-full animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul>
                  {catalogCards.map((card) => {
                    const page = catalogSecondaryLink(card, {
                      ownCards: cards,
                      publicCards,
                      profiles,
                      blockedIds,
                    });
                    return (
                      <li
                        key={card.id}
                        className="flex min-h-[4.5rem] items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-white/10"
                      >
                        <div className="min-w-0 flex-1">
                          <ResolvedPlayerName
                            name={card.playerName}
                            sport={card.sport}
                            onClick={() => remember(typed)}
                            className="block truncate text-[15px] font-bold hover:underline"
                          />
                          <Link
                            href={catalogAddHref(card)}
                            onClick={() => remember(typed)}
                            className="block truncate text-sm text-zinc-500"
                          >
                            {catalogResultLine(card)}
                          </Link>
                        </div>
                        {page ? (
                          <Link
                            href={page.href}
                            onClick={() => remember(typed)}
                            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium text-sky-600 dark:text-sky-400"
                          >
                            {page.label}
                          </Link>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {visibleSections.includes("My cards") ? (
            <section>
              <h2 className="px-4 pt-4 pb-1 text-xl font-extrabold tracking-tight">My cards</h2>
              <ul>
                {matchedCards.map((card) => (
                  <li key={card.id} className="border-b border-zinc-200 dark:border-white/10">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Link href={`/cards/${card.id}`} onClick={() => remember(typed)} className="shrink-0">
                        <CardThumb card={card} className="h-14 w-11 shrink-0 rounded-lg" />
                      </Link>
                      <span className="min-w-0">
                        <ResolvedPlayerName
                          name={card.playerName}
                          sport={card.sport}
                          onClick={() => remember(typed)}
                          className="block truncate text-[15px] font-bold hover:underline"
                        />
                        <Link
                          href={`/cards/${card.id}`}
                          onClick={() => remember(typed)}
                          className="block"
                        >
                          <span className="block truncate text-sm text-zinc-500">{cardTitle(card)}</span>
                          <span className="block truncate text-xs text-zinc-500">{cardSubtitle(card)}</span>
                        </Link>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {visibleSections.includes("People") ? (
            <section>
              <h2 className="px-4 pt-4 pb-1 text-xl font-extrabold tracking-tight">People</h2>
              <ul>
                {people.map((profile) => (
                  <li key={profile.id} className="border-b border-zinc-200 dark:border-white/10">
                    <Link
                      href={user?.id === profile.id ? "/profile" : userHref(profile.username)}
                      onClick={() => remember(typed)}
                      className="flex min-h-14 items-center gap-3 px-4 py-3"
                    >
                      <Avatar
                        name={profile.displayName}
                        image={profile.avatarDataUrl}
                        accent={profile.accent}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold">
                          {profile.displayName}
                        </span>
                        <span className="block truncate text-sm text-zinc-500">
                          @{profile.username}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {visibleSections.includes("Posts") ? (
            <section>
              <h2 className="px-4 pt-4 pb-1 text-xl font-extrabold tracking-tight">Posts</h2>
              <ul>
                {matchedPosts.map((post) => {
                  const author = authors.get(post.authorId);
                  const name = author?.displayName ?? "Collector";
                  const username = author?.username ?? "user";
                  const stamp = timeAgo(post.createdAt);
                  return (
                    <li key={post.id} className="border-b border-zinc-200 dark:border-white/10">
                      <Link
                        href={`/posts/${post.id}`}
                        onClick={() => remember(typed)}
                        className="flex gap-3 px-4 py-3"
                      >
                        <Avatar
                          name={name}
                          image={author?.avatarDataUrl}
                          accent={author?.accent}
                          className="h-10 w-10 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-baseline gap-1 text-[15px]">
                            <span className="truncate font-bold">{name}</span>
                            <span className="truncate text-zinc-500">@{username}</span>
                            {stamp ? (
                              <span className="shrink-0 text-zinc-500">· {stamp}</span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 line-clamp-3 block text-[15px] leading-5 whitespace-pre-wrap">
                            {post.body}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </PullToRefresh>
  );
}

function CatalogTrouble({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-4 pt-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{CATALOG_SEARCH_TIMEOUT_MESSAGE}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 inline-flex min-h-11 items-center rounded-full bg-[#7C3AED] px-4 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
