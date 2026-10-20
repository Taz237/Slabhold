"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Tweet } from "@/components/tweet";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { signupPath } from "@/lib/auth/safe-next";
import {
  filterLoadedPostsForCard,
  loadPostsForCard,
  type CardPostsCursor,
} from "@/lib/social/card-posts";
import type { Post, Profile } from "@/lib/social/types";
import { collectAttachedCardIds } from "@/lib/social/post-card-value";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { useCardValues } from "@/lib/value/use-card-values";

const PAGE_LIMIT = 20;

export function CardPostsList({ cardId }: { cardId: string }) {
  const pathname = usePathname() || "/";
  const { user, posts: loadedPosts, profiles, publicCards, ready } = useSocial();
  const { cards } = useCollection();
  const [posts, setPosts] = useState<Post[]>([]);
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [cursor, setCursor] = useState<CardPostsCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const publicIds = useMemo(
    () => new Set(publicCards.map((card) => card.id)),
    [publicCards],
  );
  const attachedIds = useMemo(
    () => collectAttachedCardIds([...posts, ...relatedPosts]),
    [posts, relatedPosts],
  );
  const { values: cardValues, loading: cardValuesLoading } = useCardValues(attachedIds);
  const owned = cards.some((card) => card.id === cardId);
  const owner = publicCards.find((card) => card.id === cardId);
  const ownerProfile = profiles.find((profile) => profile.id === owner?.ownerId);
  const backHref =
    !owned && ownerProfile
      ? `/u/${ownerProfile.username}/cards/${cardId}`
      : `/cards/${cardId}`;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = createSupabaseBrowser();
      try {
        if (supabase) {
          const result = await loadPostsForCard(supabase, cardId, {
            limit: PAGE_LIMIT,
          });
          if (cancelled) return;
          if (result) {
            setPosts(result.posts);
            setRelatedPosts(result.relatedPosts);
            setAuthors(result.authors);
            setHasMore(result.hasMore);
            setCursor(result.nextCursor);
            return;
          }
        }
        const fallback = filterLoadedPostsForCard(
          loadedPosts,
          cardId,
          publicIds,
          PAGE_LIMIT,
          { publicCards },
        );
        if (cancelled) return;
        setPosts(fallback.posts);
        setRelatedPosts([]);
        setAuthors(profileMap);
        setHasMore(fallback.hasMore);
        setCursor(fallback.nextCursor);
      } catch {
        if (cancelled) return;
        const fallback = filterLoadedPostsForCard(
          loadedPosts,
          cardId,
          publicIds,
          PAGE_LIMIT,
          { publicCards },
        );
        setPosts(fallback.posts);
        setRelatedPosts([]);
        setAuthors(profileMap);
        setHasMore(fallback.hasMore);
        setCursor(fallback.nextCursor);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [cardId, loadedPosts, profileMap, publicCards, publicIds, ready]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const supabase = createSupabaseBrowser();
    try {
      if (supabase) {
        const result = await loadPostsForCard(supabase, cardId, {
          limit: PAGE_LIMIT,
          cursor,
        });
        if (result) {
          setPosts((prev) => mergePosts(prev, result.posts));
          setRelatedPosts((prev) => mergePosts(prev, result.relatedPosts));
          setAuthors((prev) => {
            const next = new Map(prev);
            for (const [id, profile] of result.authors) next.set(id, profile);
            return next;
          });
          setHasMore(result.hasMore);
          setCursor(result.nextCursor);
          return;
        }
      }
      const fallback = filterLoadedPostsForCard(
        loadedPosts,
        cardId,
        publicIds,
        PAGE_LIMIT,
        { publicCards, cursor },
      );
      setPosts((prev) => mergePosts(prev, fallback.posts));
      setHasMore(fallback.hasMore);
      setCursor(fallback.nextCursor);
    } catch {
      const fallback = filterLoadedPostsForCard(
        loadedPosts,
        cardId,
        publicIds,
        PAGE_LIMIT,
        { publicCards, cursor },
      );
      setPosts((prev) => mergePosts(prev, fallback.posts));
      setHasMore(fallback.hasMore);
      setCursor(fallback.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="-mx-4 -mt-5">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={backHref}
            aria-label="Back to card"
            className="grid h-9 w-9 place-items-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight">
              What collectors are saying
            </h1>
            <p className="text-xs text-zinc-500">Posts about this card</p>
          </div>
        </div>
        {user ? (
          <Link
            href={`/compose?card=${encodeURIComponent(cardId)}`}
            className="shrink-0 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white dark:bg-zinc-100 dark:text-zinc-950"
          >
            Post about this card
          </Link>
        ) : (
          <Link
            href={signupPath(pathname)}
            className="shrink-0 text-xs font-semibold text-violet-700 underline underline-offset-2 dark:text-violet-300"
          >
            Sign up to post
          </Link>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 px-4 py-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
            />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500">No posts yet. Be the first.</p>
      ) : (
        <div>
          {posts.map((post) => {
            const author =
              authors.get(post.authorId) ?? profileMap.get(post.authorId);
            if (!author) return null;
            return (
              <Tweet
                key={post.id}
                post={post}
                author={author}
                extraPosts={relatedPosts}
                extraProfiles={[...authors.values()]}
                cardValues={cardValues}
                cardValuesLoading={cardValuesLoading}
              />
            );
          })}
          {hasMore ? (
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="text-sm font-semibold text-violet-700 disabled:opacity-50 dark:text-violet-300"
              >
                {loadingMore ? "Loading…" : "See more"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function mergePosts(current: Post[], next: Post[]): Post[] {
  const seen = new Set(current.map((post) => post.id));
  const merged = [...current];
  for (const post of next) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    merged.push(post);
  }
  return merged;
}
