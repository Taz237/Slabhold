"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Clock, Search, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CardThumb } from "@/components/card-thumb";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { EmptyState, LoadingRows } from "@/components/status";
import { cardSubtitle, cardTitle, timeAgo } from "@/lib/format";
import type { SportsCard } from "@/lib/types";

const RECENT_KEY = "slabhold.search.recent.v1";
const RECENT_LIMIT = 8;

function cardSearchText(card: SportsCard) {
  return [card.playerName, String(card.year), card.setBrand, card.grade].join(" ").toLowerCase();
}

const recentListeners = new Set<() => void>();

function parseRecent(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function readRecentRaw() {
  return window.localStorage.getItem(RECENT_KEY) ?? "[]";
}

function writeRecent(items: string[]) {
  if (items.length === 0) window.localStorage.removeItem(RECENT_KEY);
  else window.localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, RECENT_LIMIT)));
  recentListeners.forEach((listener) => listener());
}

function useRecentSearches() {
  const raw = useSyncExternalStore(
    (listener) => {
      recentListeners.add(listener);
      return () => recentListeners.delete(listener);
    },
    readRecentRaw,
    () => "[]",
  );
  return useMemo(() => parseRecent(raw), [raw]);
}

function searchHref(term: string) {
  const trimmed = term.trim();
  if (!trimmed) return "/search";
  return `/search?q=${encodeURIComponent(trimmed)}`;
}

export function SearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const { ready: socialReady, profiles, homePosts, blockedIds, user } = useSocial();
  const { ready: cardsReady, cards } = useCollection();
  const [query, setQuery] = useState(urlQ);
  const recent = useRecentSearches();
  const typed = query.trim();
  const q = typed.toLowerCase().replace(/^@/, "");

  useEffect(() => {
    setQuery(urlQ);
  }, [urlQ]);

  function setSearchQuery(next: string) {
    setQuery(next);
    const href = searchHref(next);
    const current = searchHref(urlQ);
    if (href !== current) {
      router.replace(href, { scroll: false });
    }
  }

  const people = useMemo(() => {
    if (!q) return [];
    const hidden = new Set(blockedIds);
    return profiles
      .filter((profile) => !hidden.has(profile.id))
      .filter(
        (profile) =>
          profile.username.toLowerCase().includes(q) ||
          profile.displayName.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const score = (profile: { username: string; displayName: string }) => {
          const handle = profile.username.toLowerCase();
          const name = profile.displayName.toLowerCase();
          if (handle === q || name === q) return 0;
          if (handle.startsWith(q) || name.startsWith(q)) return 1;
          return 2;
        };
        return score(a) - score(b);
      });
  }, [blockedIds, profiles, q]);

  const matchedPosts = useMemo(() => {
    if (!q) return [];
    return homePosts.filter((post) => post.body.toLowerCase().includes(q));
  }, [homePosts, q]);

  const matchedCards = useMemo(() => {
    if (!q) return [];
    return cards.filter((card) => cardSearchText(card).includes(q));
  }, [cards, q]);

  const authors = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  function remember(term: string) {
    const next = term.trim();
    if (!next) return;
    const saved = [next, ...recent.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(
      0,
      RECENT_LIMIT,
    );
    writeRecent(saved);
  }

  function forget(term: string) {
    writeRecent(recent.filter((item) => item !== term));
  }

  function clearRecent() {
    writeRecent([]);
  }

  if (!socialReady || !cardsReady) {
    return (
      <div className="-mx-4 -mt-5">
        <LoadingRows />
      </div>
    );
  }

  const hasResults = people.length > 0 || matchedPosts.length > 0 || matchedCards.length > 0;

  return (
    <div className="-mx-4 -mt-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          remember(typed);
        }}
        className="sticky top-[3.6rem] z-10 border-b border-zinc-200 bg-[var(--background)] px-4 py-2.5 dark:border-white/10"
      >
        <label className="flex min-h-12 items-center gap-2 rounded-full bg-zinc-100 px-3 dark:bg-white/10">
          <Search className="h-5 w-5 shrink-0 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setSearchQuery(event.target.value)}
            autoFocus
            type="search"
            enterKeyHint="search"
            placeholder="Search"
            aria-label="Search"
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

      {!q ? (
        recent.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="Search Slabhold"
            detail="Find people and posts."
          />
        ) : (
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
                    className="mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : !hasResults ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title={`No results for "${typed}"`}
          detail="Try a name, @handle, or words from a post."
        />
      ) : (
        <div>
          <section>
            <h2 className="px-4 pt-4 pb-1 text-xl font-extrabold tracking-tight">People</h2>
            {people.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500">No matching people</p>
            ) : (
              <ul>
                {people.map((profile) => (
                  <li key={profile.id} className="border-b border-zinc-200 dark:border-white/10">
                    <Link
                      href={user?.id === profile.id ? "/profile" : `/u/${profile.username}`}
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
            )}
          </section>

          <section>
            <h2 className="px-4 pt-4 pb-1 text-xl font-extrabold tracking-tight">Posts</h2>
            {matchedPosts.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500">No matching posts</p>
            ) : (
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
            )}
          </section>

          {matchedCards.length > 0 ? (
            <section>
              <h2 className="px-4 pt-4 pb-1 text-xl font-extrabold tracking-tight">Cards</h2>
              <ul>
                {matchedCards.map((card) => (
                  <li key={card.id} className="border-b border-zinc-200 dark:border-white/10">
                    <Link
                      href={`/cards/${card.id}`}
                      onClick={() => remember(typed)}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <CardThumb card={card} className="h-14 w-11 shrink-0 rounded-lg" />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold">{card.playerName}</span>
                        <span className="block truncate text-sm text-zinc-500">{cardTitle(card)}</span>
                        <span className="block truncate text-xs text-zinc-500">{cardSubtitle(card)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
