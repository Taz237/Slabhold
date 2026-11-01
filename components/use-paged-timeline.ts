"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FEED_PAGE_SIZE, type FeedCursor } from "@/lib/social/feed-page";
import { fetchFreshHead, hasNewerItems, memoryFresh, mergeFreshPage } from "@/lib/social/feed-refresh";
import { loadFeedPage, type FeedPageScope } from "@/lib/social/load-feed-page";
import type { HomeSeedPage } from "@/lib/social/home-seed";
import type { TimelineItem } from "@/lib/social/timeline";
import type { Post, PostLike, Profile } from "@/lib/social/types";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

type PageState = {
  items: TimelineItem[];
  posts: Post[];
  relatedPosts: Post[];
  profiles: Profile[];
  hasMore: boolean;
  nextCursor: FeedCursor | null;
};

const idle: PageState = {
  items: [],
  posts: [],
  relatedPosts: [],
  profiles: [],
  hasMore: false,
  nextCursor: null,
};

type Remembered = { page: PageState; cursor: FeedCursor | null; seen: Set<string>; at: number };

/**
 * Timelines you just left, so Back draws the same posts at once and the
 * scroll can land exactly where you were. Lives for this tab session only.
 */
const remembered = new Map<string, Remembered>();

/** Server pages already drawn by a mount (see HomeSeedPage.token). */
const drawnSeeds = new Set<string>();
const REMEMBER_LIMIT = 8;
/** The quiet "anything newer?" read on return only needs the top few rows. */
const NEWER_CHECK_LIMIT = 5;

/** The post behind a row, so one post never shows twice (as itself and as a repost). */
const postIdOf = (item: TimelineItem) => item.post.id;

/** The error line for a failed read (or a failed supabase-js load). */
const loadError = (reason: unknown) => (reason instanceof Error ? reason.message : "Could not load posts.");

function recall(key: string): Remembered | null {
  const saved = remembered.get(key);
  if (!saved) return null;
  if (!memoryFresh(saved.at, Date.now())) {
    remembered.delete(key);
    return null;
  }
  return saved;
}

function remember(key: string, saved: Remembered) {
  remembered.delete(key);
  remembered.set(key, saved);
  while (remembered.size > REMEMBER_LIMIT) {
    const oldest = remembered.keys().next().value;
    if (oldest === undefined) break;
    remembered.delete(oldest);
  }
}

