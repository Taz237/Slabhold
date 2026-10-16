"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Tweet } from "@/components/tweet";
import { useSocial } from "@/components/social-provider";
import {
  filterLoadedPostsForCard,
  loadPostsForCard,
} from "@/lib/social/card-posts";
import type { Post, Profile } from "@/lib/social/types";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const PAGE_LIMIT = 40;

export function CardPostsList({ cardId }: { cardId: string }) {
  const { user, posts: loadedPosts, profiles, publicCards, ready } = useSocial();
  const [posts, setPosts] = useState<Post[]>([]);
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const publicIds = useMemo(
    () => new Set(publicCards.map((card) => card.id)),
    [publicCards],
  );

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
          setPosts(result.posts);
          setRelatedPosts(result.relatedPosts);
          setAuthors(result.authors);
          return;
        }
        const fallback = filterLoadedPostsForCard(
          loadedPosts,
          cardId,
          publicIds,
          PAGE_LIMIT,
        );
        if (cancelled) return;
        setPosts(fallback.posts);
        setRelatedPosts([]);
        setAuthors(profileMap);
      } catch {
        if (cancelled) return;
        const fallback = filterLoadedPostsForCard(
          loadedPosts,
          cardId,
          publicIds,
          PAGE_LIMIT,
        );
        setPosts(fallback.posts);
        setRelatedPosts([]);
        setAuthors(profileMap);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [cardId, loadedPosts, profileMap, publicIds, ready]);

  return (
    <div className="-mx-4 -mt-5">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/cards/${cardId}`}
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
            href="/login"
            className="shrink-0 text-xs font-semibold text-violet-700 underline underline-offset-2 dark:text-violet-300"
          >
            Log in to post
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
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
