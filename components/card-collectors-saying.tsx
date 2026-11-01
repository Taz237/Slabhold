"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CARD_TALK_HEADING, CardTalkFrame, CardTalkSkeleton } from "@/components/card-talk-frame";
import { Tweet } from "@/components/tweet";
import { useSocial } from "@/components/social-provider";
import {
  filterLoadedPostsForCard,
  loadPostsForCard,
} from "@/lib/social/card-posts";
import type { Post, Profile } from "@/lib/social/types";
import { collectAttachedCardIds } from "@/lib/social/post-card-value";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { useCardValues } from "@/lib/value/use-card-values";

const PREVIEW_LIMIT = 5;

export function CardCollectorsSaying({
  cardId,
  heading = CARD_TALK_HEADING,
}: {
  cardId: string;
  heading?: string;
}) {
  const { homePosts: loadedPosts, profiles, publicCards, ready } = useSocial();
  const [posts, setPosts] = useState<Post[]>([]);
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = await loadSupabaseBrowser();
      try {
        if (supabase) {
          const result = await loadPostsForCard(supabase, cardId, {
            limit: PREVIEW_LIMIT,
          });
          if (cancelled) return;
          if (result) {
            setPosts(result.posts);
            setRelatedPosts(result.relatedPosts);
            setAuthors(result.authors);
            setHasMore(result.hasMore);
            return;
          }
        }
        const fallback = filterLoadedPostsForCard(
          loadedPosts,
          cardId,
          publicIds,
          PREVIEW_LIMIT,
          { publicCards },
        );
        if (cancelled) return;
        setPosts(fallback.posts);
        setRelatedPosts([]);
        setAuthors(profileMap);
        setHasMore(fallback.hasMore);
      } catch {
        if (cancelled) return;
        const fallback = filterLoadedPostsForCard(
          loadedPosts,
          cardId,
          publicIds,
          PREVIEW_LIMIT,
          { publicCards },
        );
        setPosts(fallback.posts);
        setRelatedPosts([]);
        setAuthors(profileMap);
        setHasMore(fallback.hasMore);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [cardId, loadedPosts, profileMap, publicCards, publicIds, ready]);

  return (
    <CardTalkFrame cardId={cardId} heading={heading} loading={loading}>
      {loading ? (
        <CardTalkSkeleton />
      ) : posts.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No posts yet. Be the first.</p>
      ) : (
        <div className="mt-3 -mx-4 border-t border-zinc-200 dark:border-white/10 sm:-mx-5">
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
              <Link
                href={`/cards/${cardId}/posts`}
                className="text-sm font-semibold text-violet-700 dark:text-violet-300"
              >
                See more
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </CardTalkFrame>
  );
}