export function usePagedTimeline(input: {
  enabled: boolean;
  scope: FeedPageScope;
  authorIds?: readonly string[];
  profileId?: string;
  viewerId: string | null;
  refreshKey: number;
  /** Changing either list reloads page 1 so a new block or mute leaves the feed. */
  blockedIds?: readonly string[];
  mutedIds?: readonly string[];
  rememberPosts?: (posts: Post[], profiles?: Profile[], likes?: PostLike[] | null) => void;
  /** Page 1 read on the server for this request. Drawn at once instead of loading it again. */
  initial?: HomeSeedPage | null;
}) {
  const authorKey = input.authorIds?.join(",") ?? "";
  const memoryKey = [
    input.enabled ? "1" : "0",
    input.scope,
    input.profileId ?? "",
    authorKey,
    input.viewerId ?? "",
    [...(input.blockedIds ?? [])].sort().join(","),
    [...(input.mutedIds ?? [])].sort().join(","),
  ].join("|");
  const scopeKey = `${memoryKey}|${input.refreshKey}`;

  // Coming back to a timeline within a few minutes: draw it from memory.
  // Otherwise the page the server read for this request, if there is one.
  const [restored] = useState(() => (input.enabled ? (recall(memoryKey) ?? fromInitial(input.initial)) : null));
  const [seededPage] = useState(() => (restored && input.initial && restored.page.items === input.initial.items ? input.initial : null));
  const [page, setPage] = useState<PageState>(() => restored?.page ?? idle);
  const [loading, setLoading] = useState(input.enabled && !restored);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState(scopeKey);
  if (loadedKey !== scopeKey) {
    setLoadedKey(scopeKey);
    setPage(idle);
    setLoading(input.enabled);
    setLoadingMore(false);
    setError(null);
  }

  const cursorRef = useRef<FeedCursor | null>(restored?.cursor ?? null);
  const seenRef = useRef<Set<string>>(restored ? new Set(restored.seen) : new Set());
  const restoredKey = useRef<string | null>(restored ? scopeKey : null);
  const epochRef = useRef(0);
  const loadingMoreRef = useRef(false);
  /** Bumps when a refresh replaces the older pages, so a load-more already in flight is dropped. */
  const headGenRef = useRef(0);
  const pageRef = useRef(page);
  const requestRef = useRef(input);
  const rememberRef = useRef(input.rememberPosts);

  useEffect(() => {
    requestRef.current = input;
    rememberRef.current = input.rememberPosts;
  }, [input]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // A server-read page joins the provider's posts the same way a loaded one does,
  // and is spent: a later mount with the same payload loads fresh.
  useEffect(() => {
    if (!seededPage) return;
    drawnSeeds.add(seededPage.token);
    rememberRef.current?.([...seededPage.posts, ...seededPage.relatedPosts], seededPage.profiles, seededPage.likes);
  }, [seededPage]);

  useEffect(() => {
    const token = ++epochRef.current;
    // Drawn from memory: keep it. A refresh or a new scope loads as usual.
    if (restoredKey.current === scopeKey) return;
    restoredKey.current = null;
    cursorRef.current = null;
    seenRef.current = new Set();
    loadingMoreRef.current = false;
    const current = requestRef.current;
    if (!current.enabled) return;
    void loadSupabaseBrowser().then((supabase) => {
      if (!supabase || epochRef.current !== token) return;
      void loadFeedPage(supabase, {
        scope: current.scope,
        viewerId: current.viewerId,
        authorIds: current.authorIds,
        profileId: current.profileId,
        cursor: null,
        limit: FEED_PAGE_SIZE,
      })
        .then((next) => {
          if (epochRef.current !== token) return;
          cursorRef.current = next.nextCursor;
          seenRef.current = new Set(next.items.map((item) => item.post.id));
          setPage(next);
          setLoading(false);
          rememberRef.current?.(
            [...next.posts, ...next.relatedPosts],
            next.profiles,
            next.likes,
          );
        })
        .catch((reason: unknown) => {
          if (epochRef.current !== token) return;
          setPage(idle);
          setLoading(false);
          setError(loadError(reason));
        });
    })
      .catch((reason: unknown) => {
        // supabase-js itself failed to load: settle instead of loading forever.
        if (epochRef.current !== token) return;
        setPage(idle);
        setLoading(false);
        setError(loadError(reason));
      });
  }, [scopeKey]);

  useEffect(() => {
    if (!input.enabled || loading || page.items.length === 0) return;
    remember(memoryKey, {
      page,
      cursor: cursorRef.current,
      seen: new Set(seenRef.current),
      at: Date.now(),
    });
  }, [input.enabled, loading, memoryKey, page]);

  /**
   * Pull to refresh: fetch the newest pages again and lay them over the list
   * on screen. The list never empties, so nothing jumps while it loads.
   */
  const refresh = useCallback(async () => {
    const current = requestRef.current;
    if (!current.enabled) return;
    const token = epochRef.current;
    try {
      const supabase = await loadSupabaseBrowser();
      if (!supabase || epochRef.current !== token) return;
      // Reads on until it reaches the head already loaded, so no posts go
      // missing between the new head and the older pages.
      const next = await fetchFreshHead({
        current: pageRef.current,
        idOf: postIdOf,
        fetchPage: async (cursor, seenPostIds) => {
          const read = await loadFeedPage(supabase, {
            scope: current.scope,
            viewerId: current.viewerId,
            authorIds: current.authorIds,
            profileId: current.profileId,
            cursor,
            seenPostIds,
            limit: FEED_PAGE_SIZE,
          });
          if (epochRef.current === token) {
            rememberRef.current?.([...read.posts, ...read.relatedPosts], read.profiles, read.likes);
          }
          return read;
        },
      });
      if (epochRef.current !== token) return;
      setPage((existing) => {
        const merged = mergeFreshPage(existing, next, postIdOf);
        // No overlap: the older pages were dropped and the cursor restarts
        // below the new head. A load-more from the old cursor would leave a hole.
        if (!merged.kept) headGenRef.current += 1;
        cursorRef.current = merged.page.nextCursor;
        seenRef.current = new Set(merged.page.items.map(postIdOf));
        return merged.page;
      });
      setLoading(false);
      setError(null);
    } catch (reason: unknown) {
      if (epochRef.current !== token) return;
      setError(loadError(reason));
    }
  }, []);

  const loadMore = useCallback(() => {
    const current = requestRef.current;
    if (!current.enabled || loadingMoreRef.current || !cursorRef.current) return;
    const token = epochRef.current;
    const gen = headGenRef.current;
    const cursor = cursorRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    void loadSupabaseBrowser().then((supabase) => {
      if (epochRef.current !== token) return;
      if (!supabase) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
        return;
      }
      void loadFeedPage(supabase, {
        scope: current.scope,
        viewerId: current.viewerId,
        authorIds: current.authorIds,
        profileId: current.profileId,
        cursor,
        seenPostIds: seenRef.current,
        limit: FEED_PAGE_SIZE,
      })
        .then((next) => {
          if (epochRef.current !== token || headGenRef.current !== gen) return;
          cursorRef.current = next.nextCursor;
          for (const item of next.items) seenRef.current.add(item.post.id);
          setPage((existing) => ({
            items: mergeItems(existing.items, next.items),
            posts: mergePosts(existing.posts, next.posts),
            relatedPosts: mergePosts(existing.relatedPosts, next.relatedPosts),
            profiles: mergeProfiles(existing.profiles, next.profiles),
            hasMore: next.hasMore,
            nextCursor: next.nextCursor,
          }));
          rememberRef.current?.(
            [...next.posts, ...next.relatedPosts],
            next.profiles,
            next.likes,
          );
        })
        .catch((reason: unknown) => {
          if (epochRef.current !== token) return;
          setError(loadError(reason));
        })
        .finally(() => {
          if (epochRef.current !== token) return;
          loadingMoreRef.current = false;
          setLoadingMore(false);
        });
    })
      .catch((reason: unknown) => {
        // supabase-js itself failed to load: let Load more try again.
        if (epochRef.current !== token) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
        setError(loadError(reason));
      });
  }, []);

  /**
   * Back on the timeline: is anything newer than the loaded head? Reads the
   * top few rows only and changes nothing on screen.
   */
  const checkNewer = useCallback(async (): Promise<boolean> => {
    const current = requestRef.current;
    if (!current.enabled || pageRef.current.items.length === 0) return false;
    const token = epochRef.current;
    try {
      const supabase = await loadSupabaseBrowser();
      if (!supabase || epochRef.current !== token) return false;
      const next = await loadFeedPage(supabase, {
        scope: current.scope,
        viewerId: current.viewerId,
        authorIds: current.authorIds,
        profileId: current.profileId,
        cursor: null,
        limit: NEWER_CHECK_LIMIT,
      });
      if (epochRef.current !== token) return false;
      return hasNewerItems(
        pageRef.current.items.map((item) => item.key),
        next.items.map((item) => item.key),
      );
    } catch {
      return false;
    }
  }, []);

  return {
    items: page.items,
    posts: page.posts,
    relatedPosts: page.relatedPosts,
    profiles: page.profiles,
    hasMore: page.hasMore,
    loading: input.enabled && loading,
    loadingMore,
    error,
    loadMore,
    refresh,
    checkNewer,
    /** True when this mount drew the timeline from memory instead of loading it. */
    restored: Boolean(restored),
    /** Drawn from what this tab saw before (Back), not from the server's first page. */
    fromMemory: Boolean(restored) && !seededPage,
  };
}

