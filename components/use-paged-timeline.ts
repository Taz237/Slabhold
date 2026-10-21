"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FEED_PAGE_SIZE, type FeedCursor } from "@/lib/social/feed-page";
import { loadFeedPage, type FeedPageScope } from "@/lib/social/load-feed-page";
import type { TimelineItem } from "@/lib/social/timeline";
import type { Post, Profile } from "@/lib/social/types";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

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

export function usePagedTimeline(input: {
  enabled: boolean;
  scope: FeedPageScope;
  authorIds?: readonly string[];
  profileId?: string;
  viewerId: string | null;
  refreshKey: number;
  headToken?: string;
  rememberPosts?: (posts: Post[], profiles?: Profile[]) => void;
}) {
  const authorKey = input.authorIds?.join(",") ?? "";
  const scopeKey = [
    input.enabled ? "1" : "0",
    input.scope,
    input.profileId ?? "",
    authorKey,
    input.viewerId ?? "",
    String(input.refreshKey),
    input.headToken ?? "",
  ].join("|");

  const [page, setPage] = useState<PageState>(idle);
  const [loading, setLoading] = useState(input.enabled);
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

  const cursorRef = useRef<FeedCursor | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const epochRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const requestRef = useRef(input);
  const rememberRef = useRef(input.rememberPosts);

  useEffect(() => {
    requestRef.current = input;
    rememberRef.current = input.rememberPosts;
  }, [input]);

  useEffect(() => {
    const token = ++epochRef.current;
    cursorRef.current = null;
    seenRef.current = new Set();
    loadingMoreRef.current = false;
    const current = requestRef.current;
    if (!current.enabled) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
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
        rememberRef.current?.([...next.posts, ...next.relatedPosts], next.profiles);
      })
      .catch((reason: unknown) => {
        if (epochRef.current !== token) return;
        setPage(idle);
        setLoading(false);
        setError(reason instanceof Error ? reason.message : "Could not load posts.");
      });
  }, [scopeKey]);

  const loadMore = useCallback(() => {
    const current = requestRef.current;
    if (!current.enabled || loadingMoreRef.current || !cursorRef.current) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    const token = epochRef.current;
    const cursor = cursorRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
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
        if (epochRef.current !== token) return;
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
        rememberRef.current?.([...next.posts, ...next.relatedPosts], next.profiles);
      })
      .catch((reason: unknown) => {
        if (epochRef.current !== token) return;
        setError(reason instanceof Error ? reason.message : "Could not load posts.");
      })
      .finally(() => {
        if (epochRef.current !== token) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
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
  };
}

function mergeItems(current: TimelineItem[], next: TimelineItem[]) {
  const seen = new Set(current.map((item) => item.key));
  const merged = [...current];
  for (const item of next) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
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