function fromInitial(initial: HomeSeedPage | null | undefined): Remembered | null {
  if (!initial || initial.items.length === 0 || drawnSeeds.has(initial.token)) return null;
  return {
    page: {
      items: initial.items,
      posts: initial.posts,
      relatedPosts: initial.relatedPosts,
      profiles: initial.profiles,
      hasMore: initial.hasMore,
      nextCursor: initial.nextCursor,
    },
    cursor: initial.nextCursor,
    seen: new Set(initial.items.map((item) => item.post.id)),
    at: Date.now(),
  };
}

function mergeItems(current: TimelineItem[], next: TimelineItem[]) {
  const seen = new Set(current.map((item) => item.key));
  const seenPosts = new Set(current.map(postIdOf));
  const merged = [...current];
  for (const item of next) {
    if (seen.has(item.key) || seenPosts.has(item.post.id)) continue;
    seen.add(item.key);
    seenPosts.add(item.post.id);
    merged.push(item);
  }
  return merged;
}

function mergePosts(current: Post[], next: Post[]) {
  const seen = new Set(current.map((post) => post.id));
  const merged = [...current];
  for (const post of next) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    merged.push(post);
  }
  return merged;
}

function mergeProfiles(current: Profile[], next: Profile[]) {
  const seen = new Map(current.map((profile) => [profile.id, profile]));
  for (const profile of next) seen.set(profile.id, profile);
  return [...seen.values()];
}
